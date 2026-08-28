// 라이브러리 홈
const CATEGORIES = [
  ['all', '전체', 'fa-border-all'],
  ['process', '치료 과정', 'fa-list-ol'],
  ['progression', '질환 진행', 'fa-stairs'],
  ['caution', '주의사항', 'fa-triangle-exclamation'],
  ['cost', '비용', 'fa-won-sign'],
  ['faq', '자주 묻는 질문', 'fa-circle-question'],
  ['clinic', '우리 병원 자료', 'fa-hospital'],
]

const state = { treatment: 'all', category: 'all', q: '', treatments: [], assets: [], loaded: false }

async function init() {
  await PC.loadMe()
  const { data } = await axios.get('/api/treatments')
  state.treatments = data.treatments
  render()
  await loadAssets()
}

async function loadAssets() {
  const grid = document.getElementById('grid')
  if (grid) grid.innerHTML = skeletons()
  const { data } = await axios.get('/api/assets', { params: { treatment: state.treatment, category: state.category, q: state.q } })
  state.assets = data.assets
  state.loaded = true
  renderGrid()
}

function skeletons() {
  return Array.from({ length: 8 }, () => `<div class="rounded-3xl overflow-hidden bg-white shadow-sm"><div class="skeleton aspect-[4/3]"></div><div class="p-4 space-y-2"><div class="skeleton h-5 rounded w-3/4"></div><div class="skeleton h-4 rounded w-1/2"></div></div></div>`).join('')
}

