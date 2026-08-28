// 설명자료 라이브러리 — v4 CLINICAL WORKSPACE
// 로그인 병원은 병원 진료과가 자동 적용됨 (선택 UI 없음)
const CATEGORIES = [
  ['all', '전체', 'fa-border-all'],
  ['process', '치료 과정', 'fa-list-ol'],
  ['progression', '질환 진행', 'fa-stairs'],
  ['caution', '주의사항', 'fa-triangle-exclamation'],
  ['cost', '비용', 'fa-won-sign'],
  ['faq', '자주 묻는 질문', 'fa-circle-question'],
  ['clinic', '우리 병원 자료', 'fa-hospital'],
]

const state = {
  specialty: '치과',
  lockedSpecialty: false, // 로그인 병원이면 true — 셀렉터 숨김
  specialties: [], treatments: [],
  treatment: 'all', category: 'all', q: '',
  assets: [], loading: true,
}

async function init() {
  await PC.loadMe()
  if (PC.user?.clinic_id && PC.user.clinic_specialty) {
    state.specialty = PC.user.clinic_specialty
    state.lockedSpecialty = true
  } else {
    state.specialty = localStorage.getItem('pc_specialty') || '치과'
  }
  await loadTreatments()
  render()
  await loadAssets()
}

async function loadTreatments() {
  const { data } = await axios.get('/api/treatments', { params: { specialty: state.specialty } })
  state.treatments = data.treatments
  state.specialties = data.specialties
  if (state.lockedSpecialty && !state.specialties.includes(state.specialty)) {
    // 병원 진료과가 '기타' 등 라이브러리에 없는 경우 → 전체 노출
    const all = await axios.get('/api/treatments')
    state.treatments = all.data.treatments
  }
}

async function loadAssets() {
  state.loading = true
  const grid = document.getElementById('grid')
  if (grid) grid.innerHTML = skeletons()
  const params = { category: state.category, q: state.q }
  if (state.treatment !== 'all') params.treatment = state.treatment
  const { data } = await axios.get('/api/assets', { params })
  let assets = data.assets
  if (state.treatment === 'all') {
    const ids = new Set(state.treatments.map((t) => t.id))
    assets = assets.filter((a) => !a.treatment_id || ids.has(a.treatment_id))
  }
  state.assets = assets
  state.loading = false
  renderGrid()
}

function skeletons() {
  return Array.from({ length: 8 }, () => `<div class="card overflow-hidden"><div class="skeleton aspect-[4/3]"></div><div class="p-4 space-y-2"><div class="skeleton h-4 rounded w-3/4"></div><div class="skeleton h-3 rounded w-1/2"></div></div></div>`).join('')
}

function render() {
  const u = PC.user
  const main = `
  <main class="px-4 sm:px-8 py-6 max-w-[1500px]">
    <!-- 페이지 헤더 -->
    <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[22px] font-bold tracking-tight text-[#18181b]">설명자료 라이브러리</h1>
        <p class="mt-1 text-[13.5px] text-[#71717a]">
          ${state.lockedSpecialty
            ? `<i class="fas fa-circle-check text-emerald-500 mr-1"></i>${PC.esc(u.clinic_name)}의 진료 분야 <b class="text-[#18181b]">${PC.esc(state.specialty)}</b> 자료가 표시됩니다`
            : '자료를 클릭하면 상담 화면이 열립니다 · 로그인하면 병원 진료 분야가 자동 적용됩니다'}
        </p>
      </div>
      <div class="flex items-center gap-2">
        ${!state.lockedSpecialty ? `
        <select onchange="setSpecialty(this.value)" class="input h-9 px-3 text-[13px] font-medium cursor-pointer">
          ${state.specialties.map((sp) => `<option value="${sp}" ${state.specialty === sp ? 'selected' : ''}>${sp}</option>`).join('')}
        </select>` : ''}
        <div class="relative">
          <i class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-[12px]"></i>
          <input id="search-input" type="search" placeholder="제목·태그 검색" value="${PC.esc(state.q)}"
            class="input h-9 w-[200px] sm:w-[260px] pl-8 pr-3 text-[13.5px]" oninput="onSearch(this.value)">
        </div>
      </div>
    </div>

    <!-- 진료 탭 -->
    <div class="border-b border-[#e4e4e7] mb-4 -mx-1 px-1 flex overflow-x-auto" id="treatment-tabs">
      ${tabBtn('all', '전체')}
      ${state.treatments.map((t) => tabBtn(t.id, t.name)).join('')}
    </div>

    <!-- 카테고리 칩 -->
    <div class="flex gap-1.5 overflow-x-auto pb-4" id="category-chips">
      ${CATEGORIES.map(([key, label, icon]) => `
        <button onclick="setCategory('${key}')" class="chip ${state.category === key ? 'on' : ''}"><i class="fas ${icon} text-[11px]"></i>${label}</button>`).join('')}
    </div>

    <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">${skeletons()}</div>

    <p class="mt-10 pb-4 text-center text-[12px] text-[#a1a1aa]">페이션트 커넥트 · 모든 병원이 영원히 무료로 사용하는 공개 설명자료 라이브러리</p>
  </main>`
  document.getElementById('app').innerHTML = PC.shell('home', main)
}

