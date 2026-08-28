// 상담 화면 — 스테이지 + 드로잉 + 필름스트립 + 세션 저장/전송
const S = {
  assetId: parseInt(location.pathname.split('/').pop()),
  asset: null,          // 현재 자료
  related: [],          // 같은 카테고리 필름스트립
  subIndex: 0,          // steps/progression 내부 인덱스
  session: { id: null, patient_label: '', slides: {} }, // slides: {assetId: {drawing_png, note}}
  panelOpen: window.innerWidth >= 1024,
  drawings: {},         // assetId -> dataURL (로컬 캐시)
  tool: 'pen', color: '#ef4444', size: 4,
  zoom: 1, panX: 0, panY: 0,
}

async function init() {
  await PC.loadMe()
  try {
    const { data } = await axios.get(`/api/assets/${S.assetId}`)
    S.asset = data.asset
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="min-h-screen flex flex-col items-center justify-center text-white gap-4">
      <p class="text-xl font-bold">${e.response?.data?.error || '자료를 불러올 수 없습니다'}</p>
      <a href="/" class="px-6 py-3 btn-primary rounded-xl font-bold inline-flex items-center">라이브러리로</a></div>`
    return
  }
  render()
  loadRelated()
}

async function loadRelated() {
  const { data } = await axios.get('/api/assets', { params: { treatment: S.asset.treatment_id || 'all', category: S.asset.category } })
  S.related = data.assets
  renderFilmstrip()
}

// ==================== 렌더 ====================
function render() {
  const a = S.asset
  const u = PC.user
  document.getElementById('app').innerHTML = `
  <div class="h-screen flex flex-col select-none">
    <!-- 상단 바 -->
    <header class="glass-strong shrink-0 z-30">
      <div class="px-3 sm:px-5 h-[68px] flex items-center gap-3">
        <a href="/" class="btn-touch flex items-center justify-center w-12 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition"><i class="fas fa-arrow-left text-lg"></i></a>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2.5">
            <span class="clinic-title text-xl font-black truncate">${PC.esc(u?.clinic_name || '페이션트 커넥트')}</span>
            <span class="hidden sm:inline text-slate-600 text-[10px] font-bold tracking-[0.28em] uppercase">Consult</span>
          </div>
          <h1 class="text-slate-300 font-bold truncate text-[14px] leading-tight">${PC.esc(a.title)}</h1>
        </div>
        ${u?.clinic_id ? `
        <button onclick="saveSession(false)" class="btn-touch btn-ghost hidden sm:flex items-center gap-2 px-4 rounded-xl"><i class="fas fa-floppy-disk"></i>상담 저장</button>
        <button onclick="sendToPatient()" class="btn-touch btn-primary flex items-center gap-2 px-4 sm:px-5 rounded-xl"><i class="fas fa-paper-plane"></i><span class="hidden sm:inline">환자에게 전송</span></button>
        ` : `<a href="/login" class="btn-touch btn-primary flex items-center gap-2 px-4 rounded-xl"><i class="fas fa-lock"></i><span class="hidden sm:inline">로그인 후 전송</span></a>`}
        <button onclick="toggleFullscreen()" class="btn-touch hidden sm:flex items-center justify-center w-12 rounded-xl text-slate-300 hover:bg-white/10 transition"><i class="fas fa-expand text-lg"></i></button>
        <button onclick="togglePanel()" class="btn-touch flex items-center justify-center w-12 rounded-xl text-slate-300 hover:bg-white/10 transition"><i class="fas fa-sidebar fa-table-columns text-lg"></i></button>
      </div>
    </header>

    <div class="flex-1 flex min-h-0">
      <!-- 스테이지 영역 -->
      <main class="flex-1 flex flex-col min-w-0">
        <div id="stage-wrap" class="relative flex-1 min-h-0" style="background:radial-gradient(ellipse 70% 55% at 50% 40%, #0c1524 0%, #060a12 100%)">
          <div id="stage" class="absolute inset-0 flex items-center justify-center overflow-hidden"></div>
          <canvas id="draw-canvas" class="absolute inset-0 w-full h-full z-10"></canvas>
          <!-- 드로잉 툴바 -->
          <div id="toolbar" class="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 glass-dark rounded-2xl px-3 py-2 flex items-center gap-1.5 shadow-2xl border border-white/10 max-w-[calc(100%-1rem)] overflow-x-auto"></div>
          <!-- 서브 내비 (steps/progression) -->
          <div id="subnav" class="absolute left-1/2 -translate-x-1/2 top-4 z-20"></div>
        </div>
        <!-- 필름스트립 -->
        <div class="shrink-0 glass-dark border-t border-white/10">
          <div id="filmstrip" class="filmstrip flex gap-2.5 px-4 py-3 overflow-x-auto dark-scroll"></div>
        </div>
      </main>

      <!-- 우측 패널 -->
      <aside id="side-panel" class="${S.panelOpen ? '' : 'hidden'} w-[340px] shrink-0 glass overflow-y-auto dark-scroll"></aside>
    </div>
  </div>

  <!-- 전송 모달 -->
  <div id="send-modal" class="hidden fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"></div>`

  renderStage()
  renderToolbar()
  renderPanel()
  renderFilmstrip()
  initCanvas()
}

// ==================== 스테이지 타입별 렌더 ====================
function currentImage() {
  const a = S.asset, p = a.payload || {}
  if (a.type === 'steps' && p.steps) return p.steps[S.subIndex]?.image
  if (a.type === 'progression' && p.stages) return p.stages[S.subIndex]?.image
  return a.media_urls?.[0]
}

function renderStage() {
  const a = S.asset, p = a.payload || {}
  const stage = document.getElementById('stage')
  S.zoom = 1; S.panX = 0; S.panY = 0

  if (a.type === 'video') {
    stage.innerHTML = `<video id="stage-video" src="${a.media_urls[0]}" class="max-w-full max-h-full" controls playsinline loop></video>`
    renderSubnav('')
  } else if (a.type === 'compare') {
    const before = p.before || a.media_urls[0], after = p.after || a.media_urls[1]
    stage.innerHTML = `
    <div class="compare-wrap w-full h-full max-w-[1100px] max-h-full mx-auto" id="compare-box" style="--split:50%">
      <img src="${before}" class="absolute inset-0 w-full h-full object-contain" draggable="false">
      <div class="compare-after"><img src="${after}" class="absolute inset-0 w-full h-full object-contain" draggable="false"></div>
      <div class="compare-handle"><div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-12 h-12 rounded-full bg-white shadow-xl flex items-center justify-center"><i class="fas fa-arrows-left-right text-slate-700"></i></div></div>
      <span class="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/60 text-white font-bold">Before</span>
      <span class="absolute top-4 right-4 px-3 py-1.5 rounded-lg font-bold text-white" style="background:linear-gradient(135deg,rgba(20,184,166,.9),rgba(14,165,233,.9))">After</span>
    </div>`
    initCompare()
    renderSubnav('')
  } else if (a.type === 'cost') {
    const rows = p.rows || []
    stage.innerHTML = `
    <div class="w-full h-full overflow-auto dark-scroll flex items-start justify-center p-4 sm:p-8">
      <div class="print-area w-full max-w-[900px] bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div class="px-8 py-6" style="background:linear-gradient(120deg,#0f766e,#0284c7)">
          <p class="text-teal-100 font-bold text-sm">${PC.esc(PC.user?.clinic_name || '페이션트 커넥트')}</p>
          <h2 class="text-white text-2xl font-extrabold mt-0.5">${PC.esc(a.title)}</h2>
        </div>
        <table class="w-full consult-text">
          <thead><tr class="bg-slate-50 text-slate-500 text-base">
            <th class="text-left px-8 py-4 font-bold">항목</th><th class="text-right px-4 py-4 font-bold">비용</th><th class="text-center px-4 py-4 font-bold">보험</th><th class="text-left px-6 py-4 font-bold hidden sm:table-cell">비고</th>
          </tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr class="${i % 2 ? 'bg-slate-50/60' : ''} border-t border-slate-100">
              <td class="px-8 py-4 font-bold text-slate-800">${PC.esc(r.item)}</td>
              <td class="px-4 py-4 text-right font-extrabold text-teal-700 whitespace-nowrap">${PC.esc(r.price)}</td>
              <td class="px-4 py-4 text-center"><span class="px-2.5 py-1 rounded-full text-sm font-bold ${r.insurance === '급여' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${PC.esc(r.insurance)}</span></td>
              <td class="px-6 py-4 text-slate-500 text-base hidden sm:table-cell">${PC.esc(r.note || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${p.note ? `<p class="px-8 py-5 text-slate-400 text-sm border-t border-slate-100">${PC.esc(p.note)}</p>` : ''}
      </div>
    </div>`
    renderSubnav(`<button onclick="window.print()" class="no-print btn-touch px-4 rounded-xl glass-dark text-white font-semibold border border-white/10"><i class="fas fa-print mr-2"></i>A4 출력</button>`)
  } else if (a.type === 'faq') {
    stage.innerHTML = `
    <div class="w-full h-full flex items-center justify-center p-6">
      <div class="max-w-[800px] w-full">
        <div class="grad-border rounded-3xl"><div class="glass-strong rounded-3xl p-8 sm:p-12">
          <p class="grad-text font-extrabold text-lg"><i class="fas fa-circle-question mr-2 text-teal-300"></i>자주 묻는 질문</p>
          <h2 class="mt-3 text-2xl sm:text-4xl font-extrabold text-white leading-snug">${PC.esc(p.question || a.title)}</h2>
          <p class="mt-6 consult-text text-slate-300 sm:text-2xl sm:leading-relaxed">${PC.esc(p.answer || a.description || '')}</p>
          ${a.reviewer_name ? `<p class="mt-8 text-teal-300 font-bold"><i class="fas fa-user-doctor mr-1.5"></i>감수 · ${PC.esc(a.reviewer_name)}</p>` : ''}
        </div></div>
      </div>
    </div>`
    renderSubnav('')
  } else if (a.type === 'steps' || a.type === 'progression') {
    const items = a.type === 'steps' ? (p.steps || []) : (p.stages || [])
    const it = items[S.subIndex] || {}
    stage.innerHTML = `<img id="stage-img" src="${it.image}" class="max-w-full max-h-full object-contain" draggable="false">`
    const isProg = a.type === 'progression'
    renderSubnav(`
    <div class="glass-dark rounded-2xl px-3 py-2 flex items-center gap-2 border border-white/10 shadow-2xl">
      <button onclick="subMove(-1)" class="btn-touch w-11 rounded-xl text-white hover:bg-white/10 flex items-center justify-center"><i class="fas fa-chevron-left"></i></button>
      <div class="flex items-center gap-1.5">
        ${items.map((x, i) => `<button onclick="subGo(${i})" class="btn-touch min-w-[44px] px-2 rounded-xl font-extrabold text-sm transition ${i === S.subIndex ? (isProg ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/40' : 'btn-primary') : 'text-slate-400 hover:text-white hover:bg-white/10'}">${isProg ? (x.label || i + 1) : (i + 1)}</button>`).join('')}
      </div>
      <button onclick="subMove(1)" class="btn-touch w-11 rounded-xl text-white hover:bg-white/10 flex items-center justify-center"><i class="fas fa-chevron-right"></i></button>
    </div>
    <div class="mt-2 mx-auto max-w-[640px] glass-dark rounded-2xl px-5 py-3 border border-white/10 text-center">
      <p class="text-white font-extrabold text-lg">${PC.esc(it.title || '')}</p>
      <p class="text-slate-300 text-[15px] mt-0.5 leading-relaxed">${PC.esc(it.desc || '')}</p>
    </div>`)
    initPinchZoom()
  } else {
    // image
    stage.innerHTML = `<img id="stage-img" src="${a.media_urls?.[0] || PC.thumbOf(a)}" class="max-w-full max-h-full object-contain" draggable="false">
    ${a.description ? `<div class="absolute bottom-20 left-1/2 -translate-x-1/2 max-w-[720px] w-[calc(100%-2rem)] glass-dark rounded-2xl px-5 py-3 border border-white/10 text-center pointer-events-none"><p class="text-white consult-text">${PC.esc(a.description)}</p></div>` : ''}`
    renderSubnav(`
    <div class="glass-dark rounded-2xl px-2 py-1.5 flex items-center gap-1 border border-white/10">
      <button onclick="zoomBy(1.3)" class="btn-touch w-11 rounded-xl text-white hover:bg-white/10"><i class="fas fa-magnifying-glass-plus"></i></button>
      <button onclick="zoomBy(1/1.3)" class="btn-touch w-11 rounded-xl text-white hover:bg-white/10"><i class="fas fa-magnifying-glass-minus"></i></button>
      <button onclick="zoomReset()" class="btn-touch px-3 rounded-xl text-white hover:bg-white/10 text-sm font-bold">100%</button>
    </div>`)
    initPinchZoom()
  }
  restoreDrawing()
}

function renderSubnav(html) { document.getElementById('subnav').innerHTML = html }

window.subMove = (d) => { const items = itemsOf(); S.subIndex = Math.max(0, Math.min(items.length - 1, S.subIndex + d)); persistDrawing(); renderStage() }
window.subGo = (i) => { persistDrawing(); S.subIndex = i; renderStage() }
function itemsOf() { const p = S.asset.payload || {}; return S.asset.type === 'steps' ? (p.steps || []) : (p.stages || []) }

// 이미지 줌
function applyZoom() {
  const img = document.getElementById('stage-img')
  if (img) img.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`
}
window.zoomBy = (f) => { S.zoom = Math.max(0.5, Math.min(6, S.zoom * f)); applyZoom() }
window.zoomReset = () => { S.zoom = 1; S.panX = 0; S.panY = 0; applyZoom() }

function initPinchZoom() {
  const stage = document.getElementById('stage')
  let pointers = new Map(), lastDist = 0
  stage.addEventListener('pointerdown', (e) => { if (S.tool !== 'move') return; pointers.set(e.pointerId, e) })
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, e)
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      if (lastDist) S.zoom = Math.max(0.5, Math.min(6, S.zoom * dist / lastDist))
      lastDist = dist; applyZoom()
    } else if (pointers.size === 1 && S.zoom > 1) {
      S.panX += e.clientX - prev.clientX; S.panY += e.clientY - prev.clientY; applyZoom()
    }
  })
  const up = (e) => { pointers.delete(e.pointerId); lastDist = 0 }
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up)
}

