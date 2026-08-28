// 우리 병원 자료 관리 — v4 CLINICAL WORKSPACE
const state = { treatments: [], myAssets: [], publicAssets: [], sessions: [], tab: 'mine', showUpload: false }

async function init() {
  await PC.loadMe()
  if (!PC.user || !PC.user.clinic_id) { location.href = '/login'; return }
  if (new URLSearchParams(location.search).get('tab') === 'sessions') state.tab = 'sessions'
  const params = {}
  if (PC.user.clinic_specialty) params.specialty = PC.user.clinic_specialty
  const t = await axios.get('/api/treatments', { params })
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
  const tabBtn = (key, label) => `<button onclick="setTab('${key}')" class="tab ${state.tab === key ? 'on' : ''}">${label}</button>`
  const main = `
  <main class="px-4 sm:px-8 py-6 max-w-[1500px]">
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 class="text-[22px] font-bold tracking-tight text-[#18181b]">자료 관리</h1>
        <p class="mt-1 text-[13.5px] text-[#71717a]">업로드한 자료는 '우리 병원' 라벨과 함께 라이브러리에 표시됩니다</p>
      </div>
      <button onclick="toggleUpload()" class="btn-primary"><i class="fas fa-cloud-arrow-up text-[11px]"></i>자료 업로드</button>
    </div>
    <div class="border-b border-[#e4e4e7] mb-5 flex overflow-x-auto">
      ${tabBtn('mine', `우리 병원 자료 <span class="ml-1 text-[#a1a1aa]">${state.myAssets.length}</span>`)}
      ${tabBtn('public', '공개 자료 가져오기')}
      ${tabBtn('sessions', `상담 이력 <span class="ml-1 text-[#a1a1aa]">${state.sessions.length}</span>`)}
    </div>
    <div id="upload-form" class="${state.showUpload ? '' : 'hidden'} mb-5"></div>
    <div id="tab-body"></div>
  </main>`
  document.getElementById('app').innerHTML = PC.shell(state.tab === 'sessions' ? 'sessions' : 'manage', main)
  if (state.showUpload) renderUpload()
  renderTab()
}

window.setTab = (t) => { state.tab = t; render() }
window.toggleUpload = () => { state.showUpload = !state.showUpload; render() }

