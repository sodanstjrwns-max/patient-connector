// 공통 헬퍼 — Design v3 APPLE LIGHT
window.PC = {
  user: null,
  async loadMe() {
    try { const { data } = await axios.get('/api/auth/me'); this.user = data.user } catch (e) { this.user = null }
    return this.user
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) },
  toast(msg, type = 'ok') {
    const el = document.createElement('div')
    const dark = document.body.classList.contains('cinema')
    el.className = 'toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-4 rounded-2xl font-bold shadow-2xl text-base ' +
      (dark ? 'glass-strong ' : 'bg-[#1d1d1f]/92 backdrop-blur-xl text-white ') +
      (type === 'ok' ? (dark ? 'text-sky-300' : '') : (dark ? 'text-red-400' : ''))
    el.innerHTML = `<i class="fas ${type === 'ok' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-red-400'} mr-2"></i>${this.esc(msg)}`
    document.body.appendChild(el)
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400) }, 2200)
  },
  typeBadge(type) {
    const dark = document.body.classList.contains('cinema')
    const mapLight = {
      image: ['이미지', 'fa-image', 'text-sky-700 bg-sky-100'],
      video: ['영상', 'fa-play', 'text-rose-700 bg-rose-100'],
      compare: ['비포·애프터', 'fa-arrows-left-right', 'text-violet-700 bg-violet-100'],
      progression: ['질환 진행', 'fa-stairs', 'text-amber-700 bg-amber-100'],
      cost: ['수가표', 'fa-won-sign', 'text-emerald-700 bg-emerald-100'],
      steps: ['치료 과정', 'fa-list-ol', 'text-blue-700 bg-blue-100'],
      faq: ['FAQ', 'fa-circle-question', 'text-indigo-700 bg-indigo-100'],
    }
    const mapDark = {
      image: ['이미지', 'fa-image', 'text-sky-300 bg-sky-400/15 border border-sky-400/25'],
      video: ['영상', 'fa-play', 'text-rose-300 bg-rose-400/15 border border-rose-400/25'],
      compare: ['비포·애프터', 'fa-arrows-left-right', 'text-violet-300 bg-violet-400/15 border border-violet-400/25'],
      progression: ['질환 진행', 'fa-stairs', 'text-amber-300 bg-amber-400/15 border border-amber-400/25'],
      cost: ['수가표', 'fa-won-sign', 'text-emerald-300 bg-emerald-400/15 border border-emerald-400/25'],
      steps: ['치료 과정', 'fa-list-ol', 'text-teal-300 bg-teal-400/15 border border-teal-400/25'],
      faq: ['FAQ', 'fa-circle-question', 'text-indigo-300 bg-indigo-400/15 border border-indigo-400/25'],
    }
    const map = dark ? mapDark : mapLight
    const [label, icon, cls] = map[type] || ['자료', 'fa-file', dark ? 'text-slate-300 bg-white/10 border border-white/15' : 'text-slate-600 bg-slate-100']
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold backdrop-blur ${cls}"><i class="fas ${icon}"></i>${label}</span>`
  },
  thumbOf(asset) {
    if (asset.media_urls && asset.media_urls.length) return asset.media_urls[0]
    const p = asset.payload || {}
    if (p.steps && p.steps.length) return p.steps[0].image
    if (p.stages && p.stages.length) return p.stages[0].image
    if (asset.type === 'cost') return `/ph?t=${encodeURIComponent('수가표')}&s=${encodeURIComponent(asset.title)}&v=50`
    return `/ph?t=${encodeURIComponent(asset.title.slice(0, 8))}&v=${asset.id}`
  },
  // 화이트라벨 헤더 — 애플식 프로스티드 네비, 병원 이름이 주인공
  headerHTML(active) {
    const u = this.user
    const clinicName = u?.clinic_name || '페이션트 커넥트'
    const nav = (href, label, key) =>
      `<a href="${href}" class="btn-touch inline-flex items-center px-4 rounded-full font-semibold text-[15px] transition ${active === key ? 'bg-[#1d1d1f] text-white' : 'text-[#424245] hover:bg-black/5'}">${label}</a>`
    return `
    <header class="glass-strong sticky top-0 z-40 border-x-0 border-t-0">
      <div class="max-w-[1700px] mx-auto px-4 sm:px-7 h-[72px] flex items-center gap-4">
        <a href="/" class="flex items-center gap-3.5 min-w-0 group">
          <div class="relative shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-lg shadow-[#0071e3]/25 group-hover:scale-105 transition duration-300">
            <i class="fas fa-hand-holding-medical text-white text-[17px]"></i>
          </div>
          <div class="min-w-0">
            <div class="clinic-title text-[21px] sm:text-[25px] font-extrabold truncate leading-none tracking-tight">${this.esc(clinicName)}</div>
            <div class="text-[9.5px] font-bold tracking-[0.3em] text-[#a1a1a6] uppercase mt-1">Patient Connect</div>
          </div>
        </a>
        <nav class="ml-auto hidden md:flex items-center gap-1">
          ${nav('/', '라이브러리', 'home')}
          ${nav('/cases', '비포·애프터', 'cases')}
          ${u && u.clinic_id ? nav('/manage', '자료 관리', 'manage') : ''}
          ${u && u.role === 'admin' ? nav('/admin', '운영자', 'admin') : ''}
        </nav>
        <div class="ml-1 flex items-center gap-2">
          ${u ? `
            <span class="hidden sm:flex items-center gap-2 text-sm text-[#6e6e73] font-semibold"><span class="w-2 h-2 rounded-full bg-emerald-500 pulse-glow"></span>${this.esc(u.name)}님</span>
            <button onclick="PC.logout()" class="btn-touch px-4 rounded-full text-sm font-semibold text-[#86868b] hover:bg-black/5 transition">로그아웃</button>
          ` : `<a href="/login" class="btn-touch btn-primary inline-flex items-center px-6 text-[15px]">병원 로그인</a>`}
        </div>
      </div>
      <nav class="md:hidden flex gap-1 px-3 pb-2.5 overflow-x-auto">
        ${nav('/', '라이브러리', 'home')}
        ${nav('/cases', '비포·애프터', 'cases')}
        ${u && u.clinic_id ? nav('/manage', '자료 관리', 'manage') : ''}
        ${u && u.role === 'admin' ? nav('/admin', '운영자', 'admin') : ''}
      </nav>
    </header>`
  },
  // 스크롤 리빌 — render 후 호출하면 .reveal 요소가 순차 등장
  observeReveals(root) {
    const els = (root || document).querySelectorAll('.reveal:not(.in)')
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return }
    if (!this._io) {
      this._io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); this._io.unobserve(e.target) } })
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    }
    els.forEach((el) => this._io.observe(el))
  },
  async logout() { await axios.post('/api/auth/logout'); location.href = '/' },
}
if (!document.body.classList.contains('cinema')) document.body.classList.add('apple-bg')