// 비교 슬라이더
function initCompare() {
  const box = document.getElementById('compare-box')
  let dragging = false, hoverAuto = false
  const setSplit = (clientX) => {
    const r = box.getBoundingClientRect()
    const pct = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))
    box.style.setProperty('--split', pct + '%')
  }
  box.addEventListener('pointerdown', (e) => { dragging = true; setSplit(e.clientX); box.setPointerCapture(e.pointerId) })
  box.addEventListener('pointermove', (e) => { if (dragging) setSplit(e.clientX); else if (hoverAuto && e.pointerType === 'mouse') setSplit(e.clientX) })
  box.addEventListener('pointerup', () => dragging = false)
  // 탭 토글
  let lastTap = 0
  box.addEventListener('click', (e) => {
    const now = Date.now()
    if (now - lastTap < 350) {
      const cur = parseFloat(box.style.getPropertyValue('--split'))
      box.style.setProperty('--split', cur > 50 ? '2%' : '98%')
    }
    lastTap = now
  })
}

// ==================== 드로잉 캔버스 ====================
const COLORS = [['#ef4444', '빨강'], ['#3b82f6', '파랑'], ['#facc15', '노랑'], ['#ffffff', '흰색']]
let ctx, canvas, drawing = false, strokes = [], redoStack = [], curStroke = null, startPt = null, snapshot = null