function tabBtn(id, name) {
  const active = String(state.treatment) === String(id)
  return `<button onclick="setTreatment('${id}')" class="tab ${active ? 'on' : ''}">${PC.esc(name)}</button>`
}

function renderGrid() {
  const grid = document.getElementById('grid')
  if (!state.assets.length) {
    grid.innerHTML = `<div class="col-span-full py-20 text-center fade-in">
      <div class="w-14 h-14 mx-auto rounded-xl bg-[#f1f1f3] flex items-center justify-center mb-3"><i class="fas fa-folder-open text-xl text-[#a1a1aa]"></i></div>
      <p class="text-[15px] font-semibold text-[#52525b]">자료가 없습니다</p>
      <p class="text-[13px] text-[#a1a1aa] mt-1">다른 진료나 카테고리를 선택해 보세요</p>
    </div>`
    return
  }
  grid.innerHTML = state.assets.map((a) => {
    const mine = a.clinic_id != null
    return `
    <a href="/consult/${a.id}" class="card card-hover card-in group block overflow-hidden">
      <div class="relative aspect-[4/3] overflow-hidden bg-[#f1f1f3] border-b border-[#f1f1f3]">
        <img src="${PC.thumbOf(a)}" alt="${PC.esc(a.title)}" loading="lazy" class="w-full h-full object-cover">
        <div class="absolute top-2.5 left-2.5">${PC.typeBadge(a.type)}</div>
        ${mine ? '<span class="absolute top-2.5 right-2.5 badge badge-accent">우리 병원</span>' : ''}
      </div>
      <div class="p-4">
        <h3 class="font-semibold text-[#18181b] text-[14.5px] leading-snug line-clamp-2 group-hover:text-[#4f46e5] transition-colors">${PC.esc(a.title)}</h3>
        <div class="mt-2 flex items-center justify-between text-[12px]">
          <span class="text-[#a1a1aa] font-medium">${PC.esc(a.treatment_name || '')}</span>
          ${a.reviewer_name ? `<span class="text-[#71717a]"><i class="fas fa-user-doctor text-[10px] mr-1"></i>${PC.esc(a.reviewer_name)}</span>` : ''}
        </div>
      </div>
    </a>`
  }).join('')
}

window.setSpecialty = async (sp) => {
  state.specialty = sp
  localStorage.setItem('pc_specialty', sp)
  state.treatment = 'all'
  await loadTreatments()
  render()
  loadAssets()
}
window.setTreatment = (id) => { state.treatment = id; render(); loadAssets() }
window.setCategory = (key) => { state.category = key; render(); loadAssets() }
let searchTimer
window.onSearch = (v) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = v; loadAssets() }, 300) }

init()
