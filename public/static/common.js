// 공통 헬퍼 — Design v2 AURORA DARK
window.PC = {
  user: null,
  async loadMe() {
    try { const { data } = await axios.get('/api/auth/me'); this.user = data.user } catch (e) { this.user = null }
    return this.user
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) },
  toast(msg, type = 'ok') {
    const el = document.createElement('div')
    el.className = 'toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3.5 rounded-2xl font-bold shadow-2xl text-base glass-strong ' + (type === 'ok' ? 'text-teal-300' : 'text-red-400')
    el.innerHTML = `<i class="fas ${type === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'} mr-2"></i>${this.esc(msg)}`
    document.body.appendChild(el)
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400) }, 2200)
  },
  typeBadge(type) {
    const map = {
      image: ['이미지', 'fa-image', 'text-sky-300 bg-sky-400/15 border-sky-400/25'],
      video: ['영상', 'fa-play', 'text-rose-300 bg-rose-400/15 border-rose-400/25'],
      compare: ['비포·애프터', 'fa-arrows-left-right', 'text-violet-300 bg-violet-400/15 border-violet-400/25'],
      progression: ['질환 진행', 'fa-stairs', 'text-amber-300 bg-amber-400/15 border-amber-400/25'],
      cost: ['수가표', 'fa-won-sign', 'text-emerald-300 bg-emerald-400/15 border-emerald-400/25'],
      steps: ['치료 과정', 'fa-list-ol', 'text-teal-300 bg-teal-400/15 border-teal-400/25'],
      faq: ['FAQ', 'fa-circle-question', 'text-indigo-300 bg-indigo-400/15 border-indigo-400/25'],
    }
    const [label, icon, cls] = map[type] || ['자료', 'fa-file', 'text-slate-300 bg-white/10 border-white/15']
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold border backdrop-blur ${cls}"><i class="fas ${icon}"></i>${label}</span>`
  },
  thumbOf(asset) {
    if (asset.media_urls && asset.media_urls.length) return asset.media_urls[0]
    const p = asset.payload || {}
    if (p.steps && p.steps.length) return p.steps[0].image
    if (p.stages && p.stages.length) return p.stages[0].image
    if (asset.type === 'cost') return `/ph?t=${encodeURIComponent('수가표')}&s=${encodeURIComponent(asset.title)}&v=50`
    return `/ph?t=${encodeURIComponent(asset.title.slice(0, 8))}&v=${asset.id}`
  },
  // 화이트라벨 헤더 — 병원 이름이 주인공
  headerHTML(active) {
    const u = this.user
    const clinicName = u?.clinic_name || '페이션트 커넥트'
    const nav = (href, label, key) =>
      `<a href="${href}" class="btn-touch inline-flex items-center px-4 rounded-xl font-bold text-[15px] transition ${active === key ? 'bg-white/12 text-teal-300 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-white/6'}">${label}</a>`
    return `
    <header class="glass-strong sticky top-0 z-40">
      <div class="max-w-[1700px] mx-auto px-4 sm:px-7 h-[76px] flex items-center gap-4">
        <a href="/" class="flex items-center gap-3.5 min-w-0 group">
          <div class="relative shrink-0">
            <div class="absolute inset-0 rounded-2xl bg-teal-400/40 blur-lg group-hover:bg-teal-400/60 transition"></div>
            <div class="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center">
              <i class="fas fa-hand-holding-medical text-white text-lg"></i>
            </div>
          </div>
          <div class="min-w-0">
            <div class="clinic-title text-[22px] sm:text-[26px] font-black truncate leading-none tracking-tight">${this.esc(clinicName)}</div>
            <div class="text-[10px] font-bold tracking-[0.28em] text-slate-500 uppercase mt-1">Patient Connect</div>
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
            <span class="hidden sm:flex items-center gap-2 text-sm text-slate-400 font-semibold"><span class="w-2 h-2 rounded-full bg-teal-400 pulse-glow"></span>${this.esc(u.name)}님</span>
            <button onclick="PC.logout()" class="btn-touch px-4 rounded-xl text-sm font-bold text-slate-500 hover:text-white hover:bg-white/6 transition">로그아웃</button>
          ` : `<a href="/login" class="btn-touch btn-primary inline-flex items-center px-5 rounded-xl">병원 로그인</a>`}
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
  async logout() { await axios.post('/api/auth/logout'); location.href = '/' },
}
document.body.classList.add('aurora-bg')