function drawKey() { return `${S.assetId}:${S.subIndex}` }

function initCanvas() {
  canvas = document.getElementById('draw-canvas')
  ctx = canvas.getContext('2d')
  resizeCanvas()
  window.addEventListener('resize', () => { const img = canvas.toDataURL(); resizeCanvas(); drawFromURL(img) })

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
}

function resizeCanvas() {
  const wrap = document.getElementById('stage-wrap')
  canvas.width = wrap.clientWidth * devicePixelRatio
  canvas.height = wrap.clientHeight * devicePixelRatio
  canvas.style.width = wrap.clientWidth + 'px'
  canvas.style.height = wrap.clientHeight + 'px'
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
}

function pt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 } }

function onDown(e) {
  if (S.tool === 'move') { canvas.style.pointerEvents = 'none'; return }
  e.preventDefault()
  canvas.setPointerCapture(e.pointerId)
  drawing = true; startPt = pt(e); redoStack = []
  snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height)
  if (S.tool === 'pen' || S.tool === 'hl' || S.tool === 'eraser') {
    curStroke = [startPt]
  } else if (S.tool === 'text') {
    drawing = false
    const text = prompt('입력할 텍스트')
    if (text) {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
      ctx.font = '800 26px Pretendard, sans-serif'
      ctx.fillStyle = S.color
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 5
      ctx.strokeText(text, startPt.x, startPt.y)
      ctx.fillText(text, startPt.x, startPt.y)
      commitHistory()
    }
  }
}

