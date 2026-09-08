// Shared workspace primitives. No patient data is persisted in browser storage.
window.PC = {
  user: null,
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) },
  url(s) { const v=String(s||'');return this.esc((/^\/(?!\/)/.test(v)||/^https:\/\//.test(v)||/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v))?v:'') },
  async loadMe() { const {data}=await axios.get('/api/auth/me');this.user=data.user;return this.user },
  async run(fn) { try{return await fn()}catch(e){this.error(e)} },
  error(e) { this.toast(e?.response?.data?.error || e?.message || '요청을 처리하지 못했습니다. 다시 시도해 주세요.','err') },
  toast(msg,type='ok') {
    let box=document.querySelector('.toast-container');if(!box){box=document.createElement('div');box.className='toast-container';box.setAttribute('aria-live','polite');document.body.append(box)}
    const el=document.createElement('div');el.className='toast'+(type==='err'?' error':'');el.innerHTML=`<i class="fas ${type==='err'?'fa-circle-exclamation':'fa-check'}" aria-hidden="true"></i> &nbsp;${this.esc(msg)}`;box.append(el);setTimeout(()=>el.remove(),4200)
  },
  mark(){return `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M20 7C10-2-1 11 9 20l11 11 11-11C41 11 30-2 20 7Z" stroke="currentColor" stroke-width="3.7"/><path d="M20 33C30 42 41 29 31 20L20 9 9 20C-1 29 10 42 20 33Z" stroke="currentColor" stroke-width="3.7"/></svg></span>`},
  brand(){return `<a class="brand" href="/">${this.mark()}<span>patient connect<span class="brand-sub" style="display:block">BETTER CARE, TOGETHER</span></span></a>`},
  typeInfo(type){return {image:['이미지','fa-image'],video:['영상','fa-play'],compare:['비포·애프터','fa-arrows-left-right'],progression:['질환 진행','fa-layer-group'],cost:['수가표','fa-receipt'],steps:['치료 과정','fa-list-ol'],faq:['자주 묻는 질문','fa-comment-dots']}[type]||['자료','fa-file']},
  typeBadge(type){const [label,icon]=this.typeInfo(type);return `<span class="badge badge-neutral"><i class="fas ${icon}" aria-hidden="true"></i>${label}</span>`},
  thumbOf(a){return a.media_urls?.[0]||a.payload?.steps?.[0]?.image||a.payload?.stages?.[0]?.image||`/ph?t=${encodeURIComponent(a.title||'자료')}&v=${Number(a.id)||0}`},
  date(s,full=false){if(!s)return '—';const d=new Date(s.includes('T')?s:s.replace(' ','T')+'Z');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit',...(full?{year:'numeric'}:{})})},
  datetime(s){if(!s)return '—';const d=new Date(s.includes('T')?s:s.replace(' ','T')+'Z');return d.toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})},
  expired(s){return !s||new Date(s.includes('T')?s:s.replace(' ','T')+'Z')<new Date()},
  empty(title,sub,icon='fa-folder-open'){return `<section class="empty-state"><i class="fas ${icon}" aria-hidden="true"></i><h3>${this.esc(title)}</h3><p>${this.esc(sub)}</p></section>`},
  heading(kicker,title,sub,action=''){return `<header class="page-heading"><div><p class="eyebrow" style="margin-bottom:7px;color:var(--accent)">${kicker}</p><h1>${title}</h1><p>${sub}</p></div>${action}</header>`},
  footer(){return `<footer class="page-footer"><span>© Patient Connect · 더 나은 설명, 더 깊은 신뢰.</span><span>Made for the moments that matter.</span></footer>`},
  shell(active,main){
    const u=this.user,clinic=u?.clinic_name||'함께 만드는 진료 경험', labels={home:'설명자료 라이브러리',favorites:'즐겨찾기',cases:'비포·애프터',manage:'병원 자료',sessions:'상담 이력',settings:'병원 설정',admin:'운영자 콘솔'}
    const nav=(href,label,icon,key)=>`<a href="${href}" class="nav-item ${active===key?'active':''}" ${active===key?'aria-current="page"':''}><i class="fas ${icon}" aria-hidden="true"></i>${label}</a>`
    return `<div class="app-shell"><button class="sb-backdrop" id="sb-backdrop" aria-label="메뉴 닫기" onclick="PC.toggleSidebar(false)"></button>
      <aside class="sidebar" id="sidebar">${this.brand()}<div class="clinic-switch"><span class="clinic-avatar"><i class="fas fa-house-medical" aria-hidden="true"></i></span><div class="grow"><p class="truncate" style="font-size:12px;font-weight:700">${this.esc(clinic)}</p><p class="subtle" style="font-size:10px">${this.esc(u?.clinic_specialty||'모든 병원을 위한 무료 도구')}</p></div><i class="fas fa-chevron-down subtle" style="font-size:8px" aria-hidden="true"></i></div>
      <nav aria-label="주 메뉴"><p class="nav-label">CONSULTATION</p>${nav('/','설명자료 라이브러리','fa-book-open','home')}${nav('/?view=favorites','즐겨찾기','fa-bookmark','favorites')}${nav('/cases','비포·애프터','fa-clone','cases')}
      ${u?.clinic_id?`<p class="nav-label">MY WORKSPACE</p>${nav('/manage','병원 자료','fa-folder-open','manage')}${nav('/manage?tab=sessions','상담 이력','fa-clock-rotate-left','sessions')}${nav('/manage?tab=settings','병원 설정','fa-sliders','settings')}`:''}
      ${u?.role==='admin'?`<p class="nav-label">ADMINISTRATION</p>${nav('/admin','운영자 콘솔','fa-chart-simple','admin')}`:''}</nav>
      <div class="sidebar-note"><i class="fas fa-seedling" style="margin-bottom:9px;color:#8d9f7c"></i><p>좋은 설명이 만드는<br><b>더 나은 환자 경험.</b></p><p style="font-size:10px;margin-top:9px">모든 병원에, 언제나 무료입니다.</p></div>
      <div class="user-box">${u?`<div class="row"><span class="avatar">${this.esc(u.name[0])}</span><div class="grow"><b style="font-size:12px">${this.esc(u.name)}</b><p class="subtle truncate" style="font-size:10px">${this.esc(u.email)}</p></div><button class="icon-btn" onclick="PC.logout()" title="로그아웃" aria-label="로그아웃"><i class="fas fa-arrow-right-from-bracket"></i></button></div>`:`<a href="/login" class="btn-primary" style="width:100%">병원 로그인 <i class="fas fa-arrow-right"></i></a>`}</div></aside>
      <div class="app-body"><header class="workspace-top"><div class="row"><button class="icon-btn mobile-only" aria-label="메뉴 열기" onclick="PC.toggleSidebar(true)"><i class="fas fa-bars"></i></button><div class="breadcrumb"><i class="fas fa-house" aria-hidden="true"></i><span>Workspace</span><i class="fas fa-angle-right" style="font-size:8px"></i><b>${labels[active]||labels.home}</b></div></div><div class="row"><span class="top-status"><span class="status-dot"></span>함께하는 더 나은 진료</span><span class="avatar desktop-only" style="display:grid">${this.esc(u?.name?.[0]||'P')}</span></div></header>${main}</div></div>`
  },
  toggleSidebar(open){document.getElementById('sidebar')?.classList.toggle('open',open);document.getElementById('sb-backdrop')?.classList.toggle('on',open)},
  async logout(){await this.run(async()=>{await axios.post('/api/auth/logout',{});location.href='/'})},
  async copy(value){try{await navigator.clipboard.writeText(value);this.toast('링크가 복사되었습니다.')}catch{this.modal('링크 복사',`<p class="help-note">아래 링크를 선택해 복사해 주세요.</p><input class="input" readonly value="${this.esc(value)}" onclick="this.select()">`)}},
  async share(url){if(navigator.share){try{await navigator.share({title:'병원에서 보내드린 상담 안내',url})}catch(e){if(e.name!=='AbortError')this.error(e)}}else await this.copy(url)},
  modal(title,body,footer='',small=false){
    this.closeModal();this.returnFocus=document.activeElement
    const el=document.createElement('div');el.className='modal-backdrop';el.id='pc-modal';el.innerHTML=`<section class="modal ${small?'small-modal':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${this.esc(title)}</h2><button class="icon-btn" aria-label="닫기" onclick="PC.closeModal()"><i class="fas fa-xmark"></i></button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section>`;document.body.append(el);this.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';el.querySelector('input,button')?.focus();
    el.addEventListener('keydown',e=>{if(e.key==='Escape')this.closeModal();if(e.key==='Tab'){const nodes=[...el.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&n.offsetParent!==null);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}})
  },
  closeModal(){const el=document.getElementById('pc-modal');if(el){el.remove();document.body.style.overflow=this.previousOverflow||'';this.returnFocus?.focus()}},
  confirm(title,message,action,label='확인'){this.modal(title,`<p class="help-note">${this.esc(message)}</p>`,`<button class="btn-ghost" onclick="PC.closeModal()">취소</button><button id="confirm-action" class="btn-primary">${this.esc(label)}</button>`,true);document.getElementById('confirm-action').onclick=async e=>{e.target.disabled=true;try{await action();this.closeModal()}catch(err){e.target.disabled=false;this.error(err)}}},
  async favorite(id,current,callback){if(!this.user){this.toast('로그인하면 즐겨찾기를 저장할 수 있습니다.');return}await this.run(async()=>{await axios.post(`/api/assets/${id}/favorite`,{favorite:!current});callback?.(!current)})},
  cover(a){
    const url=this.thumbOf(a),real=url&&!url.startsWith('/ph'),tone=(Number(a.id)||0)%4
    if(real&&a.type==='video')return `<div class="asset-cover tone-${tone}"><i class="fas fa-circle-play" style="font-size:45px;color:#748966"></i><span class="cover-label">VIDEO GUIDE</span></div>`
    if(real)return `<div class="asset-cover"><img src="${this.url(url)}" alt="${this.esc(a.title)}" loading="lazy"></div>`
    const colors=['#809577','#ac9676','#889bb0','#a091ac'],ink=colors[tone]
    let shape=''
    if(a.type==='cost')shape=`<rect x="40" y="17" width="122" height="137" rx="8" fill="#fff" opacity=".85"/><rect x="56" y="35" width="36" height="6" rx="3" fill="${ink}"/>${[63,86,109].map(y=>`<path d="M55 ${y}h88" stroke="${ink}" opacity=".23"/><rect x="56" y="${y+8}" width="44" height="4" rx="2" fill="${ink}" opacity=".4"/><rect x="126" y="${y+8}" width="17" height="4" rx="2" fill="${ink}"/>`).join('')}`
    else if(a.type==='faq')shape=`<rect x="33" y="32" width="133" height="93" rx="20" fill="white" opacity=".75"/><path d="M65 125v19l24-19" fill="white" opacity=".75"/><text x="100" y="97" text-anchor="middle" font-family="Georgia" font-size="63" fill="${ink}">?</text><circle cx="167" cy="32" r="15" fill="${ink}" opacity=".15"/>`
    else if(a.type==='steps'||a.type==='progression')shape=`<path d="M39 112Q70 20 112 70T175 40" fill="none" stroke="${ink}" stroke-dasharray="4 5" opacity=".65"/>${[[39,112],[89,63],[151,76]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="23" fill="white" opacity=".85"/><circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${ink}" opacity=".4"/><text x="${x}" y="${y+5}" text-anchor="middle" font-family="Georgia" font-size="17" fill="${ink}">${i+1}</text>`).join('')}`
    else shape=`<circle cx="100" cy="85" r="66" fill="white" opacity=".55"/><circle cx="100" cy="85" r="79" fill="none" stroke="${ink}" opacity=".2"/><path d="M70 65C61 33 83 30 100 42C117 30 139 33 130 65C123 90 117 97 116 122C112 142 103 132 105 111C105 93 95 93 95 111C97 132 88 142 84 122C83 97 77 90 70 65Z" fill="none" stroke="${ink}" stroke-width="3"/><path d="M85 51q15 8 30 0M155 46v16m-8-8h16" stroke="${ink}" stroke-width="2" opacity=".6"/>`
    return `<div class="asset-cover tone-${tone}"><span class="cover-label">${({cost:'TREATMENT COST',faq:'QUESTION & ANSWER',steps:'STEP BY STEP',progression:'UNDERSTAND THE CHANGE'})[a.type]||'PATIENT EDUCATION'}</span><svg viewBox="0 0 200 170" aria-hidden="true">${shape}</svg><span class="example-label">설명용 예시</span><span class="cover-number">${String(a.id).padStart(2,'0')}</span></div>`
  },
  assetCard(a){return `<article class="asset-card"><button class="favorite-btn ${a.favorite?'is-favorite':''}" aria-label="${a.favorite?'즐겨찾기 해제':'즐겨찾기 추가'}" aria-pressed="${!!a.favorite}" onclick="toggleFavorite(${Number(a.id)})"><i class="${a.favorite?'fas':'far'} fa-bookmark"></i></button><a class="cover-link" href="/consult/${Number(a.id)}">${this.cover(a)}</a><div class="asset-info"><div class="row" style="gap:6px">${this.typeBadge(a.type)}${a.clinic_id?'<span class="badge badge-accent">우리 병원</span>':''}<span class="subtle" style="font-size:10px;margin-left:auto">${this.esc(a.treatment_name||'공통')}</span></div><a href="/consult/${Number(a.id)}"><h3>${this.esc(a.title)}</h3></a><p>${this.esc(a.description||'환자의 이해를 돕는 상담 설명자료')}</p><div class="asset-meta"><span><span class="reviewer-dot"><i class="fas fa-user-doctor"></i></span>감수 ${this.esc(a.reviewer_name||'미지정')}</span><a href="/consult/${Number(a.id)}" class="open-arrow" aria-label="${this.esc(a.title)} 상담 시작">상담 열기 &nbsp;<i class="fas fa-arrow-up-right-from-square" style="font-size:8px"></i></a></div></div></article>`},
  observeReveals(){}
}
axios.defaults.headers.common['Accept']='application/json'
axios.defaults.headers.delete={'Content-Type':'application/json'}
window.addEventListener('unhandledrejection',e=>{PC.error(e.reason);e.preventDefault()})
document.addEventListener('keydown',e=>{if(e.key==='Escape')PC.toggleSidebar(false)})
