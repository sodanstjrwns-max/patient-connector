// 비포·애프터 케이스 갤러리 — 원내 사용 전제, 로그인 불필요 (v2 AURORA DARK)
const state = { cases: [], treatments: [], treatment: 'all', showForm: false }

async function init() {
  await PC.loadMe()
  const [t, c] = await Promise.all([
    axios.get('/api/treatments'),
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
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('cases')}
  <main class="max-w-[1700px] mx-auto px-4 sm:px-7 py-10">
    <div class="flex flex-wrap items-end justify-between gap-5 mb-3">
      <div>
        <h1 class="text-4xl font-black text-white tracking-tight">비포·<span class="grad-text">애프터</span></h1>
        <p class="mt-2 text-slate-400 text-lg">마우스를 올리거나 터치하면 애프터로 전환됩니다</p>
      </div>
      ${u?.clinic_id
        ? `<button onclick="toggleForm()" class="btn-touch btn-primary px-6 rounded-2xl"><i class="fas fa-plus mr-2"></i>케이스 등록</button>`
        : `<a href="/login" class="btn-touch btn-ghost inline-flex items-center px-5 rounded-2xl"><i class="fas fa-lock mr-2 text-teal-400"></i>로그인하면 우리 병원 케이스 등록</a>`}
    </div>
    <div class="mb-7 p-4 rounded-2xl bg-amber-400/8 border border-amber-400/20 flex items-start gap-3">
      <i class="fas fa-shield-halved text-amber-400 mt-0.5"></i>
      <p class="text-sm text-amber-200/80"><b class="text-amber-300">원내 상담 전용</b> · 비포·애프터는 체어사이드·상담실 화면용입니다. 환자에게 보내는 공개 링크에는 포함되지 않습니다 (의료광고 규정).</p>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-5">
      <button onclick="setT('all')" class="chip ${state.treatment === 'all' ? 'on' : ''} btn-touch shrink-0 px-4 rounded-xl text-sm">전체</button>
      ${state.treatments.map((t) => `<button onclick="setT(${t.id})" class="chip ${String(state.treatment) === String(t.id) ? 'on' : ''} btn-touch shrink-0 px-4 rounded-xl text-sm">${PC.esc(t.name)}</button>`).join('')}
    </div>
    <div id="case-form" class="${state.showForm ? '' : 'hidden'} mb-8"></div>
    ${state.cases.length ? `
    <div class="masonry">
      ${state.cases.map((cs) => {
        const isDemo = cs.clinic_id == null
        return `
      <div class="card card-hover card-in overflow-hidden">
        <div class="ba-flip relative cursor-pointer" onpointerenter="flip(this,true)" onpointerleave="flip(this,false)" onclick="flipToggle(this)">
          <img src="${cs.before_url}" class="w-full block ba-before">
          <img src="${cs.after_url}" class="w-full absolute inset-0 opacity-0 transition-opacity duration-300 ba-after">
          <span class="ba-label absolute top-3.5 left-3.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur text-white text-[11px] font-black tracking-widest">BEFORE</span>
          ${isDemo ? '<span class="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur border border-white/15 text-slate-300 text-[11px] font-extrabold">데모</span>' : ''}
        </div>
        <div class="p-5">
          <h3 class="font-extrabold text-white text-[16px]">${PC.esc(cs.title || cs.treatment_name || '케이스')}</h3>
          <div class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-400 font-semibold">
            ${cs.duration ? `<span><i class="far fa-clock mr-1.5 text-teal-400"></i>${PC.esc(cs.duration)}</span>` : ''}
            ${cs.material ? `<span><i class="fas fa-cube mr-1.5 text-teal-400"></i>${PC.esc(cs.material)}</span>` : ''}
            ${cs.doctor ? `<span><i class="fas fa-user-doctor mr-1.5 text-teal-400"></i>${PC.esc(cs.doctor)}</span>` : ''}
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span class="text-[12px] font-bold ${cs.consent ? 'text-emerald-400' : 'text-red-400'}"><i class="fas ${cs.consent ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1"></i>환자 동의 ${cs.consent ? '완료' : '미확인'}</span>
            ${!isDemo && PC.user?.clinic_id === cs.clinic_id ? `<button onclick="delCase(${cs.id})" class="text-slate-600 hover:text-red-400 p-2 transition"><i class="fas fa-trash-can"></i></button>` : ''}
          </div>
        </div>
      </div>`}).join('')}
    </div>` : `
    <div class="py-24 text-center fade-in">
      <div class="w-24 h-24 mx-auto rounded-[2rem] card flex items-center justify-center mb-5 float-y"><i class="fas fa-images text-4xl text-slate-600"></i></div>
      <p class="text-xl font-extrabold text-slate-400">등록된 케이스가 없습니다</p>
    </div>`}
  </main>`
  if (state.showForm) renderForm()
}

window.flip = (el, after) => { if (matchMedia('(hover:hover)').matches) setFlip(el, after) }
window.flipToggle = (el) => setFlip(el, el.querySelector('.ba-after').style.opacity !== '1')
function setFlip(el, after) {
  el.querySelector('.ba-after').style.opacity = after ? '1' : '0'
  const label = el.querySelector('.ba-label')
  label.textContent = after ? 'AFTER' : 'BEFORE'
  label.style.background = after ? 'linear-gradient(135deg,#14b8a6,#0ea5e9)' : 'rgba(0,0,0,0.7)'
}

window.setT = (t) => { state.treatment = t; reload() }
window.toggleForm = () => { state.showForm = !state.showForm; render() }

function renderForm() {
  document.getElementById('case-form').innerHTML = `
  <form onsubmit="return saveCase(event)" class="card-in card p-6 grid sm:grid-cols-2 gap-4">
    <div class="sm:col-span-2 flex gap-4">
      ${['before', 'after'].map((k) => `
      <label class="flex-1 aspect-[4/3] rounded-2xl border-2 border-dashed border-white/15 hover:border-teal-400/60 cursor-pointer flex flex-col items-center justify-center gap-2 text-slate-500 relative overflow-hidden transition" id="drop-${k}">
        <input type="file" accept="image/*" class="hidden" onchange="uploadCaseImg(this,'${k}')">
        <i class="fas fa-cloud-arrow-up text-2xl text-teal-400/70"></i><span class="font-black uppercase text-sm tracking-widest">${k}</span>
      </label>`).join('')}
    </div>
    <input name="title" placeholder="케이스 제목" class="input-dark h-13 px-4 py-3">
    <select name="treatment_id" class="input-dark h-13 px-4 py-3">
      <option value="">진료 선택</option>
      ${state.treatments.map((t) => `<option value="${t.id}">${PC.esc(t.name)}</option>`).join('')}
    </select>
    <input name="duration" placeholder="치료 기간 (예: 4개월)" class="input-dark h-13 px-4 py-3">
    <input name="material" placeholder="사용 재료·시술법" class="input-dark h-13 px-4 py-3">
    <input name="doctor" placeholder="담당 원장" class="input-dark h-13 px-4 py-3">
    <label class="input-dark h-13 px-4 py-3 flex items-center gap-3 cursor-pointer">
      <input type="checkbox" name="consent" class="w-5 h-5 accent-teal-500"><span class="font-bold text-slate-300">환자 사용 동의 받음</span>
    </label>
    <input type="hidden" name="before_url"><input type="hidden" name="after_url">
    <button class="sm:col-span-2 btn-touch btn-primary rounded-2xl text-lg py-3.5">케이스 저장</button>
  </form>`
}

window.uploadCaseImg = async (input, kind) => {
  const file = input.files[0]
  if (!file) return
  const fd = new FormData(); fd.append('file', file)
  const label = document.getElementById('drop-' + kind)
  label.innerHTML = '<i class="fas fa-spinner fa-spin text-2xl text-teal-400"></i>'
  try {
    const { data } = await axios.post('/api/upload', fd)
    document.querySelector(`input[name=${kind}_url]`).value = data.url
    label.innerHTML = `<img src="${data.url}" class="absolute inset-0 w-full h-full object-cover"><span class="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-black uppercase tracking-widest">${kind}</span>`
  } catch (e) { PC.toast(e.response?.data?.error || '업로드 실패 (로그인 필요)', 'err'); label.innerHTML = '<i class="fas fa-cloud-arrow-up text-2xl"></i>다시 시도' }
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