function onMove(e) {
  if (!drawing) return
  e.preventDefault()
  const p = pt(e)
  if (S.tool === 'pen' || S.tool === 'hl' || S.tool === 'eraser') {
    curStroke.push(p)
    drawStrokeSegment(curStroke)
  } else if (S.tool === 'arrow' || S.tool === 'circle') {
    ctx.putImageData(snapshot, 0, 0)
    if (S.tool === 'arrow') drawArrow(startPt, p)
    else drawEllipse(startPt, p)
  }
}

function onUp(e) {
  if (!drawing) return
  drawing = false
  commitHistory()
  persistDrawing()
}

function setupStroke() {
  ctx.strokeStyle = S.color
  if (S.tool === 'hl') { ctx.globalAlpha = 0.35; ctx.lineWidth = 16; ctx.globalCompositeOperation = 'source-over' }
  else if (S.tool === 'eraser') { ctx.globalAlpha = 1; ctx.lineWidth = 28; ctx.globalCompositeOperation = 'destination-out' }
  else { ctx.globalAlpha = 1; ctx.lineWidth = S.size; ctx.globalCompositeOperation = 'source-over' }
}

function drawStrokeSegment(stroke) {
  if (stroke.length < 2) return
  setupStroke()
  const n = stroke.length
  ctx.beginPath()
  ctx.moveTo(stroke[n - 2].x, stroke[n - 2].y)
  ctx.lineTo(stroke[n - 1].x, stroke[n - 1].y)
  ctx.stroke()
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
}

