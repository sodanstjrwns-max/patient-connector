// 우리 병원 자료 관리 — 업로드 / 복제 편집 / 숨기기 / 삭제 + 상담 이력 (v3 APPLE LIGHT)
const state = { treatments: [], myAssets: [], publicAssets: [], sessions: [], tab: 'mine', showUpload: false }

async function init() {
  await PC.loadMe()
  if (!PC.user || !PC.user.clinic_id) { location.href = '/login'; return }
  const t = await axios.get('/api/treatments')
  state.treatments = t.data.treatments
  await reload()
}

async function reload() {
  const [a, s] = await Promise.all([axios.get('/api/assets'), axios.get('/api/sessions')])
  state.myAssets = a.data.assets.filter((x) => x.clinic_id != null)
  state.publicAssets = a.data.assets.filter((x) => x.clinic_id == null)
  state.sessions = s.data.sessions
  render()
}

function render() {
  const tabBtn = (key, label, icon) => `
    <button onclick="setTab('${key}')" class="btn-touch px-5 rounded-full font-semibold transition ${state.tab === key ? 'bg-[#1d1d1f] text-white shadow-lg shadow-black/15' : 'bg-white text-[#6e6e73] shadow-sm hover:shadow-md'}"><i class="fas ${icon} mr-2"></i>${label}</button>`
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('manage')}
  <main class="max-w-[1600px] mx-auto px-4 sm:px-6 py-10">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-7">
      <div>
        <h1 class="section-title text-[#1d1d1f]">우리 병원 <span class="grad-text-blue">자료 관리</span></h1>
        <p class="mt-2 text-[#6e6e73]">업로드한 자료는 '우리 병원' 라벨과 함께 라이브러리에 표시됩니다</p>
      </div>
      <button onclick="toggleUpload()" class="btn-touch btn-grad px-7 font-bold"><i class="fas fa-cloud-arrow-up mr-2"></i>자료 업로드</button>
    </div>
    <div class="flex gap-2 mb-7 overflow-x-auto pb-1">
      ${tabBtn('mine', '우리 병원 자료', 'fa-hospital')}
      ${tabBtn('public', '공개 자료 가져오기', 'fa-clone')}
      ${tabBtn('sessions', '상담 이력', 'fa-clock-rotate-left')}
    </div>
    <div id="upload-form" class="${state.showUpload ? '' : 'hidden'} mb-7"></div>
    <div id="tab-body"></div>
  </main>`
  if (state.showUpload) renderUpload()
  renderTab()
}

window.setTab = (t) => { state.tab = t; render() }
window.toggleUpload = () => { state.showUpload = !state.showUpload; render() }

function renderTab() {
  const body = document.getElementById('tab-body')
  if (state.tab === 'mine') {
    body.innerHTML = state.myAssets.length ? `
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
      ${state.myAssets.map((a) => `
      <div class="card-in card card-hover overflow-hidden ${a.is_hidden ? 'opacity-45' : ''}">
        <a href="/consult/${a.id}" class="block relative aspect-[4/3] bg-[#f5f5f7] overflow-hidden">
          <img src="${PC.thumbOf(a)}" class="w-full h-full object-cover" loading="lazy">
          <div class="absolute top-3 left-3">${PC.typeBadge(a.type)}</div>
          ${a.source_asset_id ? '<span class="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-xs font-bold text-[#6e6e73]"><i class="fas fa-clone mr-1"></i>복제본</span>' : ''}
        </a>
        <div class="p-4">
          <h3 class="font-bold text-[#1d1d1f] leading-snug line-clamp-1">${PC.esc(a.title)}</h3>
          <p class="text-sm text-[#a1a1a6] mt-0.5">${PC.esc(a.treatment_name || '')} ${a.reviewer_name ? '· 감수 ' + PC.esc(a.reviewer_name) : ''}</p>
          <div class="mt-3 flex gap-1.5">
            <button onclick="editAsset(${a.id})" class="btn-touch flex-1 rounded-full bg-[#f5f5f7] text-[#424245] text-sm font-bold hover:bg-[#e8e8ed] transition">편집</button>
            <button onclick="toggleHide(${a.id}, ${a.is_hidden ? 0 : 1})" class="btn-touch flex-1 rounded-full bg-[#f5f5f7] text-[#424245] text-sm font-bold hover:bg-[#e8e8ed] transition">${a.is_hidden ? '표시' : '숨기기'}</button>
            <button onclick="delAsset(${a.id})" class="btn-touch w-12 rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition"><i class="fas fa-trash-can"></i></button>
          </div>
        </div>
      </div>`).join('')}
    </div>` : emptyBox('아직 병원 자료가 없습니다', '자료를 업로드하거나, 공개 자료를 복제해서 시작하세요')
  } else if (state.tab === 'public') {
    body.innerHTML = `
    <p class="mb-5 text-[#6e6e73]"><i class="fas fa-wand-magic-sparkles text-[#5e5ce6] mr-1.5"></i>공개 자료를 <b class="text-[#1d1d1f]">복제해서 편집</b>하면 우리 병원 버전이 생깁니다. 원본은 그대로 유지됩니다.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
      ${state.publicAssets.map((a) => `
      <div class="card-in card card-hover overflow-hidden">
        <div class="relative aspect-[4/3] bg-[#f5f5f7] overflow-hidden">
          <img src="${PC.thumbOf(a)}" class="w-full h-full object-cover" loading="lazy">
          <div class="absolute top-3 left-3">${PC.typeBadge(a.type)}</div>
        </div>
        <div class="p-4">
          <h3 class="font-bold text-[#1d1d1f] leading-snug line-clamp-1">${PC.esc(a.title)}</h3>
          <p class="text-sm text-[#a1a1a6] mt-0.5">${PC.esc(a.treatment_name || '')}</p>
          <button onclick="dupAsset(${a.id})" class="btn-touch w-full mt-3 rounded-full bg-[#0071e3]/8 text-[#0071e3] font-bold hover:bg-[#0071e3]/15 transition" style="background:rgba(0,113,227,.08)"><i class="fas fa-clone mr-2"></i>복제해서 편집</button>
        </div>
      </div>`).join('')}
    </div>`
  } else {
    body.innerHTML = state.sessions.length ? `
    <div class="card overflow-hidden">
      <table class="w-full">
        <thead><tr class="text-left text-sm text-[#a1a1a6] border-b border-black/5">
          <th class="px-6 py-4 font-bold">환자</th><th class="px-4 py-4 font-bold">상담일</th><th class="px-4 py-4 font-bold">전송 링크</th><th class="px-4 py-4 font-bold">열람</th>
        </tr></thead>
        <tbody>
        ${state.sessions.map((s) => `
        <tr class="border-b border-black/[0.03] hover:bg-[#f5f5f7]/60 transition">
          <td class="px-6 py-4 font-bold text-[#1d1d1f]">${PC.esc(s.patient_label || '(이름 없음)')}</td>
          <td class="px-4 py-4 text-[#6e6e73] text-sm">${new Date(s.updated_at + 'Z').toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
          <td class="px-4 py-4">
            ${s.share_token ? `<a href="/p/${s.share_token}" target="_blank" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-bold text-[#0071e3]" style="background:rgba(0,113,227,.08)"><i class="fas fa-link"></i>열기</a>` : '<span class="text-[#c7c7cc] text-sm">미생성</span>'}
          </td>
          <td class="px-4 py-4">
            ${s.view_count > 0
              ? `<span class="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-sm"><i class="fas fa-eye"></i>${s.view_count}회 · ${new Date(s.last_viewed + 'Z').toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`
              : '<span class="text-[#c7c7cc] text-sm">아직 열람 전</span>'}
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>` : emptyBox('상담 이력이 없습니다', '상담 화면에서 "상담 저장"을 누르면 여기에 기록됩니다')
  }
}

function emptyBox(title, sub) {
  return `<div class="py-20 text-center"><div class="w-20 h-20 mx-auto rounded-3xl card flex items-center justify-center mb-4 float-y"><i class="fas fa-folder-open text-3xl text-[#c7c7cc]"></i></div>
  <p class="text-lg font-bold text-[#6e6e73]">${title}</p><p class="text-[#a1a1a6] mt-1">${sub}</p></div>`
}

// ============ 업로드 폼 (드래그&드롭, 다중) ============
let uploadedFiles = []
function renderUpload() {
  uploadedFiles = []
  document.getElementById('upload-form').innerHTML = `
  <form onsubmit="return saveUpload(event)" class="card-in card p-6 space-y-4">
    <div id="dropzone" class="rounded-2xl border-2 border-dashed border-black/10 hover:border-[#0071e3]/60 transition p-8 text-center cursor-pointer bg-[#fafafa]"
      ondragover="event.preventDefault(); this.classList.add('border-[#0071e3]')"
      ondragleave="this.classList.remove('border-[#0071e3]')"
      ondrop="onDrop(event)">
      <input id="file-input" type="file" accept="image/*,video/mp4,video/webm" multiple class="hidden" onchange="onFiles(this.files)">
      <i class="fas fa-cloud-arrow-up text-3xl text-[#0071e3]"></i>
      <p class="mt-2 font-extrabold text-[#1d1d1f] text-lg">이미지·영상을 끌어다 놓거나 클릭해서 선택</p>
      <p class="text-sm text-[#a1a1a6] mt-1">여러 파일 동시 업로드 가능 · mp4/webm 영상 지원</p>
      <div id="file-list" class="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2"></div>
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
      <input name="title" required placeholder="자료 제목" class="input-light h-12 px-4">
      <select name="treatment_id" class="input-light h-12 px-4">
        <option value="">진료 선택</option>
        ${state.treatments.map((t) => `<option value="${t.id}">${PC.esc(t.name)}</option>`).join('')}
      </select>
      <select name="category" class="input-light h-12 px-4">
        <option value="clinic">우리 병원 자료</option>
        <option value="process">치료 과정</option>
        <option value="progression">질환 진행</option>
        <option value="caution">주의사항</option>
        <option value="cost">비용</option>
        <option value="faq">자주 묻는 질문</option>
      </select>
      <input name="reviewer_name" placeholder="감수 원장 (예: ${PC.esc(PC.user.name)})" value="${PC.esc(PC.user.name)}" class="input-light h-12 px-4">
      <input name="tags" placeholder="태그 (쉼표로 구분: 임플란트, 통증)" class="sm:col-span-2 input-light h-12 px-4">
      <textarea name="description" placeholder="설명 (상담 화면·환자 링크에 표시됩니다)" rows="2" class="sm:col-span-2 input-light px-4 py-3"></textarea>
    </div>
    <button class="btn-touch btn-grad w-full font-extrabold text-lg py-3.5">자료 저장</button>
  </form>`
  document.getElementById('dropzone').addEventListener('click', (e) => {
    if (e.target.closest('#file-list')) return
    document.getElementById('file-input').click()
  })
}

window.onDrop = (e) => { e.preventDefault(); e.currentTarget.classList.remove('border-[#0071e3]'); onFiles(e.dataTransfer.files) }

window.onFiles = async (files) => {
  const list = document.getElementById('file-list')
  for (const file of files) {
    const cell = document.createElement('div')
    cell.className = 'relative aspect-square rounded-xl bg-white border border-black/5 flex items-center justify-center overflow-hidden shadow-sm'
    cell.innerHTML = '<i class="fas fa-spinner fa-spin text-[#a1a1a6]"></i>'
    list.appendChild(cell)
    const fd = new FormData(); fd.append('file', file)
    try {
      const { data } = await axios.post('/api/upload', fd)
      uploadedFiles.push({ url: data.url, type: data.type })
      cell.innerHTML = data.type.startsWith('video')
        ? `<video src="${data.url}" class="w-full h-full object-cover" muted></video><span class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"><i class="fas fa-play"></i></span>`
        : `<img src="${data.url}" class="w-full h-full object-cover">`
    } catch (err) {
      cell.innerHTML = '<i class="fas fa-xmark text-red-400"></i>'
      PC.toast(err.response?.data?.error || '업로드 실패', 'err')
    }
  }
}

