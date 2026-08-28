// 라이브러리 홈 — v3 APPLE LIGHT, 전 진료과
const SPECIALTY_ICONS = {
  '치과': 'fa-tooth', '피부·미용': 'fa-spa', '성형외과': 'fa-wand-magic-sparkles',
  '정형·재활': 'fa-bone', '안과': 'fa-eye', '한방': 'fa-leaf',
}
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
  specialty: localStorage.getItem('pc_specialty') || '치과',
  specialties: [], treatments: [],
  treatment: 'all', category: 'all', q: '',
  assets: [],
}

async function init() {
  await PC.loadMe()
  if (PC.user?.clinic_specialty) state.specialty = PC.user.clinic_specialty
  await loadTreatments()
  render()
  await loadAssets()
}

async function loadTreatments() {
  const { data } = await axios.get('/api/treatments', { params: { specialty: state.specialty } })
  state.treatments = data.treatments
  state.specialties = data.specialties
}

async function loadAssets() {
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
  renderGrid()
}

function skeletons() {
  return Array.from({ length: 8 }, () => `<div class="card overflow-hidden"><div class="skeleton aspect-[4/3]"></div><div class="p-5 space-y-2.5"><div class="skeleton h-5 rounded-lg w-3/4"></div><div class="skeleton h-4 rounded-lg w-1/2"></div></div></div>`).join('')
}