function drawArrow(a, b) {
  setupStroke(); ctx.lineWidth = Math.max(S.size, 4)
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
  const ang = Math.atan2(b.y - a.y, b.x - a.x), len = 18
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - len * Math.cos(ang - 0.45), b.y - len * Math.sin(ang - 0.45))
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - len * Math.cos(ang + 0.45), b.y - len * Math.sin(ang + 0.45))
  ctx.stroke()
}

function drawEllipse(a, b) {
  setupStroke(); ctx.lineWidth = Math.max(S.size, 4)
  ctx.beginPath()
  ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2)
  ctx.stroke()
}

let history = []
function commitHistory() {
  history.push(canvas.toDataURL())
  if (history.length > 30) history.shift()
}

window.undoDraw = () => {
  if (!history.length) return
  history.pop()
  const prev = history[history.length - 1]
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (prev) drawFromURL(prev)
  persistDrawing()
}

window.clearDraw = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  history = []
  persistDrawing()
}

function drawFromURL(url) {
  const img = new Image()
  img.onload = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.restore() }
  img.src = url
}

function persistDrawing() {
  if (!canvas) return
  // 빈 캔버스 체크
  const blank = document.createElement('canvas')
  blank.width = canvas.width; blank.height = canvas.height
  S.drawings[drawKey()] = canvas.toDataURL() === blank.toDataURL() ? null : canvas.toDataURL('image/png')
}

