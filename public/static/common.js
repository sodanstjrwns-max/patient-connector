// 공통 헬퍼
window.PC = {
  user: null,
  async loadMe() {
    try { const { data } = await axios.get('/api/auth/me'); this.user = data.user; } catch (e) { this.user = null }
    return this.user
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) },
  toast(msg, type = 'ok') {
    const el = document.createElement('div')
    el.className = 'toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl text-white font-semibold shadow-2xl text-base ' + (type === 'ok' ? 'bg-slate-900/90' : 'bg-red-600/95')
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400) }, 2200)
  },
  typeBadge(type) {
    const map = {
      image: ['이미지', 'fa-image', 'bg-sky-100 text-sky-700'],
      video: ['영상', 'fa-play', 'bg-rose-100 text-rose-700'],
      compare: ['비포·애프터', 'fa-arrows-left-right', 'bg-violet-100 text-violet-700'],
      progression: ['질환 진행', 'fa-stairs', 'bg-amber-100 text-amber-700'],
      cost: ['수가표', 'fa-won-sign', 'bg-emerald-100 text-emerald-700'],
      steps: ['치료 과정', 'fa-list-ol', 'bg-brand-100 text-brand-700'],
      faq: ['FAQ', 'fa-circle-question', 'bg-indigo-100 text-indigo-700'],
    }
    const [label, icon, cls] = map[type] || ['자료', 'fa-file', 'bg-slate-100 text-slate-600']
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}"><i class="fas ${icon}"></i>${label}</span>`
  },
  thumbOf(asset) {
    if (asset.media_urls && asset.media_urls.length) return asset.media_urls[0]
    const p = asset.payload || {}
    if (p.steps && p.steps.length) return p.steps[0].image
    if (p.stages && p.stages.length) return p.stages[0].image
    if (asset.type === 'cost') return `/ph?t=${encodeURIComponent('수가표')}&s=${encodeURIComponent(asset.title)}&v=50`
    return `/ph?t=${encodeURIComponent(asset.title.slice(0, 8))}&v=${asset.id}`
  },
  // 병원 이름 헤더 (화이트라벨)
  headerHTML(active) {
    const u = this.user
    const clinicName = u?.clinic_name || '페이션트 커넥트'
    const nav = (href, label, key) =>
      `<a href="${href}" class="btn-touch inline-flex items-center px-4 rounded-xl font-semibold text-[15px] transition ${active === key ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25' : 'text-slate-600 hover:bg-slate-100'}">${label}</a>`
    return `
    <header class="glass sticky top-0 z-40 border-b border-slate-200/70">
      <div class="max-w-[1600px] mx-auto px-4 sm:px-6 h-[72px] flex items-center gap-3">
        <a href="/" class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-600/30 shrink-0">
            <i class="fas fa-tooth text-white text-lg"></i>
          </div>
          <div class="min-w-0">
            <div class="clinic-title text-xl sm:text-2xl font-extrabold truncate leading-tight">${this.esc(clinicName)}</div>
            <div class="text-[11px] font-semibold tracking-widest text-slate-400 uppercase">Patient Connect</div>
          </div>
        </a>
        <nav class="ml-auto hidden md:flex items-center gap-1">
          ${nav('/', '라이브러리', 'home')}
          ${u && u.clinic_id ? nav('/cases', '비포·애프터', 'cases') : ''}
          ${u && u.clinic_id ? nav('/manage', '자료 관리', 'manage') : ''}
          ${u && u.role === 'admin' ? nav('/admin', '운영자', 'admin') : ''}
        </nav>
        <div class="ml-2 flex items-center gap-2">
          ${u ? `
            <span class="hidden sm:block text-sm text-slate-500 font-medium">${this.esc(u.name)}님</span>
            <button onclick="PC.logout()" class="btn-touch px-4 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition">로그아웃</button>
          ` : `<a href="/login" class="btn-touch inline-flex items-center px-5 rounded-xl bg-brand-600 text-white font-bold shadow-lg shadow-brand-600/25 hover:bg-brand-700 transition">병원 로그인</a>`}
        </div>
      </div>
      <nav class="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto">
        ${nav('/', '라이브러리', 'home')}
        ${u && u.clinic_id ? nav('/cases', '비포·애프터', 'cases') : ''}
        ${u && u.clinic_id ? nav('/manage', '자료 관리', 'manage') : ''}
        ${u && u.role === 'admin' ? nav('/admin', '운영자', 'admin') : ''}
      </nav>
    </header>`
  },
  async logout() { await axios.post('/api/auth/logout'); location.href = '/' },
}
