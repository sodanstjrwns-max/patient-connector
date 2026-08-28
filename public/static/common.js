// 공통 헬퍼 — Design v4 CLINICAL WORKSPACE (사이드바 앱 쉘)
window.PC = {
  user: null,
  async loadMe() {
    try { const { data } = await axios.get('/api/auth/me'); this.user = data.user } catch (e) { this.user = null }
    return this.user
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) },
  toast(msg, type = 'ok') {
    const el = document.createElement('div')
    el.className = 'toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-lg font-semibold text-sm shadow-lg bg-[#18181b] text-white flex items-center gap-2'
    el.innerHTML = `<i class="fas ${type === 'ok' ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-red-400'}"></i>${this.esc(msg)}`
    document.body.appendChild(el)
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 2200)
  },
  typeBadge(type) {
    const map = {
      image: ['이미지', 'fa-image'],
      video: ['영상', 'fa-play'],
      compare: ['비포·애프터', 'fa-arrows-left-right'],
      progression: ['질환 진행', 'fa-stairs'],
      cost: ['수가표', 'fa-won-sign'],
      steps: ['치료 과정', 'fa-list-ol'],
      faq: ['FAQ', 'fa-circle-question'],
    }
    const [label, icon] = map[type] || ['자료', 'fa-file']
    const dark = document.body.classList.contains('cinema')
    return `<span class="badge ${dark ? '' : 'badge-neutral'}" ${dark ? 'style="background:rgba(255,255,255,.1);color:#d4d4d8"' : ''}><i class="fas ${icon} text-[10px]"></i>${label}</span>`
  },
  thumbOf(asset) {
    if (asset.media_urls && asset.media_urls.length) return asset.media_urls[0]
    const p = asset.payload || {}
    if (p.steps && p.steps.length) return p.steps[0].image
    if (p.stages && p.stages.length) return p.stages[0].image
    if (asset.type === 'cost') return `/ph?t=${encodeURIComponent('수가표')}&s=${encodeURIComponent(asset.title)}&v=50`
    return `/ph?t=${encodeURIComponent(asset.title.slice(0, 8))}&v=${asset.id}`
  },

  // ===== 앱 쉘: 좌측 사이드바 + 메인 =====
  // 사용: PC.shell(activeKey, mainHTML [, topbarHTML])
  shell(active, mainHTML, topbarHTML = '') {
    const u = this.user
    const clinicName = u?.clinic_name || '페이션트 커넥트'
    const item = (href, label, icon, key) =>
      `<a href="${href}" class="nav-item ${active === key ? 'active' : ''}"><i class="fas ${icon}"></i>${label}</a>`
    return `
    <div class="flex min-h-screen">
      <div class="sb-backdrop" id="sb-backdrop" onclick="PC.toggleSidebar(false)"></div>
      <aside class="sidebar" id="sidebar">
        <div class="px-4 pt-5 pb-4 border-b border-[#f1f1f3]">
          <a href="/" class="flex items-center gap-2.5 min-w-0">
            <div class="shrink-0 w-8 h-8 rounded-lg bg-[#4f46e5] flex items-center justify-center">
              <i class="fas fa-hand-holding-medical text-white text-[13px]"></i>
            </div>
            <div class="min-w-0">
              <div class="clinic-title text-[15px] font-bold truncate leading-tight">${this.esc(clinicName)}</div>
              <div class="text-[10px] font-medium text-[#a1a1aa] leading-tight">Patient Connect</div>
            </div>
          </a>
        </div>
        <nav class="flex-1 px-3 py-3">
          <p class="nav-label" style="margin-top:2px">상담</p>
          ${item('/', '설명자료 라이브러리', 'fa-book-open', 'home')}
          ${item('/cases', '비포·애프터', 'fa-images', 'cases')}
          ${u && u.clinic_id ? `
          <p class="nav-label">우리 병원</p>
          ${item('/manage', '자료 관리', 'fa-folder-open', 'manage')}
          ${item('/manage?tab=sessions', '상담 이력', 'fa-clock-rotate-left', 'sessions')}
          ` : ''}
          ${u && u.role === 'admin' ? `
          <p class="nav-label">운영</p>
          ${item('/admin', '운영자 콘솔', 'fa-chart-simple', 'admin')}
          ` : ''}
        </nav>
        <div class="px-3 py-3 border-t border-[#f1f1f3]">
          ${u ? `
          <div class="flex items-center gap-2.5 px-2 py-1.5">
            <div class="w-7 h-7 rounded-full bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center text-[11px] font-bold shrink-0">${this.esc((u.name || '?')[0])}</div>
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold text-[#18181b] truncate leading-tight">${this.esc(u.name)}</p>
              <p class="text-[11px] text-[#a1a1aa] truncate leading-tight">${this.esc(u.email)}</p>
            </div>
            <button onclick="PC.logout()" title="로그아웃" class="shrink-0 w-8 h-8 rounded-lg text-[#a1a1aa] hover:bg-[#f1f1f3] hover:text-[#18181b] transition"><i class="fas fa-arrow-right-from-bracket text-[12px]"></i></button>
          </div>` : `
          <a href="/login" class="btn-primary w-full"><i class="fas fa-arrow-right-to-bracket text-[12px]"></i>병원 로그인</a>
          <p class="mt-2 text-center text-[11px] text-[#a1a1aa]">모든 기능 영원히 무료</p>`}
        </div>
      </aside>
      <div class="flex-1 min-w-0 flex flex-col">
        <div class="lg:hidden sticky top-0 z-40 bg-white border-b border-[#e4e4e7] px-3 h-[52px] flex items-center gap-2">
          <button onclick="PC.toggleSidebar(true)" class="w-10 h-10 rounded-lg text-[#52525b] hover:bg-[#f1f1f3]"><i class="fas fa-bars"></i></button>
          <span class="font-bold text-[15px] truncate">${this.esc(clinicName)}</span>
        </div>
        ${topbarHTML}
        <div class="flex-1 min-w-0">${mainHTML}</div>
      </div>
    </div>`
  },
  toggleSidebar(open) {
    document.getElementById('sidebar')?.classList.toggle('open', open)
    document.getElementById('sb-backdrop')?.classList.toggle('on', open)
  },
  observeReveals() {}, // v4: 스크롤 리빌 제거 (레거시 호환 no-op)
  headerHTML() { return '' }, // 레거시 호환 no-op
  async logout() { await axios.post('/api/auth/logout'); location.href = '/' },
}