function restoreDrawing() {
  if (!ctx) return
  history = []
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore()
  const saved = S.drawings[drawKey()]
  if (saved) { drawFromURL(saved); history.push(saved) }
}

// ==================== 툴바 ====================
const TOOLS = [
  ['move', 'fa-hand', '이동/줌'],
  ['pen', 'fa-pen', '펜'],
  ['hl', 'fa-highlighter', '형광펜'],
  ['arrow', 'fa-arrow-right-long', '화살표'],
  ['circle', 'fa-circle-notch', '동그라미'],
  ['text', 'fa-font', '텍스트'],
  ['eraser', 'fa-eraser', '지우개'],
]

function renderToolbar() {
  const tb = document.getElementById('toolbar')
  tb.innerHTML = `
    ${TOOLS.map(([key, icon, label]) => `
      <button onclick="setTool('${key}')" title="${label}" class="btn-touch w-12 rounded-xl flex items-center justify-center text-lg transition ${S.tool === key ? 'btn-primary' : 'text-slate-400 hover:text-white hover:bg-white/10'}"><i class="fas ${icon}"></i></button>`).join('')}
    <div class="w-px h-8 bg-white/15 mx-1"></div>
    ${COLORS.map(([c, name]) => `
      <button onclick="setColor('${c}')" title="${name}" class="btn-touch w-11 rounded-xl flex items-center justify-center transition ${S.color === c ? 'bg-white/15' : 'hover:bg-white/10'}">
        <span class="w-6 h-6 rounded-full border-2 ${S.color === c ? 'border-white scale-110' : 'border-white/30'}" style="background:${c}"></span>
      </button>`).join('')}
    <div class="w-px h-8 bg-white/15 mx-1"></div>
    <button onclick="undoDraw()" title="실행취소" class="btn-touch w-12 rounded-xl text-slate-300 hover:bg-white/10 flex items-center justify-center text-lg"><i class="fas fa-rotate-left"></i></button>
    <button onclick="clearDraw()" title="전체 지우기" class="btn-touch w-12 rounded-xl text-slate-300 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center text-lg"><i class="fas fa-trash-can"></i></button>`
}

window.setTool = (t) => {
  S.tool = t
  canvas.style.pointerEvents = t === 'move' ? 'none' : 'auto'
  canvas.style.cursor = t === 'move' ? 'grab' : 'crosshair'
  renderToolbar()
}
window.setColor = (c) => { S.color = c; if (S.tool === 'move' || S.tool === 'eraser') S.tool = 'pen'; renderToolbar(); setTool(S.tool) }

// ==================== 필름스트립 ====================
function renderFilmstrip() {
  const fs = document.getElementById('filmstrip')
  if (!fs) return
  if (!S.related.length) { fs.innerHTML = '<div class="h-16"></div>'; return }
  fs.innerHTML = S.related.map((a) => `
    <button onclick="gotoAsset(${a.id})" class="film-thumb ${a.id === S.assetId ? 'active' : ''} shrink-0 relative w-28 h-[72px] rounded-xl overflow-hidden bg-slate-800">
      <img src="${PC.thumbOf(a)}" class="w-full h-full object-cover" loading="lazy">
      <span class="absolute inset-x-0 bottom-0 px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-semibold truncate text-left">${PC.esc(a.title)}</span>
    </button>`).join('')
}

window.gotoAsset = async (id) => {
  if (id === S.assetId) return
  persistDrawing()
  S.assetId = id; S.subIndex = 0
  const { data } = await axios.get(`/api/assets/${id}`)
  S.asset = data.asset
  history = []
  document.title = S.asset.title + ' — 상담 화면'
  window.history.replaceState(null, '', `/consult/${id}`)
  renderStage(); renderPanel(); renderFilmstrip()
}

