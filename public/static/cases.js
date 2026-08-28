// 비포·애프터 케이스 갤러리 — v4 CLINICAL WORKSPACE (원내 사용, 로그인 불필요)
const state = { cases: [], treatments: [], treatment: 'all', showForm: false }

async function init() {
  await PC.loadMe()
  const params = {}
  if (PC.user?.clinic_id && PC.user.clinic_specialty) params.specialty = PC.user.clinic_specialty
  const [t, c] = await Promise.all([
    axios.get('/api/treatments', { params }),
    axios.get('/api/cases', { params: { treatment: state.treatment } }),
  ])
  state.treatments = t.data.treatments
  state.cases = c.data.cases
  render()
}

async function reload() {
  const { data } = await axios.get('/api/cases', { params: { treatment: state.treatment } })
  state.cases = data.cases
  render()
}

function render() {
  const u = PC.user
  const main = `
  <main class="px-4 sm:px-8 py-6 max-w-[1500px]">
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 class="text-[22px] font-bold tracking-tight text-[#18181b]">비포·애프터</h1>
        <p class="mt-1 text-[13.5px] text-[#71717a]">마우스를 올리거나 터치하면 애프터로 전환됩니다</p>
      </div>
      ${u?.clinic_id
        ? `<button onclick="toggleForm()" class="btn-primary"><i class="fas fa-plus text-[11px]"></i>케이스 등록</button>`
        : `<a href="/login" class="btn-ghost"><i class="fas fa-lock text-[11px]"></i>로그인하면 우리 병원 케이스 등록</a>`}
    </div>

    <div class="mb-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
      <i class="fas fa-shield-halved text-amber-500 mt-0.5 text-[13px]"></i>
      <p class="text-[13px] text-amber-800"><b>원내 상담 전용</b> · 비포·애프터는 체어사이드·상담실 화면용입니다. 환자에게 보내는 공개 링크에는 포함되지 않습니다 (의료광고 규정).</p>
    </div>

    <div class="flex gap-1.5 overflow-x-auto pb-4">
      <button onclick="setT('all')" class="chip ${state.treatment === 'all' ? 'on' : ''}">전체</button>
      ${state.treatments.map((t) => `<button onclick="setT(${t.id})" class="chip ${String(state.treatment) === String(t.id) ? 'on' : ''}">${PC.esc(t.name)}</button>`).join('')}
    </div>

    <div id="case-form" class="${state.showForm ? '' : 'hidden'} mb-6"></div>

    ${state.cases.length ? `
    <div class="masonry">
      ${state.cases.map((cs) => {
        const isDemo = cs.clinic_id == null
        return `
      <div class="card card-hover card-in overflow-hidden">
        <div class="ba-flip relative cursor-pointer bg-[#f1f1f3]" onpointerenter="flip(this,true)" onpointerleave="flip(this,false)" onclick="flipToggle(this)">
          <img src="${cs.before_url}" class="w-full block ba-before">
          <img src="${cs.after_url}" class="w-full absolute inset-0 opacity-0 transition-opacity duration-200 ba-after">
          <span class="ba-label absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10.5px] font-bold tracking-wider">BEFORE</span>
          ${isDemo ? '<span class="absolute top-2.5 right-2.5 badge badge-neutral" style="background:rgba(255,255,255,.9)">데모</span>' : ''}
        </div>
        <div class="p-4">
          <h3 class="font-semibold text-[#18181b] text-[14px]">${PC.esc(cs.title || cs.treatment_name || '케이스')}</h3>
          <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#71717a]">
            ${cs.duration ? `<span><i class="far fa-clock mr-1 text-[#a1a1aa]"></i>${PC.esc(cs.duration)}</span>` : ''}
            ${cs.material ? `<span><i class="fas fa-cube mr-1 text-[#a1a1aa]"></i>${PC.esc(cs.material)}</span>` : ''}
            ${cs.doctor ? `<span><i class="fas fa-user-doctor mr-1 text-[#a1a1aa]"></i>${PC.esc(cs.doctor)}</span>` : ''}
          </div>
          <div class="mt-2.5 flex items-center justify-between">
            <span class="badge ${cs.consent ? 'badge-ok' : 'badge-danger'}"><i class="fas ${cs.consent ? 'fa-circle-check' : 'fa-circle-xmark'} text-[10px]"></i>동의 ${cs.consent ? '완료' : '미확인'}</span>
            ${!isDemo && PC.user?.clinic_id === cs.clinic_id ? `<button onclick="delCase(${cs.id})" class="text-[#d4d4d8] hover:text-red-500 p-1.5 transition"><i class="fas fa-trash-can text-[13px]"></i></button>` : ''}
          </div>
        </div>
      </div>`}).join('')}
    </div>` : `
    <div class="py-20 text-center fade-in">
      <div class="w-14 h-14 mx-auto rounded-xl bg-[#f1f1f3] flex items-center justify-center mb-3"><i class="fas fa-images text-xl text-[#a1a1aa]"></i></div>
      <p class="text-[15px] font-semibold text-[#52525b]">등록된 케이스가 없습니다</p>
    </div>`}
  </main>`
  document.getElementById('app').innerHTML = PC.shell('cases', main)
  if (state.showForm) renderForm()
}