window.saveUpload = async (e) => {
  e.preventDefault()
  if (!uploadedFiles.length) { PC.toast('파일을 먼저 업로드해주세요', 'err'); return false }
  const fd = new FormData(e.target)
  const hasVideo = uploadedFiles.some((f) => f.type.startsWith('video'))
  await axios.post('/api/assets', {
    title: fd.get('title'),
    treatment_id: fd.get('treatment_id') || null,
    category: fd.get('category'),
    type: hasVideo ? 'video' : 'image',
    description: fd.get('description'),
    reviewer_name: fd.get('reviewer_name'),
    tags: (fd.get('tags') || '').split(',').map((s) => s.trim()).filter(Boolean),
    media_urls: uploadedFiles.map((f) => f.url),
  })
  PC.toast('자료가 등록되었습니다')
  state.showUpload = false
  reload()
  return false
}

// ============ 편집 / 복제 / 숨김 / 삭제 ============
window.dupAsset = async (id) => {
  await axios.post(`/api/assets/${id}/duplicate`)
  PC.toast('우리 병원 버전으로 복제되었습니다')
  state.tab = 'mine'
  reload()
}

window.toggleHide = async (id, hidden) => {
  await axios.put(`/api/assets/${id}`, { is_hidden: hidden })
  reload()
}

window.delAsset = async (id) => {
  if (!confirm('이 자료를 삭제할까요? 되돌릴 수 없습니다.')) return
  await axios.delete(`/api/assets/${id}`)
  PC.toast('삭제되었습니다')
  reload()
}

window.editAsset = async (id) => {
  const a = state.myAssets.find((x) => x.id === id)
  if (!a) return
  const title = prompt('자료 제목', a.title); if (title === null) return
  const description = prompt('설명', a.description || ''); if (description === null) return
  const reviewer = prompt('감수 원장', a.reviewer_name || ''); if (reviewer === null) return
  let payload
  if (a.type === 'cost' && a.payload?.rows) {
    payload = { ...a.payload, rows: [] }
    for (const r of a.payload.rows) {
      const price = prompt(`[${r.item}] 금액`, r.price)
      if (price === null) { payload = undefined; break }
      payload.rows.push({ ...r, price })
    }
    if (payload === undefined) payload = a.payload
  }
  await axios.put(`/api/assets/${id}`, { title, description, reviewer_name: reviewer, ...(payload ? { payload } : {}) })
  PC.toast('수정되었습니다')
  reload()
}

init()