// 키보드 좌우
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const items = itemsOf()
    if (items.length > 1) { subMove(e.key === 'ArrowRight' ? 1 : -1); return }
    const idx = S.related.findIndex((a) => a.id === S.assetId)
    if (idx < 0) return
    const next = S.related[idx + (e.key === 'ArrowRight' ? 1 : -1)]
    if (next) gotoAsset(next.id)
  }
})

// ==================== 우측 패널 ====================
function renderPanel() {
  const a = S.asset, p = a.payload || {}
  const panel = document.getElementById('side-panel')
  const items = a.type === 'steps' ? p.steps : a.type === 'progression' ? p.stages : null
  panel.innerHTML = `
  <div class="p-5 space-y-5">
    <div>
      <div class="flex items-center gap-2 flex-wrap">${PC.typeBadge(a.type)}
        ${a.reviewer_name ? `<span class="text-teal-300 text-sm font-bold"><i class="fas fa-user-doctor mr-1"></i>감수 ${PC.esc(a.reviewer_name)}</span>` : ''}
      </div>
      <h2 class="mt-2 text-white text-xl font-extrabold leading-snug">${PC.esc(a.title)}</h2>
      ${a.description ? `<p class="mt-2 text-slate-300 text-[15px] leading-relaxed">${PC.esc(a.description)}</p>` : ''}
    </div>
    ${items ? `
    <div>
      <p class="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">단계 목록</p>
      <div class="space-y-1.5">
        ${items.map((it, i) => `
        <button onclick="subGo(${i})" class="w-full text-left p-3 rounded-xl transition ${i === S.subIndex ? 'bg-teal-500/20 border border-teal-400/40' : 'bg-white/5 hover:bg-white/10 border border-transparent'}">
          <p class="font-bold text-[15px] ${i === S.subIndex ? 'text-teal-300' : 'text-slate-200'}">${PC.esc(it.label ? it.label + ' · ' + it.title : it.title)}</p>
          <p class="text-slate-400 text-[13px] mt-0.5 line-clamp-2">${PC.esc(it.desc || '')}</p>
        </button>`).join('')}
      </div>
    </div>` : ''}
    ${p.rows ? `
    <div>
      <p class="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">수가표</p>
      <div class="space-y-1">${p.rows.map((r) => `
        <div class="flex justify-between gap-2 p-2.5 rounded-lg bg-white/5 text-sm"><span class="text-slate-300">${PC.esc(r.item)}</span><span class="text-teal-300 font-bold whitespace-nowrap">${PC.esc(r.price)}</span></div>`).join('')}
      </div>
    </div>` : ''}
    <div id="caution-box"></div>
    ${PC.user?.clinic_id ? `
    <div>
      <p class="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">상담 메모</p>
      <input id="patient-label" placeholder="환자 표시명 (예: 김○○님)" value="${PC.esc(S.session.patient_label)}"
        onchange="S.session.patient_label=this.value"
        class="w-full h-12 px-4 rounded-xl bg-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400 mb-2">
      <textarea id="slide-note" placeholder="이 자료에 대한 메모" rows="3"
        onchange="setNote(this.value)"
        class="w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400 text-[15px]">${PC.esc(S.session.slides[S.assetId]?.note || '')}</textarea>
    </div>` : ''}
  </div>`
  loadCautions()
}

async function loadCautions() {
  const box = document.getElementById('caution-box')
  if (!box || !S.asset.treatment_id || S.asset.category === 'caution') return
  const { data } = await axios.get('/api/assets', { params: { treatment: S.asset.treatment_id, category: 'caution' } })
  if (!data.assets.length) return
  box.innerHTML = `
    <p class="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">주의사항 체크리스트</p>
    <div class="space-y-1.5">${data.assets.map((c) => `
      <label class="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 cursor-pointer">
        <input type="checkbox" class="mt-1 w-5 h-5 accent-amber-500">
        <span class="text-amber-200/90 text-[14px] leading-snug">${PC.esc(c.title)}</span>
      </label>`).join('')}
    </div>`
}