function render() {
  const u = PC.user
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('home')}

  <!-- 히어로: 애플 스타일 센터 정렬 대형 타이포 -->
  <section id="hero-section" class="relative overflow-hidden">
    <div class="blob w-[420px] h-[420px] bg-[#5e5ce6]/12 -top-32 -right-24"></div>
    <div class="blob w-[360px] h-[360px] bg-[#0071e3]/10 top-20 -left-28" style="animation-delay:-6s"></div>
    <div class="relative max-w-[1100px] mx-auto px-5 pt-16 sm:pt-24 pb-10 text-center">
      ${u?.clinic_name ? `
      <div class="reveal inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-[#0071e3] text-sm font-bold mb-6">
        <span class="w-2 h-2 rounded-full bg-emerald-500 pulse-glow"></span>${PC.esc(u.clinic_name)} 전용 상담 시스템
      </div>` : `
      <div class="reveal inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-[#6e6e73] text-sm font-bold mb-6">
        모든 병원이 <span class="grad-text-blue font-extrabold">영원히 무료</span>로 쓰는 설명자료 라이브러리
      </div>`}
      <h1 class="hero-title reveal reveal-d1 text-[#1d1d1f]">
        설명이 달라지면,<br><span class="grad-text grad-animate">환자의 마음</span>이 움직입니다.
      </h1>
      <p class="hero-sub reveal reveal-d2 mt-6 max-w-xl mx-auto">자료를 고르고, 화면에 띄우고, 그리며 설명하고,<br class="hidden sm:block">상담이 끝나면 환자 폰으로 보내세요.</p>
      <div class="reveal reveal-d3 mt-9 max-w-xl mx-auto relative">
        <i class="fas fa-magnifying-glass absolute left-6 top-1/2 -translate-y-1/2 text-[#a1a1a6]"></i>
        <input id="search-input" type="search" placeholder="제목·태그 검색 (예: 임플란트, 보톡스)"
          class="input-light w-full h-[62px] pr-6 text-lg font-medium shadow-lg shadow-black/5" style="padding-left:3.5rem;border-radius:980px"
          oninput="onSearch(this.value)">
      </div>

      <!-- 진료과 선택 -->
      <div class="reveal reveal-d3 mt-9 flex flex-wrap justify-center gap-2.5" id="specialty-tabs">
        ${state.specialties.map((sp) => `
        <button onclick="setSpecialty('${sp}')" class="chip ${state.specialty === sp ? 'on' : ''} btn-touch shrink-0 inline-flex items-center gap-2.5 px-5 text-[15px]">
          <i class="fas ${SPECIALTY_ICONS[sp] || 'fa-stethoscope'}"></i>${sp}
        </button>`).join('')}
      </div>
    </div>
  </section>

  <!-- 진료 탭: 프로스티드 스티키 바 -->
  <div class="glass sticky top-[72px] z-30 border-x-0">
    <div class="max-w-[1700px] mx-auto px-4 sm:px-7 py-3 flex gap-2 overflow-x-auto justify-start lg:justify-center" id="treatment-tabs">
      ${tabBtn('all', '전체')}
      ${state.treatments.map((t) => tabBtn(t.id, t.name)).join('')}
    </div>
  </div>

  <div class="max-w-[1700px] mx-auto px-4 sm:px-7 py-10 flex gap-10">
    <!-- 좌측 카테고리 -->
    <aside id="category-sidebar" class="hidden lg:block w-60 shrink-0">
      <div class="sticky top-[150px] space-y-1">
        <p class="px-4 pb-2.5 text-[11px] font-extrabold tracking-[0.25em] text-[#a1a1a6] uppercase">카테고리</p>
        ${CATEGORIES.map(([key, label, icon]) => `
          <button onclick="setCategory('${key}')" class="btn-touch w-full flex items-center gap-3.5 px-4 rounded-2xl text-left font-semibold text-[15px] transition ${state.category === key ? 'bg-white shadow-md shadow-black/5 text-[#0071e3]' : 'text-[#6e6e73] hover:bg-white/70'}">
            <i class="fas ${icon} w-5 text-center ${state.category === key ? 'text-[#0071e3]' : 'text-[#c7c7cc]'}"></i>${label}
          </button>`).join('')}
        ${u && u.clinic_id ? `
        <div class="pt-6">
          <a href="/manage" class="block p-5 rounded-3xl bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] text-white shadow-xl shadow-[#5e5ce6]/30 hover:scale-[1.02] transition duration-300 group">
            <div class="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-105 transition"><i class="fas fa-cloud-arrow-up"></i></div>
            <p class="font-extrabold mt-3.5">병원 자료 올리기</p>
            <p class="text-[13px] text-white/70 mt-1 leading-snug">이미지·영상 업로드,<br>자료 커스터마이즈</p>
          </a>
        </div>` : ''}
      </div>
    </aside>

    <!-- 본문 -->
    <main class="flex-1 min-w-0">
      <div class="lg:hidden flex gap-2 overflow-x-auto pb-5" id="category-chips">
        ${CATEGORIES.map(([key, label]) => `<button onclick="setCategory('${key}')" class="chip ${state.category === key ? 'on' : ''} btn-touch shrink-0 px-4 text-sm">${label}</button>`).join('')}
      </div>
      <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">${skeletons()}</div>
    </main>
  </div>
  <footer class="py-14 text-center text-sm text-[#a1a1a6]">
    페이션트 커넥트 · 모든 병원이 영원히 무료로 사용하는 공개 설명자료 라이브러리
  </footer>`
  PC.observeReveals()
}

function tabBtn(id, name) {
  const active = String(state.treatment) === String(id)
  return `<button onclick="setTreatment('${id}')" class="btn-touch shrink-0 px-5 rounded-full font-semibold text-[15px] transition ${active ? 'bg-[#1d1d1f] text-white shadow-lg shadow-black/15' : 'text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/5'}">${PC.esc(name)}</button>`
}

function renderGrid() {
  const grid = document.getElementById('grid')
  if (!state.assets.length) {
    grid.innerHTML = `<div class="col-span-full py-24 text-center fade-in">
      <div class="w-24 h-24 mx-auto rounded-[2rem] card flex items-center justify-center mb-5 float-y"><i class="fas fa-folder-open text-4xl text-[#c7c7cc]"></i></div>
      <p class="text-xl font-extrabold text-[#6e6e73]">자료가 없습니다</p>
      <p class="text-[#a1a1a6] mt-1.5">다른 진료나 카테고리를 선택해 보세요</p>
    </div>`
    return
  }
  grid.innerHTML = state.assets.map((a, i) => {
    const mine = a.clinic_id != null
    return `
    <a href="/consult/${a.id}" class="card card-hover card-in group block overflow-hidden" style="animation-delay:${Math.min(i * 45, 450)}ms">
      <div class="relative aspect-[4/3] overflow-hidden bg-[#f5f5f7]">
        <img src="${PC.thumbOf(a)}" alt="${PC.esc(a.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-[1.06] transition duration-[900ms] ease-[cubic-bezier(.22,1,.36,1)]">
        <div class="absolute top-3.5 left-3.5 flex gap-1.5">${PC.typeBadge(a.type)}</div>
        <span class="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold backdrop-blur-md ${mine ? 'bg-[#0071e3] text-white' : 'bg-white/85 text-[#6e6e73]'}">${mine ? '우리 병원' : '공개'}</span>
        <div class="absolute inset-x-0 bottom-0 p-4 translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition duration-300">
          <span class="inline-flex items-center gap-2 px-5 py-2.5 btn-primary text-sm"><i class="fas fa-display"></i>상담 화면으로</span>
        </div>
      </div>
      <div class="p-5">
        <h3 class="font-bold text-[#1d1d1f] text-[17px] leading-snug line-clamp-2">${PC.esc(a.title)}</h3>
        <div class="mt-2.5 flex items-center justify-between text-[13px]">
          <span class="text-[#a1a1a6] font-semibold">${PC.esc(a.treatment_name || '')}</span>
          ${a.reviewer_name ? `<span class="inline-flex items-center gap-1.5 text-[#0071e3] font-bold"><i class="fas fa-user-doctor text-[11px]"></i>${PC.esc(a.reviewer_name)}</span>` : ''}
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