function render() {
  const u = PC.user
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('home')}

  <!-- 히어로 -->
  <section id="hero-section" class="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600">
    <div class="absolute inset-0 opacity-20" style="background-image:radial-gradient(circle at 80% 20%, #5eead4 0, transparent 45%), radial-gradient(circle at 15% 85%, #99f6e4 0, transparent 40%)"></div>
    <div class="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div class="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p class="text-brand-200 font-bold tracking-wide mb-2"><i class="fas fa-shield-heart mr-1.5"></i>${u?.clinic_name ? PC.esc(u.clinic_name) + ' 전용 상담 시스템' : '모든 치과가 영원히 무료로 쓰는 설명자료'}</p>
          <h1 class="text-3xl sm:text-5xl font-extrabold text-white leading-tight">환자의 눈높이에서,<br class="sm:hidden"> 그림으로 설명하세요</h1>
          <p class="mt-3 text-brand-100 text-lg">자료를 고르고 → 화면에 띄우고 → 그리며 설명하고 → 환자에게 보내세요</p>
        </div>
        <div class="relative w-full sm:w-[420px]">
          <i class="fas fa-magnifying-glass absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input id="search-input" type="search" placeholder="제목·태그 검색 (예: 임플란트, 통증)"
            class="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/95 text-lg shadow-xl focus:outline-none focus:ring-4 focus:ring-brand-300/60"
            oninput="onSearch(this.value)">
        </div>
      </div>
    </div>
  </section>

  <!-- 진료 탭 -->
  <div class="glass sticky top-[72px] md:top-[72px] z-30 border-b border-slate-200/70">
    <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-2.5 flex gap-2 overflow-x-auto" id="treatment-tabs">
      ${tabBtn('all', '전체')}
      ${state.treatments.map((t) => tabBtn(t.id, t.name)).join('')}
    </div>
  </div>

  <div class="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex gap-6">
    <!-- 좌측 카테고리 -->
    <aside id="category-sidebar" class="hidden lg:block w-56 shrink-0">
      <div class="sticky top-[150px] space-y-1">
        <p class="px-3 pb-2 text-xs font-bold tracking-widest text-slate-400 uppercase">카테고리</p>
        ${CATEGORIES.map(([key, label, icon]) => `
          <button onclick="setCategory('${key}')" class="btn-touch w-full flex items-center gap-3 px-4 rounded-xl text-left font-semibold transition ${state.category === key ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25' : 'text-slate-600 hover:bg-white hover:shadow-sm'}">
            <i class="fas ${icon} w-5 text-center ${state.category === key ? '' : 'text-brand-500'}"></i>${label}
          </button>`).join('')}
        ${u && u.clinic_id ? `
        <div class="pt-4">
          <a href="/manage" class="block p-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg">
            <i class="fas fa-cloud-arrow-up text-lg"></i>
            <p class="font-bold mt-1.5">병원 자료 올리기</p>
            <p class="text-xs text-brand-200 mt-0.5">이미지·영상 업로드, 자료 커스터마이즈</p>
          </a>
        </div>` : ''}
      </div>
    </aside>

    <!-- 본문 -->
    <main class="flex-1 min-w-0">
      <!-- 모바일 카테고리 -->
      <div class="lg:hidden flex gap-2 overflow-x-auto pb-4" id="category-chips">
        ${CATEGORIES.map(([key, label]) => `<button onclick="setCategory('${key}')" class="btn-touch shrink-0 px-4 rounded-xl font-semibold text-sm transition ${state.category === key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 shadow-sm'}">${label}</button>`).join('')}
      </div>
      <div id="grid" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">${skeletons()}</div>
    </main>
  </div>
  <footer class="py-10 text-center text-sm text-slate-400">
    페이션트 커넥트 · 모든 치과가 영원히 무료로 사용하는 공개 설명자료 라이브러리
  </footer>`
}

function tabBtn(id, name) {
  const active = String(state.treatment) === String(id)
  return `<button onclick="setTreatment('${id}')" class="btn-touch shrink-0 px-5 rounded-xl font-bold text-[15px] transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}">${PC.esc(name)}</button>`
}

function renderGrid() {
  const grid = document.getElementById('grid')
  if (!state.assets.length) {
    grid.innerHTML = `<div class="col-span-full py-20 text-center">
      <div class="w-20 h-20 mx-auto rounded-3xl bg-white shadow-sm flex items-center justify-center mb-4"><i class="fas fa-folder-open text-3xl text-slate-300"></i></div>
      <p class="text-lg font-bold text-slate-500">자료가 없습니다</p>
      <p class="text-slate-400 mt-1">다른 진료나 카테고리를 선택해 보세요</p>
    </div>`
    return
  }
  grid.innerHTML = state.assets.map((a, i) => {
    const mine = a.clinic_id != null
    return `
    <a href="/consult/${a.id}" class="asset-card card-in group block rounded-3xl overflow-hidden bg-white shadow-sm" style="animation-delay:${Math.min(i * 40, 400)}ms">
      <div class="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img src="${PC.thumbOf(a)}" alt="${PC.esc(a.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-[1.04] transition duration-500">
        <div class="absolute top-3 left-3 flex gap-1.5">${PC.typeBadge(a.type)}</div>
        <span class="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold ${mine ? 'bg-slate-900/85 text-brand-300' : 'bg-white/90 text-slate-600'}">${mine ? '우리 병원' : '공개 라이브러리'}</span>
        <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition flex items-end justify-center pb-4">
          <span class="px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-sm shadow-lg"><i class="fas fa-display mr-1.5"></i>상담 화면으로</span>
        </div>
      </div>
      <div class="p-4">
        <h3 class="font-bold text-slate-800 text-[17px] leading-snug line-clamp-2">${PC.esc(a.title)}</h3>
        <div class="mt-2 flex items-center justify-between text-sm">
          <span class="text-slate-400">${PC.esc(a.treatment_name || '')}</span>
          ${a.reviewer_name ? `<span class="inline-flex items-center gap-1 text-brand-700 font-semibold"><i class="fas fa-user-doctor text-xs"></i>감수 ${PC.esc(a.reviewer_name)}</span>` : ''}
        </div>
      </div>
    </a>`
  }).join('')
}

window.setTreatment = (id) => { state.treatment = id; render(); loadAssets() }
window.setCategory = (key) => { state.category = key; render(); loadAssets() }
let searchTimer
window.onSearch = (v) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = v; loadAssets() }, 300) }

init()