window.setNote = (v) => {
  if (!S.session.slides[S.assetId]) S.session.slides[S.assetId] = {}
  S.session.slides[S.assetId].note = v
}

window.togglePanel = () => { S.panelOpen = !S.panelOpen; document.getElementById('side-panel').classList.toggle('hidden', !S.panelOpen) }
window.toggleFullscreen = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }

// ==================== 세션 저장 / 전송 ====================
function collectSlides() {
  persistDrawing()
  // 방문한 자료들의 드로잉 병합 (자료별 첫 드로잉 우선)
  const byAsset = {}
  for (const key of Object.keys(S.drawings)) {
    const [aid] = key.split(':')
    if (S.drawings[key] && !byAsset[aid]) byAsset[aid] = S.drawings[key]
  }
  const assetIds = new Set([...Object.keys(byAsset), ...Object.keys(S.session.slides), String(S.assetId)])
  return [...assetIds].map((aid) => ({
    asset_id: parseInt(aid),
    drawing_png: byAsset[aid] || null,
    note: S.session.slides[aid]?.note || '',
  }))
}

window.saveSession = async (silent) => {
  if (!PC.user?.clinic_id) { location.href = '/login'; return null }
  const label = document.getElementById('patient-label')?.value || S.session.patient_label
  const { data } = await axios.post('/api/sessions', { id: S.session.id, patient_label: label, slides: collectSlides() })
  S.session.id = data.id
  if (!silent) PC.toast('상담이 저장되었습니다')
  return data.id
}

window.sendToPatient = async () => {
  const id = await saveSession(true)
  if (!id) return
  const { data } = await axios.post(`/api/sessions/${id}/share`)
  const url = location.origin + data.url
  const modal = document.getElementById('send-modal')
  modal.classList.remove('hidden')
  modal.innerHTML = `
  <div class="card-in grad-border w-full max-w-md glass-strong rounded-3xl p-7">
    <div class="relative w-16 h-16 mx-auto">
      <div class="absolute inset-0 rounded-2xl bg-teal-400/40 blur-xl"></div>
      <div class="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center"><i class="fas fa-paper-plane text-2xl text-white"></i></div>
    </div>
    <h3 class="mt-5 text-center text-2xl font-black text-white">환자 전송 링크 생성 완료</h3>
    <p class="mt-1.5 text-center text-slate-400">오늘 설명드린 자료와 그림, 주의사항이 담겨 있습니다</p>
    <div class="mt-6 flex items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10">
      <input id="share-url" readonly value="${url}" class="flex-1 bg-transparent text-sm text-slate-300 focus:outline-none">
      <button onclick="copyShare()" class="btn-touch px-4 rounded-xl btn-ghost text-sm">복사</button>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <button onclick="kakaoShare('${url}')" class="btn-touch rounded-2xl btn-kakao"><i class="fas fa-comment mr-2"></i>카카오톡 공유</button>
      <a href="${url}" target="_blank" class="btn-touch rounded-2xl btn-primary flex items-center justify-center"><i class="fas fa-eye mr-2"></i>미리보기</a>
    </div>
    <button onclick="document.getElementById('send-modal').classList.add('hidden')" class="btn-touch w-full mt-3 rounded-2xl text-slate-500 font-bold hover:bg-white/5 transition">닫기</button>
  </div>`
}

window.copyShare = async () => {
  const el = document.getElementById('share-url')
  try { await navigator.clipboard.writeText(el.value) } catch (e) { el.select(); document.execCommand('copy') }
  PC.toast('링크가 복사되었습니다')
}

window.kakaoShare = (url) => {
  // 카카오 SDK 키 없이도 동작하는 공유: 모바일은 시스템 공유, 데스크톱은 복사 안내
  if (navigator.share) navigator.share({ title: '오늘 설명드린 자료', url })
  else { navigator.clipboard.writeText(url); PC.toast('링크가 복사되었습니다. 카카오톡에 붙여넣어 주세요') }
}

init()