window.flip = (el, after) => { if (matchMedia('(hover:hover)').matches) setFlip(el, after) }
window.flipToggle = (el) => setFlip(el, el.querySelector('.ba-after').style.opacity !== '1')
function setFlip(el, after) {
  el.querySelector('.ba-after').style.opacity = after ? '1' : '0'
  const label = el.querySelector('.ba-label')
  label.textContent = after ? 'AFTER' : 'BEFORE'
  label.style.background = after ? '#4f46e5' : 'rgba(0,0,0,0.7)'
}

window.setT = (t) => { state.treatment = t; reload() }
window.toggleForm = () => { state.showForm = !state.showForm; render() }

function renderForm() {
  document.getElementById('case-form').innerHTML = `
  <form onsubmit="return saveCase(event)" class="card-in card p-5 grid sm:grid-cols-2 gap-3 max-w-3xl">
    <div class="sm:col-span-2 flex gap-3">
      ${['before', 'after'].map((k) => `
      <label class="flex-1 aspect-[4/3] rounded-lg border-2 border-dashed border-[#d4d4d8] hover:border-[#4f46e5] cursor-pointer flex flex-col items-center justify-center gap-1.5 text-[#a1a1aa] relative overflow-hidden transition bg-[#fafafa]" id="drop-${k}">
        <input type="file" accept="image/*" class="hidden" onchange="uploadCaseImg(this,'${k}')">
        <i class="fas fa-cloud-arrow-up text-lg"></i><span class="font-bold uppercase text-[11px] tracking-wider">${k}</span>
      </label>`).join('')}
    </div>
    <input name="title" placeholder="케이스 제목" class="input h-10 px-3">
    <select name="treatment_id" class="input h-10 px-3">
      <option value="">진료 선택</option>
      ${state.treatments.map((t) => `<option value="${t.id}">${PC.esc(t.name)}</option>`).join('')}
    </select>
    <input name="duration" placeholder="치료 기간 (예: 4개월)" class="input h-10 px-3">
    <input name="material" placeholder="사용 재료·시술법" class="input h-10 px-3">
    <input name="doctor" placeholder="담당 원장" class="input h-10 px-3">
    <label class="input h-10 px-3 flex items-center gap-2.5 cursor-pointer">
      <input type="checkbox" name="consent" class="w-4 h-4 accent-[#4f46e5]"><span class="text-[13.5px] font-medium text-[#52525b]">환자 사용 동의 받음</span>
    </label>
    <input type="hidden" name="before_url"><input type="hidden" name="after_url">
    <button class="sm:col-span-2 btn-primary !h-10">케이스 저장</button>
  </form>`
}

window.uploadCaseImg = async (input, kind) => {
  const file = input.files[0]
  if (!file) return
  const fd = new FormData(); fd.append('file', file)
  const label = document.getElementById('drop-' + kind)
  label.innerHTML = '<i class="fas fa-spinner fa-spin text-lg text-[#4f46e5]"></i>'
  try {
    const { data } = await axios.post('/api/upload', fd)
    document.querySelector(`input[name=${kind}_url]`).value = data.url
    label.innerHTML = `<img src="${data.url}" class="absolute inset-0 w-full h-full object-cover"><span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider">${kind}</span>`
  } catch (e) { PC.toast(e.response?.data?.error || '업로드 실패 (로그인 필요)', 'err'); label.innerHTML = '<i class="fas fa-cloud-arrow-up text-lg"></i>다시 시도' }
}

window.saveCase = async (e) => {
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = Object.fromEntries(fd.entries())
  if (!body.before_url || !body.after_url) { PC.toast('비포/애프터 사진을 업로드해주세요', 'err'); return false }
  body.consent = fd.get('consent') === 'on'
  await axios.post('/api/cases', body)
  PC.toast('케이스가 등록되었습니다')
  state.showForm = false
  reload()
  return false
}

window.delCase = async (id) => {
  if (!confirm('이 케이스를 삭제할까요?')) return
  await axios.delete(`/api/cases/${id}`)
  reload()
}

init()