function renderTab() {
  const body = document.getElementById('tab-body')
  if (state.tab === 'mine') {
    body.innerHTML = state.myAssets.length ? `
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      ${state.myAssets.map((a) => `
      <div class="card-in card card-hover overflow-hidden ${a.is_hidden ? 'opacity-50' : ''}">
        <a href="/consult/${a.id}" class="block relative aspect-[4/3] bg-[#f1f1f3] overflow-hidden border-b border-[#f1f1f3]">
          <img src="${PC.thumbOf(a)}" class="w-full h-full object-cover" loading="lazy">
          <div class="absolute top-2.5 left-2.5">${PC.typeBadge(a.type)}</div>
          ${a.source_asset_id ? '<span class="absolute top-2.5 right-2.5 badge badge-neutral" style="background:rgba(255,255,255,.9)"><i class="fas fa-clone text-[10px]"></i>복제본</span>' : ''}
        </a>
        <div class="p-4">
          <h3 class="font-semibold text-[#18181b] text-[14px] leading-snug line-clamp-1">${PC.esc(a.title)}</h3>
          <p class="text-[12px] text-[#a1a1aa] mt-0.5">${PC.esc(a.treatment_name || '')} ${a.reviewer_name ? '· 감수 ' + PC.esc(a.reviewer_name) : ''}</p>
          <div class="mt-3 flex gap-1.5">
            <button onclick="editAsset(${a.id})" class="btn-ghost btn-sm flex-1">편집</button>
            <button onclick="toggleHide(${a.id}, ${a.is_hidden ? 0 : 1})" class="btn-ghost btn-sm flex-1">${a.is_hidden ? '표시' : '숨기기'}</button>
            <button onclick="delAsset(${a.id})" class="btn-ghost btn-sm !text-red-500 hover:!bg-red-50 w-9"><i class="fas fa-trash-can"></i></button>
          </div>
        </div>
      </div>`).join('')}
    </div>` : emptyBox('아직 병원 자료가 없습니다', '자료를 업로드하거나, 공개 자료를 복제해서 시작하세요')
  } else if (state.tab === 'public') {
    body.innerHTML = `
    <p class="mb-4 text-[13.5px] text-[#71717a]"><i class="fas fa-clone text-[#4f46e5] mr-1.5"></i>공개 자료를 <b class="text-[#18181b]">복제해서 편집</b>하면 우리 병원 버전이 생깁니다. 원본은 그대로 유지됩니다.</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      ${state.publicAssets.map((a) => `
      <div class="card-in card card-hover overflow-hidden">
        <div class="relative aspect-[4/3] bg-[#f1f1f3] overflow-hidden border-b border-[#f1f1f3]">
          <img src="${PC.thumbOf(a)}" class="w-full h-full object-cover" loading="lazy">
          <div class="absolute top-2.5 left-2.5">${PC.typeBadge(a.type)}</div>
        </div>
        <div class="p-4">
          <h3 class="font-semibold text-[#18181b] text-[14px] leading-snug line-clamp-1">${PC.esc(a.title)}</h3>
          <p class="text-[12px] text-[#a1a1aa] mt-0.5">${PC.esc(a.treatment_name || '')}</p>
          <button onclick="dupAsset(${a.id})" class="btn-ghost btn-sm w-full mt-3 !text-[#4f46e5]"><i class="fas fa-clone"></i>복제해서 편집</button>
        </div>
      </div>`).join('')}
    </div>`
  } else {
    body.innerHTML = state.sessions.length ? `
    <div class="card overflow-x-auto">
      <table class="tbl min-w-[640px]">
        <thead><tr>
          <th>환자</th><th>상담일</th><th>전송 링크</th><th>열람</th>
        </tr></thead>
        <tbody>
        ${state.sessions.map((s) => `
        <tr>
          <td class="font-semibold text-[#18181b]">${PC.esc(s.patient_label || '(이름 없음)')}</td>
          <td class="text-[#71717a]">${new Date(s.updated_at + 'Z').toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
          <td>
            ${s.share_token ? `<a href="/p/${s.share_token}" target="_blank" class="badge badge-accent hover:underline"><i class="fas fa-link text-[10px]"></i>열기</a>` : '<span class="text-[#d4d4d8]">미생성</span>'}
          </td>
          <td>
            ${s.view_count > 0
              ? `<span class="badge badge-ok"><i class="fas fa-eye text-[10px]"></i>${s.view_count}회 · ${new Date(s.last_viewed + 'Z').toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`
              : '<span class="text-[#d4d4d8]">아직 열람 전</span>'}
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>` : emptyBox('상담 이력이 없습니다', '상담 화면에서 "상담 저장"을 누르면 여기에 기록됩니다')
  }
}

function emptyBox(title, sub) {
  return `<div class="py-16 text-center"><div class="w-14 h-14 mx-auto rounded-xl bg-[#f1f1f3] flex items-center justify-center mb-3"><i class="fas fa-folder-open text-xl text-[#a1a1aa]"></i></div>
  <p class="text-[15px] font-semibold text-[#52525b]">${title}</p><p class="text-[13px] text-[#a1a1aa] mt-1">${sub}</p></div>`
}

// ============ 업로드 폼 (드래그&드롭, 다중) ============
let uploadedFiles = []
function renderUpload() {
  uploadedFiles = []
  document.getElementById('upload-form').innerHTML = `
  <form onsubmit="return saveUpload(event)" class="card-in card p-5 space-y-3">
    <div id="dropzone" class="rounded-lg border-2 border-dashed border-[#d4d4d8] hover:border-[#4f46e5] transition p-7 text-center cursor-pointer bg-[#fafafa]"
      ondragover="event.preventDefault(); this.classList.add('border-[#4f46e5]')"
      ondragleave="this.classList.remove('border-[#4f46e5]')"
      ondrop="onDrop(event)">
      <input id="file-input" type="file" accept="image/*,video/mp4,video/webm" multiple class="hidden" onchange="onFiles(this.files)">
      <i class="fas fa-cloud-arrow-up text-xl text-[#4f46e5]"></i>
      <p class="mt-2 font-semibold text-[#18181b] text-[14.5px]">이미지·영상을 끌어다 놓거나 클릭해서 선택</p>
      <p class="text-[12.5px] text-[#a1a1aa] mt-0.5">여러 파일 동시 업로드 가능 · mp4/webm 영상 지원</p>
      <div id="file-list" class="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2"></div>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      <input name="title" required placeholder="자료 제목" class="input h-10 px-3">
      <select name="treatment_id" class="input h-10 px-3">
        <option value="">진료 선택</option>
        ${state.treatments.map((t) => `<option value="${t.id}">${PC.esc(t.name)}</option>`).join('')}
      </select>
      <select name="category" class="input h-10 px-3">
        <option value="clinic">우리 병원 자료</option>
        <option value="process">치료 과정</option>
        <option value="progression">질환 진행</option>
        <option value="caution">주의사항</option>
        <option value="cost">비용</option>
        <option value="faq">자주 묻는 질문</option>
      </select>
      <input name="reviewer_name" placeholder="감수 원장" value="${PC.esc(PC.user.name)}" class="input h-10 px-3">
      <input name="tags" placeholder="태그 (쉼표로 구분: 임플란트, 통증)" class="sm:col-span-2 input h-10 px-3">
      <textarea name="description" placeholder="설명 (상담 화면·환자 링크에 표시됩니다)" rows="2" class="sm:col-span-2 input px-3 py-2.5"></textarea>
    </div>
    <button class="btn-primary w-full !h-10">자료 저장</button>
  </form>`
  document.getElementById('dropzone').addEventListener('click', (e) => {
    if (e.target.closest('#file-list')) return
    document.getElementById('file-input').click()
  })
}

window.onDrop = (e) => { e.preventDefault(); e.currentTarget.classList.remove('border-[#4f46e5]'); onFiles(e.dataTransfer.files) }

window.onFiles = async (files) => {
  const list = document.getElementById('file-list')
  for (const file of files) {
    const cell = document.createElement('div')
    cell.className = 'relative aspect-square rounded-lg bg-white border border-[#e4e4e7] flex items-center justify-center overflow-hidden'
    cell.innerHTML = '<i class="fas fa-spinner fa-spin text-[#a1a1aa]"></i>'
    list.appendChild(cell)
    const fd = new FormData(); fd.append('file', file)
    try {
      const { data } = await axios.post('/api/upload', fd)
      uploadedFiles.push({ url: data.url, type: data.type })
      cell.innerHTML = data.type.startsWith('video')
        ? `<video src="${data.url}" class="w-full h-full object-cover" muted></video><span class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center"><i class="fas fa-play"></i></span>`
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
