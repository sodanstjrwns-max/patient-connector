// 비포·애프터 케이스 갤러리 (로그인 전용)
const state = { cases: [], treatments: [], treatment: 'all', showForm: false }

async function init() {
  await PC.loadMe()
  if (!PC.user || !PC.user.clinic_id) { location.href = '/login'; return }
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
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('cases')}
  <main class="max-w-[1600px] mx-auto px-4 sm:px-6 py-8">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-2">
      <div>
        <h1 class="text-3xl font-extrabold text-slate-900">비포·애프터 갤러리</h1>
        <p class="mt-1 text-slate-500">마우스를 올리거나 터치하면 애프터로 전환됩니다</p>
      </div>
      <button onclick="toggleForm()" class="btn-touch px-5 rounded-xl bg-brand-600 text-white font-bold shadow-lg shadow-brand-600/25"><i class="fas fa-plus mr-2"></i>케이스 등록</button>
    </div>
    <div class="mb-6 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
      <i class="fas fa-shield-halved text-amber-500 mt-0.5"></i>
      <p class="text-sm text-amber-800"><b>원내 상담 전용</b> · 비포·애프터 자료는 의료광고 규정에 따라 공개 라이브러리와 환자 전송 링크에 포함되지 않습니다.</p>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-4">
      <button onclick="setT('all')" class="btn-touch shrink-0 px-4 rounded-xl font-bold text-sm ${state.treatment === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 shadow-sm'}">전체</button>
      ${state.treatments.map((t) => `<button onclick="setT(${t.id})" class="btn-touch shrink-0 px-4 rounded-xl font-bold text-sm ${String(state.treatment) === String(t.id) ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 shadow-sm'}">${PC.esc(t.name)}</button>`).join('')}
    </div>
    <div id="case-form" class="${state.showForm ? '' : 'hidden'} mb-6"></div>
    ${state.cases.length ? `
    <div class="masonry">
      ${state.cases.map((cs) => `
      <div class="card-in rounded-3xl overflow-hidden bg-white shadow-sm">
        <div class="ba-flip relative cursor-pointer" onpointerenter="flip(this,true)" onpointerleave="flip(this,false)" onclick="flipToggle(this)">
          <img src="${cs.before_url}" class="w-full block ba-before">
          <img src="${cs.after_url}" class="w-full absolute inset-0 opacity-0 transition-opacity duration-300 ba-after">
          <span class="ba-label absolute top-3 left-3 px-3 py-1 rounded-full bg-black/65 text-white text-xs font-extrabold">BEFORE</span>
        </div>
        <div class="p-4">
          <h3 class="font-extrabold text-slate-800">${PC.esc(cs.title || cs.treatment_name || '케이스')}</h3>
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            ${cs.duration ? `<span><i class="far fa-clock mr-1 text-brand-500"></i>${PC.esc(cs.duration)}</span>` : ''}
            ${cs.material ? `<span><i class="fas fa-cube mr-1 text-brand-500"></i>${PC.esc(cs.material)}</span>` : ''}
            ${cs.doctor ? `<span><i class="fas fa-user-doctor mr-1 text-brand-500"></i>${PC.esc(cs.doctor)}</span>` : ''}
          </div>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs font-bold ${cs.consent ? 'text-emerald-600' : 'text-red-500'}"><i class="fas ${cs.consent ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1"></i>환자 동의 ${cs.consent ? '완료' : '미확인'}</span>
            <button onclick="delCase(${cs.id})" class="text-slate-300 hover:text-red-500 p-2"><i class="fas fa-trash-can"></i></button>
          </div>
        </div>
      </div>`).join('')}
    </div>` : `
    <div class="py-20 text-center">
      <div class="w-20 h-20 mx-auto rounded-3xl bg-white shadow-sm flex items-center justify-center mb-4"><i class="fas fa-images text-3xl text-slate-300"></i></div>
      <p class="text-lg font-bold text-slate-500">등록된 케이스가 없습니다</p>
    </div>`}
  </main>`
  if (state.showForm) renderForm()
}

window.flip = (el, after) => {
  if (matchMedia('(hover:hover)').matches) setFlip(el, after)
}
window.flipToggle = (el) => setFlip(el, el.querySelector('.ba-after').style.opacity !== '1')
function setFlip(el, after) {
  el.querySelector('.ba-after').style.opacity = after ? '1' : '0'
  const label = el.querySelector('.ba-label')
  label.textContent = after ? 'AFTER' : 'BEFORE'
  label.className = label.className.replace(after ? 'bg-black/65' : 'bg-brand-600', after ? 'bg-brand-600' : 'bg-black/65')
}

window.setT = (t) => { state.treatment = t; reload() }
window.toggleForm = () => { state.showForm = !state.showForm; render() }

function renderForm() {
  document.getElementById('case-form').innerHTML = `
  <form onsubmit="return saveCase(event)" class="card-in bg-white rounded-3xl shadow-sm p-6 grid sm:grid-cols-2 gap-4">
    <div class="sm:col-span-2 flex gap-4">
      ${['before', 'after'].map((k) => `
      <label class="flex-1 aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand-400 cursor-pointer flex flex-col items-center justify-center gap-2 text-slate-400 relative overflow-hidden" id="drop-${k}">
        <input type="file" accept="image/*" class="hidden" onchange="uploadCaseImg(this,'${k}')">
        <i class="fas fa-cloud-arrow-up text-2xl"></i><span class="font-bold uppercase text-sm">${k} 사진</span>
      </label>`).join('')}
    </div>
    <input name="title" placeholder="케이스 제목" class="h-12 px-4 rounded-xl border border-slate-200">
    <select name="treatment_id" class="h-12 px-4 rounded-xl border border-slate-200 bg-white">
      <option value="">진료 선택</option>
      ${state.treatments.map((t) => `<option value="${t.id}">${PC.esc(t.name)}</option>`).join('')}
    </select>
    <input name="duration" placeholder="치료 기간 (예: 4개월)" class="h-12 px-4 rounded-xl border border-slate-200">
    <input name="material" placeholder="사용 재료" class="h-12 px-4 rounded-xl border border-slate-200">
    <input name="doctor" placeholder="담당 원장" class="h-12 px-4 rounded-xl border border-slate-200">
    <label class="h-12 px-4 rounded-xl border border-slate-200 flex items-center gap-3 cursor-pointer">
      <input type="checkbox" name="consent" class="w-5 h-5 accent-brand-600"><span class="font-semibold text-slate-600">환자 사용 동의 받음</span>
    </label>
    <input type="hidden" name="before_url"><input type="hidden" name="after_url">
    <button class="sm:col-span-2 btn-touch h-13 rounded-xl bg-brand-600 text-white font-extrabold text-lg py-3">케이스 저장</button>
  </form>`
}

window.uploadCaseImg = async (input, kind) => {
  const file = input.files[0]
  if (!file) return
  const fd = new FormData(); fd.append('file', file)
  const label = document.getElementById('drop-' + kind)
  label.innerHTML = '<i class="fas fa-spinner fa-spin text-2xl"></i>'
  try {
    const { data } = await axios.post('/api/upload', fd)
    document.querySelector(`input[name=${kind}_url]`).value = data.url
    label.innerHTML = `<img src="${data.url}" class="absolute inset-0 w-full h-full object-cover"><span class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs font-bold uppercase">${kind}</span>`
  } catch (e) { PC.toast('업로드 실패', 'err'); label.innerHTML = '<i class="fas fa-cloud-arrow-up text-2xl"></i>다시 시도' }
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
