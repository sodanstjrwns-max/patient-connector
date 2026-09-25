/* Patient Connect 병원 콘솔 — 자료함 · 설명하기 · 보내기 · 발송내역 · 설정 (의존성 없음) */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 【2026-09-23 원장】자료 종류는 넷: 설명자료(진료·질환 설명 모두) · 주의사항 · 비포애프터 · 비용설명. 저장된 kind(explain/disease)는 그대로 두고 화면에서만 묶는다.
  const KIND = { explain: '설명자료', disease: '설명자료', cost: '비용설명', before_after: '비포애프터', notice: '주의사항' };
  const KIND_DESC = { explain: '치료 과정·질환 이해를 돕는 영상·이미지·글', notice: '치료 전후 관리와 생활 주의사항', before_after: '우리 병원 치료 전·후 사진 (병원 내 설명용, 외부 전송은 확인 후)', cost: '치료 항목별 비용 안내표' };
  const LIBRARY_KINDS = ['explain', 'notice', 'before_after', 'cost'];
  const groupKind = (kind) => kind === 'disease' ? 'explain' : kind;
  const KIND_COLOR = { explain: 'bg-sky-100 text-sky-800', disease: 'bg-sky-100 text-sky-800', before_after: 'bg-violet-100 text-violet-800', cost: 'bg-amber-100 text-amber-800', notice: 'bg-rose-100 text-rose-800' };
  const KIND_ICON = { explain: 'fa-circle-play', notice: 'fa-triangle-exclamation', before_after: 'fa-images', cost: 'fa-won-sign' };
  const won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';
  const state = { me: null, patient: null, materials: [], hidden: [], today: [], tab: 'library', dispatches: [], stats: null, library: { categories: {}, library_count: 0, imported_count: 0, locked_count: 0, library_notice: '' }, filter: '', kindFilter: '', mediaFilter: '', categoryFilter: '', editing: null, present: null, sets: [], scope: '', overview: true };
  const app = $('#app');

  async function api(path, opt) {
    const r = await fetch('/api' + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opt || {}));
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.auth_required) { location.href = '/api/auth/hub'; throw new Error('auth'); }
    if (!r.ok) { const error = new Error(j.error || ('오류 ' + r.status)); error.status = r.status; throw error; }
    return j;
  }
  function bodyHtml(text) {
    return String(text || '').split('\n').map((l) => l.startsWith('- ') ? `<div class="li">${esc(l.slice(2))}</div>` : `<div>${l.trim() ? esc(l) : '&nbsp;'}</div>`).join('');
  }
  // 【2026-09-25】patientfunnel.kr 존은 국내 트래픽이 해외 PoP(LAX)로 붙어 영상이 끊긴다. 공개 라이브러리 미디어는 ICN으로 붙는 pages.dev 원본으로 직접 받는다(같은 워커, CORS 허용).
  const MEDIA_PUBLIC = 'https://patient-connect.pages.dev/a/';
  const isLibraryKey = key => typeof key === 'string' && key.startsWith('library/');
  function imgUrl(key, token) { return (isLibraryKey(key) ? MEDIA_PUBLIC : '/a/') + key + (token ? '?t=' + token : ''); }
  const isVideo = im => im?.media_type === 'video' || /\.(mp4|webm)$/i.test(im?.key || '');
  // 【2026-09-20】설명 영상 배속: 1·1.5·2·3배 (설명 화면·안내장 공통 .pc-speed, 선택값은 기기별 기억)
  const speedBar = () => `<div class="pc-speed" role="group" aria-label="재생 속도">${[1,1.5,2,3].map(v => `<button type="button" data-speed="${v}">${v}×</button>`).join('')}</div>`;
  const mediaHtml = (im, token, cls='w-full') => isVideo(im) ? `<div class="pc-video"><video src="${imgUrl(im.key, token)}" ${isLibraryKey(im.key) ? 'crossorigin="anonymous"' : ''} ${im.poster_key ? `poster="${imgUrl(im.poster_key, token)}"` : ''} controls playsinline preload="metadata" class="${cls}" aria-label="${esc(im.caption || '설명 영상')}"></video>${speedBar()}</div>` : `<img src="${imgUrl(im.key, token)}" ${isLibraryKey(im.key) ? 'crossorigin="anonymous"' : ''} alt="${esc(im.caption || '설명 이미지')}" class="${cls}" loading="lazy">`;
  function toast(msg, ok) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm z-[70] fade-in ' + (ok === false ? 'bg-rose-600' : 'bg-slate-900');
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  // The selection and current scope are restored only after the clinic identity is known.
  function saveToday() { sessionStorage.setItem('pc_today_' + state.me.hospital.id, JSON.stringify(state.today)); }
  // 【2026-09-23】지금 환자 — 설명 시작 때 고르고, 보내기까지 따라간다. {checkin_id?, name, last4, phone?} (브라우저 세션에만 저장)
  function savePatient() { const k = 'pc_patient_' + state.me.hospital.id; if (state.patient) sessionStorage.setItem(k, JSON.stringify(state.patient)); else sessionStorage.removeItem(k); }
  function loadPatient() { try { state.patient = JSON.parse(sessionStorage.getItem('pc_patient_' + state.me.hospital.id) || 'null'); } catch { state.patient = null; } }
  function patientBarHtml() {
    const p = state.patient;
    if (p) return `<div class="pc-patient on" id="pc-patient"><i class="fa-solid fa-user-check"></i><div class="flex-1 min-w-0"><b>${esc(p.name)}</b><span class="text-slate-500 text-xs ml-2">${p.checkin_id ? '오늘 접수 · ' : '직접 입력 · '}${p.last4 ? '****-' + esc(p.last4) : '번호 없음'}</span></div><button type="button" id="pc-pt-change" class="text-xs text-sky-700 font-semibold">바꾸기</button><button type="button" id="pc-pt-clear" class="text-xs text-slate-400 ml-2">해제</button></div>`;
    return `<div class="pc-patient" id="pc-patient"><div class="flex items-center gap-2 mb-2"><i class="fa-solid fa-user-plus text-sky-600"></i><b>지금 환자</b><span class="text-xs text-slate-500">설명이 끝나면 이 분께 알림톡을 보냅니다</span><button type="button" id="pc-ck-refresh" class="ml-auto text-xs text-slate-500"><i class="fa-solid fa-rotate"></i></button></div>
      <div id="pc-ck-list" class="text-xs text-slate-400">오늘 접수 목록 불러오는 중…</div>
      <details class="mt-2" id="pc-manual"><summary class="text-xs text-sky-700 cursor-pointer font-semibold">목록에 없으면 이름·휴대전화 직접 입력</summary>
        <div class="flex flex-wrap gap-2 mt-2"><input id="pc-m-name" maxlength="20" placeholder="이름" class="border rounded-lg px-3 py-2 text-sm w-28"><input id="pc-m-phone" inputmode="numeric" placeholder="010-0000-0000" class="border rounded-lg px-3 py-2 text-sm w-40 tracking-wider"><button type="button" id="pc-m-ok" class="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold">이 환자로</button></div></details></div>`;
  }
  function bindPatientBar(root, onChange) {
    const el = $('#pc-patient', root); if (!el) return;
    const done = () => { savePatient(); if (onChange) onChange(); else render(); };
    const ch = $('#pc-pt-change', el); if (ch) ch.onclick = () => { state.patient = null; done(); };
    const cl = $('#pc-pt-clear', el); if (cl) cl.onclick = () => { state.patient = null; done(); };
    const list = $('#pc-ck-list', el);
    const load = async () => {
      if (!list) return;
      try {
        const d = await api('/checkins');
        if (!d || !d.enabled) { list.innerHTML = '<span class="text-slate-400">페이션트 폼 접수와 연결되면 오늘 접수 환자가 여기 뜹니다.</span>'; const m = $('#pc-manual', el); if (m) m.open = true; return; }
        if (!d.items.length) { list.innerHTML = '<span class="text-slate-400">오늘 접수된 환자가 아직 없습니다.</span>'; const m = $('#pc-manual', el); if (m) m.open = true; return; }
        list.innerHTML = `<div class="checkin-list">${d.items.map(it => `<button type="button" data-ck="${esc(it.id)}" data-name="${esc(it.name)}" data-last4="${esc(it.last4 || '')}" ${it.has_phone ? '' : 'disabled title="휴대폰 번호가 없는 접수"'}><span class="px-1 rounded text-[10px] ${it.kind === 'new' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}">${it.kind === 'new' ? '신환' : '재진'}</span>${esc(it.name)}${it.last4 ? `<span class="text-slate-400">****-${esc(it.last4)}</span>` : ''}</button>`).join('')}</div>`;
        list.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { state.patient = { checkin_id: b.dataset.ck, name: b.dataset.name, last4: b.dataset.last4 }; done(); });
      } catch (e) { list.innerHTML = `<span class="text-rose-600">오늘 접수 목록: ${esc(e.message)}</span>`; }
    };
    const rf = $('#pc-ck-refresh', el); if (rf) rf.onclick = load;
    const ok = $('#pc-m-ok', el);
    if (ok) ok.onclick = () => {
      const name = ($('#pc-m-name', el).value || '').trim(); const digits = ($('#pc-m-phone', el).value || '').replace(/\D/g, '');
      if (!name) { toast('이름을 입력하세요', false); return; }
      if (!/^01\d{8,9}$/.test(digits)) { toast('휴대전화 번호를 확인하세요', false); return; }
      state.patient = { name, phone: digits, last4: digits.slice(-4) }; done();
    };
    if (list) load();
  }

  // ─── 레이아웃 ───
  function render() {
    const h = state.me.hospital;
    const tabs = [['library', '자료함'], ['present', '설명하기'], ['send', '보내기'], ['history', '발송내역'], ['settings', '설정']];
    app.innerHTML = `
    <header class="bg-white border-b sticky top-0 z-30">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <div class="font-extrabold text-slate-900">📨 Patient Connect</div>
        <div class="text-sm text-slate-500 truncate">${esc(h.name)}</div>
        <nav class="ml-auto flex gap-1 text-sm overflow-x-auto">
          ${tabs.map(([k, l]) => `<button data-tab="${k}" class="px-3 py-2 whitespace-nowrap ${state.tab === k ? 'tab-active' : 'text-slate-500 hover:text-slate-800'}">${l}${k === 'present' && state.today.length ? ` <span class="ml-1 text-xs bg-sky-600 text-white rounded-full px-1.5">${state.today.length}</span>` : ''}</button>`).join('')}
        </nav>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 py-6" id="main"></main>`;
    app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; render(); });
    const main = $('#main');
    ({ library: renderLibrary, present: renderPresent, send: renderSend, history: renderHistory, settings: renderSettings })[state.tab](main);
    if (!state.me.alimtalk_ready && state.tab !== 'settings') {
      main.insertAdjacentHTML('afterbegin', `<div class="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">카카오 알림톡 설정이 완료되지 않았습니다(키·채널·승인 템플릿 확인 필요). 그동안은 <b>링크 직접 전달</b>로 안내장을 보낼 수 있습니다.</div>`);
    }
  }

  // ─── 자료함 ───
  function categoriesFor(kind) {
    const preset = kind ? (state.library.categories[groupKind(kind)] || []) : Object.values(state.library.categories).flat();
    const existing = state.materials.filter(m => !kind || groupKind(m.kind) === groupKind(kind)).map(m => m.category).filter(Boolean);
    return [...new Set([...preset, ...existing])];
  }
  const clinicalCategories = [
    ['임플란트', '식립·뼈이식·치료 선택·유지관리'],
    ['보철·틀니', '크라운·브리지·틀니의 구조와 관리'],
    ['충치·신경치료', '치수·충치 이해부터 치료 후 수복까지'],
    ['잇몸치료', '스케일링·치주수술·잇몸질환'],
    ['치아교정', '치아이동·교정장치·유지장치 관리'],
    ['사랑니·발치', '매복 사랑니·발치 과정·회복'],
    ['소아치과', '유치·영구치·불소·보호자 관리'],
    ['심미치료', '라미네이트·변색·미백과 주의사항'],
    ['턱관절', '관절원판·턱 근육·생활관리'],
    ['구강점막', '입안 검사·궤양·흰 병변·점액낭종'],
    ['예방·구강관리', '칫솔질·치실·치간칫솔'],
    ['진료 전·후 안내', '복용약·마취·진정·임신·의사소통'],
  ];
  const categoryAliases = { '보철치료':'보철·틀니', '치아상실':'보철·틀니', '충치치료':'충치·신경치료', '충치':'충치·신경치료', '신경치료':'충치·신경치료', '치수·치근단 질환':'충치·신경치료', '치아균열·파절':'충치·신경치료', '잇몸질환':'잇몸치료', '부정교합':'치아교정', '사랑니·매복치':'사랑니·발치', '턱관절치료':'턱관절', '턱관절질환':'턱관절', '구강점막질환':'구강점막', '치아변색':'심미치료', '예방·검진':'예방·구강관리' };
  const categoryOf = m => categoryAliases[m.category] || m.category || '기타 자료';
  const categoryList = () => [...clinicalCategories.map(([name])=>name), ...new Set(state.materials.map(categoryOf).filter(name=>!clinicalCategories.some(([n])=>n===name)))];
  const kindMatches = (m, k) => !k || groupKind(m.kind)===k;
  const secondsLabel = n => {const seconds=Math.round(n);return Number.isFinite(seconds)&&seconds>0?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'영상'};
  const coverHtml = (im, title) => isVideo(im)
    ? `${im.poster_key ? `<img src="${imgUrl(im.poster_key)}" alt="${esc(title)} 영상 장면" loading="lazy" class="video-poster">` : `<video src="${imgUrl(im.key)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video>`}<span class="video-play-badge" aria-hidden="true"><i class="fa-solid fa-play"></i></span><span class="video-duration">${secondsLabel(im.duration_seconds)}</span>`
    : mediaHtml(im);
  function materialCard(m, extra) {
    const im=m.images[0];
    const img = im ? `<button class="media-card-cover" data-preview="${m.id}" aria-label="${esc(m.title)} 크게 보기">${coverHtml(im,m.title)}${!isVideo(im)?'<span class="media-cover-label">이미지 <i class="fa-solid fa-expand"></i></span>':''}</button>` : `<button data-preview="${m.id}" class="empty-media-cover" aria-label="${esc(m.title)} 설명 보기"><i class="fa-regular fa-file-lines"></i><span>글·비용 안내</span></button>`;
    const label=KIND[m.kind];
    return `<div class="material-card bg-white rounded-xl border shadow-sm flex flex-col fade-in">
      ${img}
      <div class="p-3 flex-1">
        <div class="flex flex-wrap items-center gap-2 text-xs"><span class="px-1.5 py-0.5 rounded ${KIND_COLOR[m.kind]}">${label}</span>${m.is_example ? '<span class="example-badge">기본 자료</span>' : ''}${m.active===false ? '<span class="example-badge">숨김</span>' : ''}${m.kind==='before_after'?`<span class="example-badge">${m.guidance?.external_allowed?'외부 전송 확인됨':'병원 내 설명용'}</span>`:''}<span class="text-slate-500">${esc(categoryOf(m))}</span></div>
        <div class="font-bold mt-1.5 leading-snug">${esc(m.title)}</div>
        <div class="text-xs text-slate-500 mt-1 line-clamp-2">${esc((m.body || '').replace(/\n/g, ' '))}${m.kind === 'cost' && m.cost.length ? ' · 항목 ' + m.cost.length + '개' : ''}</div>
      </div>
      <div class="px-3 pb-3 flex gap-2 text-sm">${extra}</div>
    </div>`;
  }
  function renderLibrary(main) {
    const q = state.filter.trim().toLocaleLowerCase();
    const home=state.overview && !q && !state.kindFilter && !state.categoryFilter;
    const mediaOf = m => m.images.some(isVideo) ? 'video' : m.images.length ? 'image' : 'text';
    const MEDIA = { video: '영상', image: '이미지', text: '글' };
    const list = state.materials.filter(m => kindMatches(m,state.kindFilter) && (!state.mediaFilter || mediaOf(m)===state.mediaFilter) && (!state.categoryFilter || categoryOf(m)===state.categoryFilter) && (!q || (m.title+' '+categoryOf(m)+' '+MEDIA[mediaOf(m)]+' '+(m.body||'')).toLocaleLowerCase().includes(q)));
    const cats=categoryList(), countKind=k=>state.materials.filter(m=>(!state.categoryFilter||categoryOf(m)===state.categoryFilter)&&(!state.mediaFilter||mediaOf(m)===state.mediaFilter)&&kindMatches(m,k)).length;
    const countMedia=t=>state.materials.filter(m=>(!state.categoryFilter||categoryOf(m)===state.categoryFilter)&&kindMatches(m,state.kindFilter)&&(!t||mediaOf(m)===t)).length;
    const groups=cats.map(name=>({name,items:state.materials.filter(m=>categoryOf(m)===name),description:clinicalCategories.find(([n])=>n===name)?.[1]||'병원에서 등록한 설명자료'})).filter(g=>g.items.length);
    main.innerHTML=`
      <div class="library-heading">${home?'<a class="library-back" href="https://hub.patientfunnel.kr/">← 허브로</a>':'<button id="library-back" class="library-back">← 카테고리로</button>'}<h2>${home?'진료별 설명자료':esc(state.categoryFilter||'전체 설명자료')} <span>${home?state.materials.length:list.length}개</span></h2></div>
      <div class="library-toolbar"><input id="q" value="${esc(state.filter)}" aria-label="자료 검색" placeholder="제목·진료 항목·내용 검색"><button id="new" class="primary-action"><i class="fa-solid fa-plus"></i> 자료 등록</button><button id="library-refresh" title="Patient Connect 영상 라이브러리에서 빠진 자료를 채우고, 수정하지 않은 자료를 최신으로 맞춥니다"><i class="fa-solid fa-rotate"></i> 라이브러리 새로고침</button></div>
      ${home?`<div class="kind-grid">${LIBRARY_KINDS.map(k=>{const n=state.materials.filter(m=>kindMatches(m,k)).length;return `<div class="kind-card"><button class="kind-open" data-kind-open="${k}"><i class="fa-solid ${KIND_ICON[k]}"></i><strong>${KIND[k]} <span>${n}개</span></strong><small>${esc(KIND_DESC[k])}</small></button><button class="kind-add" data-kind-add="${k}" title="${KIND[k]} 등록"><i class="fa-solid fa-plus"></i> 등록</button></div>`}).join('')}</div>
      <div class="category-intro"><p>설명할 진료를 먼저 고르세요.</p><button id="browse-all">전체 자료 보기 →</button></div><div class="clinical-category-grid">${groups.map(g=>{
        const cover=g.items.find(m=>m.images.some(im=>im.poster_key)) || g.items.find(m=>m.images.length);
        const im=cover?.images.find(im=>im.poster_key)||cover?.images[0];
        const videos=g.items.filter(m=>m.images.some(isVideo)).length, imgs=g.items.filter(m=>m.images.length&&!m.images.some(isVideo)).length, texts=g.items.length-videos-imgs;
        return `<button class="clinical-category-card" data-category-open="${esc(g.name)}"><span class="category-cover">${im?coverHtml(im,g.name):'<i class="fa-regular fa-file-lines"></i>'}<span class="category-count">${g.items.length}개</span></span><span class="category-copy"><strong>${esc(g.name)} <i class="fa-solid fa-arrow-right"></i></strong><span>${esc(g.description)}</span><small>${[videos?`영상 ${videos}`:'',imgs?`이미지 ${imgs}`:'',texts?`글 ${texts}`:''].filter(Boolean).join(' · ')||'설명자료'}</small></span></button>`;
      }).join('')}</div>`:`
      <nav class="material-kind-tabs" aria-label="자료 형식">${[['','전체 형식','fa-layer-group'],['video','영상','fa-play'],['image','이미지','fa-image']].map(([t,label,icon])=>`<button data-media-filter="${t}" aria-pressed="${state.mediaFilter===t}"><i class="fa-solid ${icon} mr-1"></i>${label}<span>${countMedia(t)}</span></button>`).join('')}</nav>
      <nav class="material-kind-tabs" aria-label="자료 종류">${[['','전체'],...LIBRARY_KINDS.map(k=>[k,KIND[k]])].map(([k,label])=>`<button data-kind-filter="${k}" aria-pressed="${state.kindFilter===k}">${label}<span>${countKind(k)}</span></button>`).join('')}</nav>
      <div class="material-category-filters" aria-label="진료 카테고리"><button data-cat="" aria-pressed="${!state.categoryFilter}">전체 카테고리</button>${cats.map(c=>`<button data-cat="${esc(c)}" aria-pressed="${state.categoryFilter===c}">${esc(c)}<small>${state.materials.filter(m=>kindMatches(m,state.kindFilter)&&categoryOf(m)===c).length}</small></button>`).join('')}</div>
      <p id="material-result-count" class="text-xs text-slate-500 mb-4" aria-live="polite">${state.mediaFilter?MEDIA[state.mediaFilter]+' · ':''}${state.kindFilter?KIND[state.kindFilter]:'전체 자료'} · ${list.length}개</p>
      ${list.length?`<div id="material-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${list.map(m=>materialCard(m,`<button data-add="${m.id}" class="flex-1 px-2 py-1.5 rounded-lg ${state.today.includes(m.id)?'bg-sky-100 text-sky-800':'bg-slate-100 hover:bg-slate-200'}">${state.today.includes(m.id)?'✓ 오늘 설명에 담김':'+ 오늘 설명에 담기'}</button><button data-edit="${m.id}" class="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200" aria-label="${esc(m.title)} 수정"><i class="fa-solid fa-pen"></i></button><button data-hide="${m.id}" class="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200" title="이 병원 자료함에서 숨기기" aria-label="${esc(m.title)} 숨기기"><i class="fa-regular fa-eye-slash"></i></button>`)).join('')}</div>`:`<div class="library-empty">${state.kindFilter&&!q&&!state.mediaFilter&&!state.categoryFilter?`<p><b>${KIND[state.kindFilter]}</b> 자료가 아직 없습니다. ${esc(KIND_DESC[state.kindFilter])}${state.kindFilter==='explain'?'':' — 우리 병원 자료를 직접 등록하세요.'}</p><button id="empty-add" class="primary-action"><i class="fa-solid fa-plus"></i> ${KIND[state.kindFilter]} 등록</button>`:'<p>선택한 조건에 맞는 자료가 없습니다</p>'}<button id="reset-filters">필터 초기화</button></div>`}`}
      <details class="library-bundles"><summary>자주 쓰는 설명 묶음 <span>${state.sets.length}개</span></summary>${setsHtml()}</details>
      <details class="library-bundles" ${state.showHidden?'open':''}><summary>숨긴 자료 <span>${state.hidden.length}개</span></summary>${state.hidden.length?`<p class="text-xs text-slate-500 mb-3">숨긴 자료는 설명하기·보내기·안내장에 나오지 않습니다. 다시 보이게 하면 원래 자리로 돌아옵니다.</p><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${state.hidden.map(m=>materialCard(m,`<button data-show="${m.id}" class="flex-1 px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"><i class="fa-regular fa-eye"></i> 다시 보이기</button>`)).join('')}</div>`:'<p class="text-xs text-slate-500">숨긴 자료가 없습니다. 자료 카드의 <i class="fa-regular fa-eye-slash"></i> 로 이 병원에서 안 쓰는 자료를 숨길 수 있습니다.</p>'}</details>`;
    bindSets(main);
    $('#q').oninput=e=>{state.filter=e.target.value;renderLibrary(main);$('#q').focus();$('#q').setSelectionRange(state.filter.length,state.filter.length)};
    const back=$('#library-back');if(back)back.onclick=()=>{state.overview=true;state.filter='';state.kindFilter='';state.mediaFilter='';state.categoryFilter='';renderLibrary(main);scrollTo(0,0)};
    const all=$('#browse-all');if(all)all.onclick=()=>{state.overview=false;renderLibrary(main);scrollTo(0,0)};
    main.querySelectorAll('[data-category-open]').forEach(b=>b.onclick=()=>{state.categoryFilter=b.dataset.categoryOpen;state.kindFilter='';state.overview=false;renderLibrary(main);scrollTo(0,0)});
    main.querySelectorAll('[data-kind-open]').forEach(b=>b.onclick=()=>{state.kindFilter=b.dataset.kindOpen;state.categoryFilter='';state.mediaFilter='';state.overview=false;renderLibrary(main);scrollTo(0,0)});
    main.querySelectorAll('[data-kind-add]').forEach(b=>b.onclick=()=>openEditor({kind:b.dataset.kindAdd,category:'',title:'',body:'',images:[],cost:[]}));
    const ea=$('#empty-add');if(ea)ea.onclick=()=>openEditor({kind:state.kindFilter,category:state.categoryFilter||'',title:'',body:'',images:[],cost:[]});
    main.querySelectorAll('[data-kind-filter]').forEach(b=>b.onclick=()=>{state.kindFilter=b.dataset.kindFilter;renderLibrary(main)});
    main.querySelectorAll('[data-media-filter]').forEach(b=>b.onclick=()=>{state.mediaFilter=b.dataset.mediaFilter;renderLibrary(main)});
    main.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.categoryFilter=b.dataset.cat;renderLibrary(main)});
    const reset=$('#reset-filters');if(reset)reset.onclick=()=>{state.filter='';state.kindFilter='';state.mediaFilter='';state.categoryFilter='';state.overview=false;renderLibrary(main)};
    $('#library-refresh').onclick=refreshLibrary;$('#new').onclick=()=>openEditor(null);
    main.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.add);state.today=state.today.includes(id)?state.today.filter(x=>x!==id):[...state.today,id];saveToday();render()});
    main.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>startPresent([state.materials.find(m=>m.id===Number(b.dataset.preview))]));
    main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(state.materials.find(m=>m.id===Number(b.dataset.edit))));
    main.querySelectorAll('[data-hide]').forEach(b=>b.onclick=()=>setVisible(Number(b.dataset.hide),false,main));
    main.querySelectorAll('[data-show]').forEach(b=>b.onclick=()=>setVisible(Number(b.dataset.show),true,main));
  }

  async function videoPoster(file) {
    const video=document.createElement('video'),url=URL.createObjectURL(file);video.muted=true;video.preload='auto';
    try {
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('영상 장면을 읽지 못했습니다. 재생 가능한 MP4 또는 WebM을 선택해 주세요.')),20000);video.onloadeddata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(new Error('재생할 수 없는 영상입니다.'))};video.src=url;});
      const duration=video.duration;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('영상 썸네일을 만들지 못했습니다.')),15000);video.onseeked=()=>{clearTimeout(timer);resolve()};video.currentTime=Math.min(Number.isFinite(duration)?duration/3:0.1,3);});
      const canvas=document.createElement('canvas');canvas.width=Math.min(768,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));if(!blob)throw new Error('썸네일을 만들지 못했습니다.');
      return {blob,duration};
    }finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
  }

  async function setVisible(id, visible, main) {
    try {
      await api('/materials/' + id + '/visibility', { method: 'POST', body: JSON.stringify({ visible }) });
      state.showHidden = !visible; await loadMaterials(); renderLibrary(main);
      toast(visible ? '자료를 다시 보이게 했습니다.' : '자료를 숨겼습니다. 아래 "숨긴 자료"에서 되돌릴 수 있습니다.');
    } catch (e) { toast(e.message); }
  }
  async function refreshLibrary() {
    const btn = $('#library-refresh'); if (btn) btn.disabled = true;
    try {
      const r = await api('/materials/library-sync', { method: 'POST', body: JSON.stringify({}) });
      await Promise.all([loadMaterials(), loadLibrary()]); render();
      const parts = []; if (r.inserted) parts.push(`추가 ${r.inserted}`); if (r.updated) parts.push(`갱신 ${r.updated}`); if (r.deactivated) parts.push(`정리 ${r.deactivated}`); if (r.locked) parts.push(`수정본 유지 ${r.locked}`);
      toast(parts.length ? `라이브러리 반영: ${parts.join(' · ')}` : '이미 최신 상태입니다.');
    } catch (e) { toast(e.message); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }

  // ─── 자료 편집 모달 ───
  function openEditor(m) {
    state.editing = m ? JSON.parse(JSON.stringify(m)) : { kind: state.kindFilter || 'explain', category: state.categoryFilter, title: '', body: '', images: [], cost: [] };
    renderEditor();
  }
  const costFields=[['included','포함되는 치료·범위'],['extra','별도 비용 조건 (없으면 없음)'],['alternatives','대안별 차이 (선택)'],['basis_date','안내 기준일'],['valid_until','비용 안내 유효기간'],['variability','검사 후 달라질 수 있는 부분']];
  const caseFields=[['treatment','치료 내용'],['period','치료 기간'],['individual_notice','개인차·참고 사례 안내'],['consent_ref','동의 범위 확인 기록 (환자에게 표시 안 됨)']];
  function guidanceEditor(m) {
    if(!['cost','before_after'].includes(m.kind))return '';
    const g=m.guidance || {}, fields=m.kind==='cost'?costFields:caseFields;
    return `<fieldset class="guidance-editor"><legend>${m.kind==='cost'?'비용 안내 기준':'사례 사용·전송 확인'}</legend><p>${m.kind==='cost'?'공용 안내 자료입니다. 확정 견적과 구분해 주세요. 전송 전 기준일과 유효기간을 확인합니다.':'기본은 병원 내 설명용입니다. 사진 사용 동의 범위와 식별정보 제거를 직접 확인해 주세요. 이미지 변경 시 전송 승인은 해제됩니다.'}</p>${fields.map(([k,l])=>`<label>${l}${k.endsWith('date')||k==='valid_until'?`<input data-guidance="${k}" type="date" value="${esc(g[k]||'')}">`:`<textarea data-guidance="${k}" rows="2" maxlength="${k==='consent_ref'?200:k==='period'?100:1000}">${esc(g[k]||'')}</textarea>`}</label>`).join('')}${m.kind==='before_after'?`<label><input type="checkbox" data-guidance="deidentified" ${g.deidentified?'checked':''}>사진의 이름·차트번호 등 식별정보 제거 확인</label><label><input type="checkbox" data-guidance="external_allowed" ${g.external_allowed?'checked':''}>동의 범위에 환자 안내장 외부 전송이 포함됨을 확인</label><p>동의서 원문·환자 이름은 입력하지 말고 내부 문서 번호와 허용 범위만 기록하세요. 법적 적합성을 자동 보장하지 않습니다.</p>`:''}</fieldset>`;
  }
  function renderEditor() {
    const m = state.editing; if (!m) return;
    let box = $('#editor');
    if (!box) { box = document.createElement('div'); box.id = 'editor'; document.body.appendChild(box); }
    const costRows = (m.cost.length ? m.cost : []).map((c, i) => `<tr><td><input data-c="name" data-i="${i}" value="${esc(c.name)}" placeholder="항목" class="w-full border rounded px-2 py-1"></td><td><input data-c="price" data-i="${i}" type="number" value="${c.price}" class="w-28 border rounded px-2 py-1 text-right"></td><td><input data-c="qty" data-i="${i}" type="number" value="${c.qty || 1}" class="w-16 border rounded px-2 py-1 text-right"></td><td><input data-c="note" data-i="${i}" value="${esc(c.note || '')}" placeholder="비고" class="w-full border rounded px-2 py-1"></td><td><button data-cdel="${i}" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('');
    const total = m.cost.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.qty) || 1), 0);
    const imgLimit = m.kind === 'before_after' ? 2 : 6;
    const categoryOptions = [...new Set([...clinicalCategories.map(([name])=>name), ...(state.library.categories[groupKind(m.kind)] || [])])];
    const customCategory = !!m.category && !categoryOptions.includes(m.category);
    box.innerHTML = `<div class="fixed inset-0 bg-black/40 z-40 flex items-start justify-center overflow-auto p-4">
      <div class="bg-white rounded-2xl w-full max-w-2xl my-6 fade-in">
        <div class="px-5 py-4 border-b flex items-center"><h3 class="font-bold">${m.id ? '자료 수정' : '자료 등록'}</h3><button id="ed-close" class="ml-auto text-slate-400 hover:text-slate-800 text-xl">&times;</button></div>
        <div class="p-5 space-y-4 text-sm">
          <div class="flex flex-wrap gap-2" aria-label="자료 유형 선택">${LIBRARY_KINDS.map(k => `<button data-kind="${k}" aria-pressed="${groupKind(m.kind) === k}" class="px-3 py-1.5 rounded-full border ${groupKind(m.kind) === k ? 'bg-slate-900 text-white' : ''}">${KIND[k]}</button>`).join('')}</div>
          ${m.is_example ? `<p class="example-editor-notice">${esc(state.library.library_notice)}</p>` : ''}
          ${m.kind === 'notice' ? '<p class="text-xs text-slate-500">치료 전후 관리와 생활 주의사항을 안내하는 자료입니다.</p>' : ''}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label class="sm:col-span-2 min-w-0">제목<input id="ed-title" value="${esc(m.title)}" maxlength="80" placeholder="예: 임플란트 치료 과정" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
            <label>${m.kind === 'disease' ? '질환 분류' : '진료 분류'}<select id="ed-category-select" class="mt-1 w-full border rounded-lg px-3 py-2"><option value="">분류 선택</option>${categoryOptions.map(c => `<option value="${esc(c)}" ${m.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__custom" ${customCategory ? 'selected' : ''}>직접 입력</option></select><input id="ed-cat" value="${esc(m.category || '')}" maxlength="30" placeholder="사용자 분류 입력" aria-label="직접 입력 분류" class="mt-1 w-full border rounded-lg px-3 py-2 ${customCategory ? '' : 'hidden'}"></label>
          </div>
          <details class="supplemental-body"><summary>보충 설명 (선택)</summary><label class="block">${m.kind === 'cost' ? '설명(선택)' : '설명 메모'}<span class="text-slate-400 ml-2">줄 앞에 "- "를 붙이면 항목으로 표시됩니다</span>
            <textarea id="ed-body" rows="7" class="mt-1 w-full border rounded-lg px-3 py-2 leading-relaxed" placeholder="${m.kind === 'notice' ? '- 2시간 동안 거즈를 물고 계세요\n- 오늘은 뜨거운 음식·음주·흡연을 피하세요' : '환자분께 말로 설명하던 내용을 그대로 적어 주세요'}">${esc(m.body || '')}</textarea></label></details>
          ${m.kind === 'cost' ? `<div><div class="font-semibold mb-1">비용표</div><table class="w-full text-sm"><thead class="text-slate-500 text-xs"><tr><th class="text-left">항목</th><th class="text-right">단가</th><th class="text-right">수량</th><th class="text-left">비고</th><th></th></tr></thead><tbody>${costRows}</tbody></table>
            <div class="flex items-center mt-2"><button id="ed-cadd" class="text-sky-700 text-sm"><i class="fa-solid fa-plus mr-1"></i>항목 추가</button><div class="ml-auto font-bold">합계 ${won(total)}</div></div>
            <p class="text-xs text-slate-400 mt-1">환자용 안내장에는 "안내 시점 기준 금액이며 진단에 따라 달라질 수 있습니다"가 자동으로 붙습니다.</p></div>` : ''}
          ${guidanceEditor(m)}
          <div>
            <div class="font-semibold mb-1">${m.kind === 'before_after' ? '비포 · 애프터 사진 (첫 장 = 치료 전, 둘째 장 = 치료 후)' : '이미지 · 영상'} <span class="text-slate-400 font-normal">${m.images.length}/${imgLimit} · 이미지 5MB / MP4·WebM 영상 25MB 이하</span></div>
            ${m.id ? `<div class="flex flex-wrap gap-2">${m.images.map((im, i) => `<div class="relative">${mediaHtml(im, null, 'h-24 w-32 object-contain rounded-lg border')}${m.kind === 'before_after' ? `<span class="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">${i === 0 ? '치료 전' : '치료 후'}</span>` : ''}<button data-imgdel="${im.key}" class="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-xs text-rose-600">&times;</button></div>`).join('')}
              ${m.images.length < imgLimit ? `<label class="h-24 w-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-sky-400"><i class="fa-solid fa-image"></i><span class="text-xs mt-1">올리기</span><input type="file" id="ed-file" accept="${m.kind === 'before_after' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,video/mp4,video/webm'}" class="hidden"></label>` : ''}</div>`
              : `<p class="text-xs text-slate-400">제목을 먼저 저장하면 이미지를 올릴 수 있습니다.</p>`}
          </div>
        </div>
        <div class="px-5 py-4 border-t flex gap-2">
          ${m.id ? `<button id="ed-del" class="text-rose-600 text-sm">${m.is_example ? '이 병원에서 숨기기' : '삭제'}</button>` : ''}
          <button id="ed-save" class="ml-auto px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm">${m.id ? '저장' : '등록'}</button>
        </div>
      </div></div>`;
    const sync = () => { m.title = $('#ed-title').value; m.category = $('#ed-category-select').value === '__custom' ? $('#ed-cat').value : $('#ed-category-select').value; m.body = $('#ed-body').value; m.guidance = m.guidance || {}; box.querySelectorAll('[data-guidance]').forEach(el => m.guidance[el.dataset.guidance] = el.type === 'checkbox' ? el.checked : el.value); };
    $('#ed-close').onclick = () => { box.remove(); state.editing = null; };
    $('#ed-category-select').onchange = () => { $('#ed-cat').classList.toggle('hidden', $('#ed-category-select').value !== '__custom'); };
    box.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => { sync(); m.kind = b.dataset.kind; renderEditor(); });
    box.querySelectorAll('[data-c]').forEach((inp) => inp.onchange = () => { const c = m.cost[Number(inp.dataset.i)]; c[inp.dataset.c] = inp.dataset.c === 'price' || inp.dataset.c === 'qty' ? Number(inp.value) : inp.value; sync(); renderEditor(); });
    box.querySelectorAll('[data-cdel]').forEach((b) => b.onclick = () => { sync(); m.cost.splice(Number(b.dataset.cdel), 1); renderEditor(); });
    const cadd = $('#ed-cadd'); if (cadd) cadd.onclick = () => { sync(); m.cost.push({ name: '', price: 0, qty: 1 }); renderEditor(); };
    $('#ed-save').onclick = async () => {
      sync();
      if (!m.title.trim()) return toast('제목을 입력하세요', false);
      try {
        const r = m.id ? await api('/materials/' + m.id, { method: 'PUT', body: JSON.stringify(m) }) : await api('/materials', { method: 'POST', body: JSON.stringify(m) });
        await loadMaterials();
        if (!m.id) { state.editing = JSON.parse(JSON.stringify(r.material)); toast('등록됐습니다. 이미지를 올릴 수 있습니다'); renderEditor(); }
        else { box.remove(); state.editing = null; toast('저장했습니다'); }
        render();
      } catch (e) { toast(e.message, false); }
    };
    const del = $('#ed-del'); if (del) del.onclick = async () => { if (!confirm(m.is_example ? '이 자료를 이 병원 자료함에서 숨길까요? "숨긴 자료"에서 다시 보이게 할 수 있습니다. (이미 보낸 안내장에는 영향 없음)' : '이 자료를 자료함에서 뺄까요? (이미 보낸 안내장에는 영향 없음)')) return; await api('/materials/' + m.id, { method: 'DELETE' }); state.today = state.today.filter((x) => x !== m.id); saveToday(); await loadMaterials(); box.remove(); state.editing = null; render(); };
    const f = $('#ed-file'); if (f) f.onchange = async () => {
      const file = f.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        f.disabled=true;
        if(file.type.startsWith('video/')) { const poster=await videoPoster(file);fd.append('poster',poster.blob,'poster.jpg');if(Number.isFinite(poster.duration))fd.append('duration_seconds',String(poster.duration)); }
        const r = await fetch('/api/materials/' + m.id + '/images', { method: 'POST', body: fd }); const j = await r.json();
        if (!r.ok) throw new Error(j.error || '업로드 실패');
        sync(); m.images = j.images; m.guidance = {...m.guidance, external_allowed:false, deidentified:false}; await loadMaterials(); renderEditor();
      } catch (e) { toast(e.message, false); } finally {f.disabled=false;}
    };
    box.querySelectorAll('[data-imgdel]').forEach((b) => b.onclick = async () => { const j = await api('/materials/' + m.id + '/images?key=' + encodeURIComponent(b.dataset.imgdel), { method: 'DELETE' }); sync(); m.images = j.images; m.guidance = {...m.guidance, external_allowed:false, deidentified:false}; await loadMaterials(); renderEditor(); });
  }

  // ─── 설명하기 ───
  function todayList() { return state.today.map((id) => state.materials.find((m) => m.id === id)).filter(Boolean); }
  function setsHtml(){return `<section class="material-sets" aria-label="자주 쓰는 자료 묶음"><b>자주 쓰는 설명 묶음</b>${state.sets.map(x=>`<span><button data-set="${x.id}">${esc(x.name)} · ${x.material_ids.length}개</button><button data-set-delete="${x.id}" aria-label="${esc(x.name)} 묶음 삭제">×</button></span>`).join('')}<button id="set-save" ${state.today.length?'':'disabled'}>현재 선택을 묶음으로 저장</button></section>`}
  function bindSets(main){
    main.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{const set=state.sets.find(x=>x.id===Number(b.dataset.set));const ids=set.material_ids.filter(id=>state.materials.some(m=>m.id===id));if(state.today.length&&!confirm('현재 선택 목록을 이 묶음으로 바꿀까요? 필기는 그대로 유지됩니다.'))return;state.today=ids;saveToday();toast(ids.length===set.material_ids.length?'자료 묶음을 담았습니다.':'삭제된 자료는 제외했습니다. 묶음을 다시 저장해 주세요.');render()});
    main.querySelectorAll('[data-set-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('묶음만 삭제할까요? 원본 자료는 유지됩니다.'))return;try{await api('/material-sets/'+b.dataset.setDelete,{method:'DELETE'});await loadSets();render()}catch(e){toast(e.message,false)}});
    const save=$('#set-save',main);if(save)save.onclick=async()=>{const name=prompt('설명 묶음 이름 (같은 이름은 덮어씁니다)');if(!name?.trim())return;try{await api('/material-sets',{method:'POST',body:JSON.stringify({name,material_ids:state.today})});await loadSets();render();toast('묶음을 저장했습니다.')}catch(e){toast(e.message,false)}};
  }
  function renderPresent(main) {
    const list = todayList();
    main.innerHTML = `
      <div class="flex items-center gap-3 mb-4"><h2 class="text-lg font-bold">오늘의 설명 <span class="text-sm font-normal text-slate-500">${list.length}개</span></h2>
        ${list.length ? `<button id="go" class="ml-auto px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold"><i class="fa-solid fa-display mr-1"></i>큰 화면으로 설명</button><button id="kt-list" class="px-4 py-2 rounded-lg text-sm font-semibold" style="background:#facc15;color:#0f172a" title="이 목록 전체를 안내장 하나로 묶어 환자분 카카오톡으로 보냅니다"><i class="fa-solid fa-comment mr-1"></i>전체 카톡 전송</button><button id="qr-list" class="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold" title="환자분이 찍으면 이 자료가 바로 열립니다"><i class="fa-solid fa-qrcode mr-1"></i>QR</button><button id="clear" class="px-3 py-2 text-sm text-slate-500">비우기</button>` : ''}
      </div>
      ${list.length ? `<ol class="space-y-2">${list.map((m, i) => `<li class="bg-white border rounded-xl px-4 py-3 flex items-center gap-3 fade-in">
          <span class="text-slate-400 w-5">${i + 1}</span>
          <span class="px-1.5 py-0.5 rounded text-xs ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span>
          <span class="font-semibold flex-1 truncate">${esc(m.title)}</span>
          <button data-up="${i}" class="text-slate-400 hover:text-slate-800 px-1" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button data-down="${i}" class="text-slate-400 hover:text-slate-800 px-1" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button data-rm="${m.id}" class="text-slate-400 hover:text-rose-600 px-1"><i class="fa-solid fa-xmark"></i></button>
        </li>`).join('')}</ol>
        <p class="text-xs text-slate-400 mt-3">[전체 카톡 전송]을 누르면 이 목록이 순서 그대로 안내장 하나로 묶여 환자분 카카오톡에 갑니다. 링크로 전달하려면 [보내기] 탭을 쓰세요.</p>`
        : `<div class="bg-white rounded-xl border p-10 text-center text-slate-500"><div class="text-3xl mb-2">🖥️</div><p class="font-semibold text-slate-700">오늘 설명할 자료를 자료함에서 담아 주세요</p><p class="text-sm mt-1">담은 순서대로 큰 화면에 넘겨 가며 보여줍니다.</p><button id="tolib" class="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">자료함으로</button></div>`}`;
    main.insertAdjacentHTML('afterbegin',setsHtml());bindSets(main);
    main.insertAdjacentHTML('afterbegin', patientBarHtml()); bindPatientBar(main);
    const go = $('#go'); if (go) go.onclick = () => startPresent(list);
    const ql = $('#qr-list'); if (ql) ql.onclick = () => showQr(list, '');
    // 【2026-09-23】오늘의 설명 전체를 한 번에 카카오톡으로 (설명 화면의 버튼과 같은 흐름)
    const kl = $('#kt-list'); if (kl) kl.onclick = () => presentSend(list, main, async () => { await PCAnnotations.flush(list.map(m => m.id)); }, () => render());
    const cl = $('#clear'); if (cl) cl.onclick = () => { state.today = []; saveToday(); render(); };
    const tl = $('#tolib'); if (tl) tl.onclick = () => { state.tab = 'library'; render(); };
    main.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.up); [state.today[i - 1], state.today[i]] = [state.today[i], state.today[i - 1]]; saveToday(); render(); });
    main.querySelectorAll('[data-down]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.down); [state.today[i + 1], state.today[i]] = [state.today[i], state.today[i + 1]]; saveToday(); render(); });
    main.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { state.today = state.today.filter((x) => x !== Number(b.dataset.rm)); saveToday(); render(); });
  }
  function slideHtml(m, token) {
    if (m.kind === 'before_after') {
      const [b, a] = m.images;
      return `<div class="ba">${[['치료 전', b], ['치료 후', a]].map(([l, im]) => `<figure ${im ? `data-annotation-key="${esc(im.key)}"` : ''}>${im ? `<img src="${imgUrl(im.key, token)}" class="w-full">` : '<div class="h-48 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">사진 없음</div>'}<figcaption>${l}</figcaption></figure>`).join('')}</div>${m.body ? `<div class="text mt-6">${bodyHtml(m.body)}</div>` : ''}`;
    }
    if (m.images.length) {
      return `<div class="media-stage">${m.images.map(im => `<figure data-annotation-key="${esc(im.key)}">${mediaHtml(im, token)}${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('')}</div>${m.body ? `<details class="media-supplement"><summary>보충 설명 보기</summary><div class="text">${bodyHtml(m.body)}</div></details>` : ''}`;
    }
    if (m.kind === 'cost') {
      const total = m.cost.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.qty) || 1), 0);
      return `${m.body ? `<div class="text mb-6">${bodyHtml(m.body)}</div>` : ''}<table class="w-full max-w-2xl"><tbody>${m.cost.map((c) => `<tr class="border-b border-slate-700"><td class="py-3">${esc(c.name)}${c.note ? `<div class="text-sm text-slate-400">${esc(c.note)}</div>` : ''}</td><td class="py-3 text-right text-slate-400">${(c.qty || 1) > 1 ? `${won(c.price)} × ${c.qty}` : ''}</td><td class="py-3 text-right font-bold">${won((Number(c.price) || 0) * (Number(c.qty) || 1))}</td></tr>`).join('')}<tr><td class="py-4 font-extrabold" colspan="2">합계</td><td class="py-4 text-right font-extrabold text-sky-300">${won(total)}</td></tr></tbody></table><p class="text-sm text-slate-400 mt-4">안내 시점 기준 금액이며 진단에 따라 달라질 수 있습니다.</p>`;
    }
    const imgs = m.images.map((im) => `<figure>${mediaHtml(im, token)}${im.caption ? `<figcaption class="text-center text-slate-400 mt-2">${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    return `<div class="grid ${m.images.length ? 'lg:grid-cols-2' : ''} gap-8 items-start">${m.body ? `<div class="text">${bodyHtml(m.body)}</div>` : ''}${imgs ? `<div class="space-y-4">${imgs}</div>` : ''}</div>`;
  }
  // ─── 설명 화면 보조: 확대(핀치·휠·드래그), 전후 슬라이더, 포인트 모드 ───
  function openLightbox(srcs, idx) {
    if (!srcs.length) return;
    const lb = document.createElement('div'); lb.className = 'pc-lightbox';
    let i = Math.max(0, Math.min(idx, srcs.length - 1)), scale = 1, tx = 0, ty = 0;
    const draw = () => { lb.innerHTML = `<button class="lb-close" aria-label="닫기">&times;</button>${srcs.length > 1 ? `<button class="lb-prev" aria-label="이전">&#8249;</button><button class="lb-next" aria-label="다음">&#8250;</button><span class="lb-count">${i + 1} / ${srcs.length}</span>` : ''}<div class="lb-stage"><img src="${srcs[i]}" alt="" draggable="false"></div><div class="lb-hint">두 손가락으로 벌리거나 휠로 확대 · 두 번 탭하면 원래 크기</div>`; scale = 1; tx = ty = 0; bind(); };
    const apply = () => { const img = lb.querySelector('img'); if (img) img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const bind = () => {
      lb.querySelector('.lb-close').onclick = close;
      const p = lb.querySelector('.lb-prev'), n = lb.querySelector('.lb-next');
      if (p) p.onclick = () => { i = (i - 1 + srcs.length) % srcs.length; draw(); };
      if (n) n.onclick = () => { i = (i + 1) % srcs.length; draw(); };
      const st = lb.querySelector('.lb-stage'), img = lb.querySelector('img');
      const pts = new Map(); let lastDist = 0, lastTap = 0, dragging = false, sx = 0, sy = 0;
      st.addEventListener('wheel', e => { e.preventDefault(); scale = Math.min(6, Math.max(1, scale * (e.deltaY < 0 ? 1.12 : 0.89))); if (scale === 1) { tx = ty = 0; } apply(); }, { passive: false });
      st.addEventListener('pointerdown', e => { st.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; const now = Date.now(); if (now - lastTap < 320) { scale = scale > 1 ? 1 : 2.2; tx = ty = 0; apply(); } lastTap = now; } if (pts.size === 2) { const [a, b] = [...pts.values()]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); } });
      st.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (lastDist) scale = Math.min(6, Math.max(1, scale * (d / lastDist))); lastDist = d; apply(); } else if (dragging && scale > 1) { tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) lastDist = 0; if (!pts.size) dragging = false; };
      st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
      img.onload = apply;
    };
    const close = () => { document.removeEventListener('keydown', onKey); lb.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' && srcs.length > 1) { i = (i + 1) % srcs.length; draw(); } else if (e.key === 'ArrowLeft' && srcs.length > 1) { i = (i - 1 + srcs.length) % srcs.length; draw(); } };
    document.addEventListener('keydown', onKey); document.body.appendChild(lb); draw();
  }
  function baSliderHtml(m) {
    const [b, a] = m.images;
    return `<div class="ba-compare" id="ba-compare"><img src="${imgUrl(b.key)}" alt="치료 전" class="ba-before" draggable="false"><div class="ba-after-wrap"><img src="${imgUrl(a.key)}" alt="치료 후" class="ba-after" draggable="false"></div><div class="ba-handle"></div><span class="ba-label ba-label-l">치료 전</span><span class="ba-label ba-label-r">치료 후</span></div>
      <input type="range" id="ba-range" min="0" max="100" value="50" class="ba-range" aria-label="전후 비교 위치"><p class="text-slate-400 text-sm mt-2">가운데 막대를 좌우로 움직여 비교합니다.</p>${m.body ? `<div class="text mt-6">${bodyHtml(m.body)}</div>` : ''}`;
  }
  function bindBaSlider(box) {
    const wrap = $('#ba-compare', box), range = $('#ba-range', box); if (!wrap || !range) return;
    const set = v => { wrap.style.setProperty('--ba', v + '%'); range.value = v; };
    range.oninput = () => set(Number(range.value)); set(50);
    let down = false;
    const at = e => { const r = wrap.getBoundingClientRect(); set(Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)))); };
    wrap.addEventListener('pointerdown', e => { down = true; wrap.setPointerCapture(e.pointerId); at(e); });
    wrap.addEventListener('pointermove', e => { if (down) at(e); });
    wrap.addEventListener('pointerup', () => { down = false; }); wrap.addEventListener('pointercancel', () => { down = false; });
  }
  function applyPointMode(box) {
    const lines = [...box.querySelectorAll('.stage .text > div')];
    box.classList.toggle('point-mode', !!state.pointMode && lines.length > 0);
    if (!state.pointMode || !lines.length) return;
    state.pointIdx = Math.max(0, Math.min(state.pointIdx || 0, lines.length - 1));
    lines.forEach((el, k) => { el.classList.toggle('pt-on', k === state.pointIdx); el.classList.toggle('pt-done', k < state.pointIdx); el.onclick = () => { state.pointIdx = k; applyPointMode(box); }; });
    lines[state.pointIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function stepPoint(box, delta) { const n = box.querySelectorAll('.stage .text > div').length; if (!n) return; state.pointIdx = Math.max(0, Math.min(n - 1, (state.pointIdx || 0) + delta)); applyPointMode(box); }
  function startPresent(list) {
    if(document.querySelector('#session-start'))return;
    const dialog=document.createElement('dialog');dialog.id='session-start';dialog.className='safety-dialog';
    dialog.innerHTML=`<h2>이번 설명, 어떻게 시작할까요?</h2><p>자료는 공용, 필기는 설명별로 분리됩니다. 이전 상담의 이름·표시가 섞이지 않도록 기본은 깨끗한 원본입니다.</p><button id="session-clean" class="primary-action">깨끗한 원본으로 새 설명</button>${state.scope?'<button id="session-continue">현재 설명 이어가기</button>':''}<button id="session-copy">기존 공용 필기를 복사해 새 설명</button><button id="session-cancel">취소</button><p id="session-error" role="status"></p>`;
    document.body.append(dialog);dialog.showModal();
    $('#session-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
    const begin=async mode=>{
      dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{
        await PCAnnotations.flush(state.materials.map(m=>m.id));
        if(mode!=='continue'){
          const r=await api('/annotation-sessions',{method:'POST',body:JSON.stringify({copy_shared:mode==='copy',material_ids:list.map(m=>m.id)})});
          PCAnnotations.reset();state.scope=r.scope;sessionStorage.setItem('pc_scope_'+state.me.hospital.id,state.scope);
        }
        dialog.close();presentSlides(list);
      }catch(e){$('#session-error').textContent=e.message;dialog.querySelectorAll('button').forEach(b=>b.disabled=false)}
    };
    $('#session-clean').onclick=()=>begin('clean');$('#session-copy').onclick=()=>begin('copy');
    if($('#session-continue'))$('#session-continue').onclick=()=>begin('continue');
  }
  const annotationApi=(path,opt)=>api(path+'?scope='+encodeURIComponent(state.scope),opt);
  function presentSlides(list) {
    let i = 0, annotationView = null, navigating = false;
    const returnFocus=document.activeElement, returnScroll=scrollY;
    const box = document.createElement('div'); box.className = 'present'; document.body.appendChild(box);
    const draw = () => {
      const m = list[i];
      const hb = state.me.hospital, accent = /^#[0-9a-f]{6}$/i.test(hb.primary_color||'') ? hb.primary_color : '#38bdf8';
      box.style.setProperty('--pc-accent', accent);
      box.innerHTML = `<header class="presentation-header"><button id="present-back">← 뒤로 · ${state.tab==='library'?'자료함':'선택 목록'}</button><span class="present-brand">${state.patient?`<span class="present-patient"><i class="fa-solid fa-user"></i> ${esc(state.patient.name)}님</span>`:''}${hb.logo_key?`<img src="/a/${esc(hb.logo_key)}" alt="">`:''}<b>${esc(hb.name)}</b></span><span>${esc(categoryOf(m))}</span></header><div class="stage fade-in"><div class="text-sky-300 text-sm font-semibold mb-2">${KIND[m.kind]}${m.category ? ' · ' + esc(m.category) : ''}</div><h1>${esc(m.title)}</h1><div class="mt-6">${slideHtml(m)}${PCGuide.guidanceHtml(m)}</div></div>
        <div class="flex items-center gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button id="pv" class="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> 이전</button>
          <span class="text-slate-400 text-sm">${i + 1} / ${list.length}</span>
          <button id="nx" class="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30" ${i === list.length - 1 ? 'disabled' : ''}>다음 <i class="fa-solid fa-chevron-right"></i></button>
          <span class="present-tools"><button id="kt" class="px-3 py-2 rounded-lg text-sm font-semibold" style="background:#facc15;color:#0f172a" title="지금 설명한 자료를 환자분 카카오톡으로 보내기"><i class="fa-solid fa-comment"></i> 카카오톡 보내기</button><button id="qr" class="px-3 py-2 rounded-lg bg-slate-800 text-sm" title="환자분 폰으로 이 안내장 열기 (QR)"><i class="fa-solid fa-qrcode"></i> QR</button>${m.images.some(im=>!isVideo(im))?`<button id="zoom" class="px-3 py-2 rounded-lg bg-slate-800 text-sm" title="사진 확대 (핀치·휠)"><i class="fa-solid fa-magnifying-glass-plus"></i> 확대</button>`:''}${m.kind==='before_after'&&m.images.length===2?`<button id="ba-slider" class="px-3 py-2 rounded-lg bg-slate-800 text-sm" aria-pressed="${!!state.baSlider}"><i class="fa-solid fa-sliders"></i> 전후 슬라이더</button>`:''}${/\S/.test(m.body||'')?`<button id="point" class="px-3 py-2 rounded-lg bg-slate-800 text-sm" aria-pressed="${!!state.pointMode}" title="항목을 하나씩 짚어가며 보여줍니다 (↓·Space 다음, ↑ 이전)"><i class="fa-solid fa-hand-pointer"></i> 포인트</button>`:''}</span>
          <button id="fs" class="ml-auto px-3 py-2 rounded-lg bg-slate-800 text-sm"><i class="fa-solid fa-expand"></i></button>
          <button id="ex" class="px-4 py-2 rounded-lg bg-sky-600 text-sm font-semibold">설명 끝 · 보내기</button>
          <button id="cl" class="px-3 py-2 rounded-lg bg-slate-800 text-sm">닫기</button>
        </div>`;
      PCSpeed.bind(box);
      if (state.baSlider && m.kind==='before_after' && m.images.length===2) { $('.stage', box).innerHTML = `<div class="text-sky-300 text-sm font-semibold mb-2">${KIND[m.kind]}${m.category ? ' · ' + esc(m.category) : ''}</div><h1>${esc(m.title)}</h1><div class="mt-6">${baSliderHtml(m)}</div>`; bindBaSlider(box); annotationView = null; }
      else annotationView = window.PCAnnotations.mount(box, m, annotationApi);
      applyPointMode(box);
      const kb = $('#kt', box); if (kb) kb.onclick = () => { box.querySelectorAll('video').forEach(v => v.pause()); presentSend(list, box, async () => { await annotationView?.flush(); }); };
      const qb = $('#qr', box); if (qb) qb.onclick = async () => { try { await annotationView?.flush(); } catch (e) { toast(e.message, false); return; } showQr(list, state.scope || '', box); };
      const zb = $('#zoom', box); if (zb) zb.onclick = () => { const srcs = m.images.filter(im => !isVideo(im)).map(im => imgUrl(im.key)); openLightbox(srcs, 0); };
      const bs = $('#ba-slider', box); if (bs) bs.onclick = async () => { try { await annotationView?.flush(); } catch (e) { toast(e.message, false); return; } state.baSlider = !state.baSlider; draw(); };
      const pb = $('#point', box); if (pb) pb.onclick = () => { state.pointMode = !state.pointMode; state.pointIdx = 0; draw(); };
      box.querySelectorAll('.stage img').forEach(img => { if (!img.closest('.annotation-surface')) { img.style.cursor = 'zoom-in'; img.addEventListener('dblclick', () => openLightbox([img.currentSrc || img.src], 0)); } });
      $('#pv', box).onclick = () => move(-1); $('#nx', box).onclick = () => move(1);
      $('#fs', box).onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else box.requestFullscreen?.(); };
      $('#present-back', box).onclick = () => close(); $('#cl', box).onclick = () => close(); $('#ex', box).onclick = () => close(true);
    };
    const move = async delta => {
      if (navigating || i + delta < 0 || i + delta >= list.length) return;
      navigating = true;
      try { await annotationView?.flush(); box.querySelectorAll('video').forEach(v => v.pause()); i += delta; draw(); }
      catch (e) { toast(e.message, false); }
      finally { navigating = false; }
    };
    const key = e => { if (e.target.closest('.annotation-toolbar') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (document.querySelector('.pc-lightbox') || document.querySelector('.pc-qr-overlay') || document.querySelector('#present-send') || document.querySelector('#dispatch-preview')) return; if (state.pointMode && (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'ArrowUp')) { e.preventDefault(); stepPoint(box, e.key === 'ArrowUp' ? -1 : 1); return; } if (e.key === 'ArrowRight') move(1); else if (e.key === 'ArrowLeft') move(-1); else if (e.key === 'Escape') close(); };
    const close = async (send = false) => {
      if (navigating) return; navigating = true;
      try { await annotationView?.flush(); box.querySelectorAll('video').forEach(v => v.pause()); document.removeEventListener('keydown', key); if (document.fullscreenElement) await document.exitFullscreen(); box.remove(); if(!send){scrollTo(0,returnScroll);returnFocus?.focus({preventScroll:true});} if (send) { state.today = list.map(m => m.id); saveToday(); state.tab = 'send'; render(); } }
      catch (e) { toast(e.message, false); }
      finally { navigating = false; }
    };
    document.addEventListener('keydown', key); draw();
  }

  // ─── 발송 공통 흐름 ── 미리보기 → 최종 확인 → 발송. 보내기 탭과 설명 화면이 같이 쓴다. 취소하면 null, 성공하면 결과.
  // opts: {ids, channel:'alimtalk'|'link', includeAnnotations, phone, checkin:{id,name,last4}|null, label}
  async function dispatchFlow(opts){
    const {ids,channel,includeAnnotations,phone,checkin,label}=opts;
    if(includeAnnotations&&!state.scope)throw new Error('설명하기에서 이번 설명을 시작한 뒤 필기를 선택하세요.');
    if(includeAnnotations)await PCAnnotations.flush(ids);
    const payload={material_ids:ids,phone:checkin?'':(phone||''),checkin_id:checkin?checkin.id:undefined,label:label||'',channel,include_annotations:!!includeAnnotations,annotation_scope:state.scope};
    const preview=await api('/dispatches/preview',{method:'POST',body:JSON.stringify(payload)});
    payload.preview_hash=preview.preview_hash;payload.request_key=crypto.randomUUID();payload.confirmed=true;
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.id='dispatch-preview';dialog.className='safety-dialog handout-preview';
      dialog.innerHTML=`<header><h2>환자에게 전달될 안내장</h2><p>${channel==='link'?'링크 직접 전달':'카카오 수신번호: '+(checkin?esc(checkin.name)+'님 (접수 번호 ****-'+esc(checkin.last4)+')':esc(payload.phone))} · ${includeAnnotations?'현재 설명 필기 포함':'원본 자료만'}</p><p>아직 발행·발송되지 않았습니다. 자료·순서·비용·필기와 수신번호를 확인하세요.</p></header><div class="preview-content">${PCGuide.render(preview)}</div><footer><label><input id="preview-confirmed" type="checkbox">내용·수신 대상·전송 권한을 확인했고, 필기에 다른 환자의 개인정보가 없습니다.</label><p id="preview-error" role="status"></p><button id="preview-cancel">돌아가서 수정</button><button id="preview-send" class="primary-action">${channel==='link'?'확인 · 링크 만들기':'확인 · 카카오톡 발송'}</button></footer>`;
      document.body.append(dialog);dialog.showModal();let sending=false,ambiguous=false,result=null;
      dialog.addEventListener('cancel',e=>{if(sending||ambiguous)e.preventDefault()});
      dialog.addEventListener('close',()=>{dialog.remove();resolve(result)});
      $('#preview-cancel',dialog).onclick=()=>{if(!sending&&!ambiguous)dialog.close()};
      $('#preview-send',dialog).onclick=async()=>{
        if(sending)return;if(!$('#preview-confirmed',dialog).checked){$('#preview-error',dialog).textContent='최종 확인란을 체크해 주세요.';return}
        sending=true;$('#preview-send',dialog).disabled=true;$('#preview-cancel',dialog).disabled=true;
        try{
          result=await api('/dispatches',{method:'POST',body:JSON.stringify(payload)});
          ambiguous=false;dialog.close();
        }catch(e){
          ambiguous=!e.status||e.status>=500;
          $('#preview-error',dialog).textContent=e.message+(ambiguous?' 같은 요청으로 결과를 다시 확인하세요. 새 발송은 만들지 않습니다.':'');
          $('#preview-send',dialog).textContent=ambiguous?'같은 요청 결과 다시 확인':'확인 후 다시 시도';
        }finally{sending=false;if(dialog.isConnected){$('#preview-send',dialog).disabled=false;$('#preview-cancel',dialog).disabled=ambiguous}}
      };
    });
  }
  // 【2026-09-23】설명 화면에서 바로 카카오톡 보내기 — 지금 환자가 있으면 그 분께, 없으면 이름·번호 입력. 설명 목록 전체를 보낸다.
  function presentSend(list, box, flushAnnotations, onDone){
    if(document.querySelector('#present-send'))return;
    if(!state.me.alimtalk_ready){toast('카카오 알림톡 설정이 아직 완료되지 않았습니다. 보내기 탭에서 링크로 전달하세요.',false);return}
    const p=state.patient;
    const dialog=document.createElement('dialog');dialog.id='present-send';dialog.className='safety-dialog';
    dialog.innerHTML=`<h2><i class="fa-solid fa-comment text-yellow-500"></i> 지금 설명한 자료를 카카오톡으로</h2>
      <p>${list.length}개 자료가 안내장 하나로 묶여 환자분 카카오톡에 <b>[${esc(state.me.hospital.name)} 진료 안내]</b>로 도착합니다.</p>
      <ol class="text-sm text-slate-600 my-3 space-y-1">${list.map((m,i)=>`<li>${i+1}. ${esc(m.title)}</li>`).join('')}</ol>
      ${p?`<div class="pc-patient on"><i class="fa-solid fa-user-check"></i><div class="flex-1 min-w-0"><b>${esc(p.name)}님</b><span class="text-slate-500 text-xs ml-2">${p.checkin_id?'오늘 접수 · ':'직접 입력 · '}${p.last4?'****-'+esc(p.last4):'번호 없음'}</span></div><button type="button" id="ps-change" class="text-xs text-sky-700 font-semibold">다른 환자</button></div>`
        :`<div class="flex flex-wrap gap-2"><input id="ps-name" maxlength="20" placeholder="환자 이름" class="border rounded-lg px-3 py-2 text-sm w-32"><input id="ps-phone" inputmode="numeric" placeholder="010-0000-0000" class="border rounded-lg px-3 py-2 text-sm flex-1 tracking-wider"></div><p class="text-xs text-slate-500 mt-1">환자분께 번호 수집·발송 동의를 받으셨는지 확인하세요.</p>`}
      <label class="annotation-send-option mt-3"><input id="ps-ann" type="checkbox">이번 설명의 필기 포함</label>
      <p id="ps-error" role="status" class="text-rose-600 text-sm"></p>
      <button id="ps-go" class="primary-action" style="background:#facc15;color:#0f172a"><i class="fa-solid fa-comment mr-1"></i>카카오톡 발송 전 확인</button><button id="ps-cancel">계속 설명하기</button>`;
    document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove());
    $('#ps-cancel',dialog).onclick=()=>dialog.close();
    const ch=$('#ps-change',dialog);if(ch)ch.onclick=()=>{state.patient=null;savePatient();dialog.close();presentSend(list,box,flushAnnotations,onDone)};
    let busy=false;
    $('#ps-go',dialog).onclick=async()=>{
      if(busy)return;busy=true;$('#ps-go',dialog).disabled=true;
      try{
        let checkin=null,phone='',label='';
        if(state.patient){checkin=state.patient.checkin_id?{id:state.patient.checkin_id,name:state.patient.name,last4:state.patient.last4}:null;phone=state.patient.phone||'';label=state.patient.name+'님'}
        else{const name=($('#ps-name',dialog).value||'').trim();const digits=($('#ps-phone',dialog).value||'').replace(/\D/g,'');if(!/^01\d{8,9}$/.test(digits))throw new Error('휴대전화 번호를 확인하세요');phone=digits;label=name?name+'님':'';if(name){state.patient={name,phone:digits,last4:digits.slice(-4)};savePatient()}}
        try{await flushAnnotations()}catch(e){throw new Error('필기 저장 실패: '+e.message)}
        const r=await dispatchFlow({ids:list.map(m=>m.id),channel:'alimtalk',includeAnnotations:$('#ps-ann',dialog).checked,phone,checkin,label});
        if(!r)return;
        dialog.close();
        const ok=['sent','accepted','delivered'].includes(r.status);
        if(ok){state.patient=null;savePatient();const h=box.querySelector('.present-patient');if(h)h.remove();}
        toast(ok?(r.status==='delivered'?'환자에게 전달 완료가 확인되었습니다.':'카카오톡 발송 요청이 접수되었습니다. 전달 여부는 발송내역에서 확인하세요.'):'발송 실패: '+(r.error||'발송내역에서 확인하세요'),ok);
        loadHistory();if(onDone)onDone();
      }catch(e){$('#ps-error',dialog).textContent=e.message}
      finally{busy=false;if(dialog.isConnected)$('#ps-go',dialog).disabled=false}
    };
  }

  // ─── 보내기 ───
  function renderSend(main) {
    const list = todayList();
    const ready = state.me.alimtalk_ready;
    main.innerHTML = `
      <div class="grid lg:grid-cols-5 gap-6">
        <section class="lg:col-span-3">
          <h2 class="text-lg font-bold mb-3">보낼 자료 <span class="text-sm font-normal text-slate-500">오늘의 설명 목록</span></h2>
          <button id="send-order" class="contact-button">질환 → 치료 → 사례 → 비용 순으로 정렬</button>
          ${list.length ? `<ol class="space-y-2">${list.map((m, i) => `<li class="bg-white border rounded-xl px-4 py-3 flex items-center gap-3"><span class="text-slate-400 w-5">${i + 1}</span><span class="px-1.5 py-0.5 rounded text-xs ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span><span class="font-semibold truncate">${esc(m.title)}</span></li>`).join('')}</ol>` : `<div class="bg-white border rounded-xl p-8 text-center text-slate-500 text-sm">보낼 자료가 없습니다. 자료함에서 담아 주세요.</div>`}
        </section>
        <section class="lg:col-span-2">
          <div class="bg-white border rounded-xl p-5 space-y-4 text-sm">
            ${patientBarHtml()}
            <label class="block" id="s-phone-wrap" ${state.patient ? 'hidden' : ''}>환자 휴대전화<input id="s-phone" inputmode="numeric" placeholder="010-0000-0000" class="mt-1 w-full border rounded-lg px-3 py-2.5 text-lg tracking-wider" ${ready ? '' : 'disabled'}></label>
            <label class="block">내부 메모 <span class="text-slate-400">(환자에게 안 보임)</span><input id="s-label" maxlength="40" placeholder="예: 3시 임플란트 상담" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
            <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">카카오톡에 <b>[${esc(state.me.hospital.name)} 진료 안내]</b>로 도착하며, 마지막 줄에 "${esc(state.me.hospital.name)}의 요청으로 'Patient Connect'가 발송합니다"가 표시됩니다.<br>환자분께 번호 수집·발송 동의를 받으셨는지 확인하세요 (<a href="/legal-guide" target="_blank" class="underline">안내 문구</a>).</div>
            <label class="annotation-send-option"><input id="s-annotations" type="checkbox" >현재 설명의 필기 포함</label><p class="text-xs text-slate-500">이미지는 필기한 화면을, 영상은 원본과 필기한 장면 캡처를 함께 보냅니다. 이번 설명에서 저장한 필기만 포함합니다. 개인정보가 적혀 있지 않은지 미리보기에서 확인하세요.</p>
            <button id="s-send" class="w-full py-3 rounded-lg bg-yellow-400 text-slate-900 font-bold disabled:opacity-40" ${list.length && ready ? '' : 'disabled'}><i class="fa-solid fa-comment mr-1"></i>카카오톡 발송 전 확인</button>
            <button id="s-link" class="w-full py-2.5 rounded-lg border font-semibold disabled:opacity-40" ${list.length ? '' : 'disabled'}><i class="fa-solid fa-link mr-1"></i>안내장 미리보기 · 링크 만들기</button>
            <div id="s-result"></div>
          </div>
        </section>
      </div>`;
    // 【2026-09-23】수신자 = 지금 환자 (설명 시작 때 고른 분). 접수면 checkin_id, 직접 입력이면 번호.
    const picked = state.patient && state.patient.checkin_id ? { id: state.patient.checkin_id, name: state.patient.name, last4: state.patient.last4 } : null;
    if (state.patient && !picked && state.patient.phone) { $('#s-phone').value = state.patient.phone; }
    if (state.patient && !$('#s-label').value) $('#s-label').value = state.patient.name + '님';
    bindPatientBar(main, () => render());
    const loadPicker = () => {};
    $('#send-order').onclick=()=>{const order={disease:0,explain:1,notice:1,before_after:2,cost:3};state.today=[...list].sort((a,b)=>(order[a.kind]??4)-(order[b.kind]??4)).map(m=>m.id);saveToday();render()};
    const ids = list.map((m) => m.id);
    const showResult = (r) => {
      const ok = ['sent','accepted','delivered'].includes(r.status);
      $('#s-result').innerHTML = `<div class="rounded-lg p-3 text-sm ${ok ? 'bg-emerald-50 text-emerald-800' : r.status === 'link' ? 'bg-sky-50 text-sky-800' : 'bg-rose-50 text-rose-800'}">
        ${ok ? (r.status==='delivered'?'환자에게 전달 완료가 확인되었습니다.':'발송 요청이 접수되었습니다. 전달 완료 여부는 발송내역에서 확인하세요.') : r.status === 'link' ? '안내장 링크를 만들었습니다. 복사해서 전달하세요.' : (r.status==='unknown'||r.status==='created'?'결과 확인 필요: ':'발송 실패: ') + esc(r.error || '발송내역에서 확인해 주세요.') + '<br>아래 링크를 직접 전달할 수 있습니다.'}
        <div class="mt-2 flex gap-2"><input readonly value="${esc(r.url)}" class="flex-1 border rounded px-2 py-1 bg-white text-xs"><button id="cp" class="px-2 py-1 rounded bg-slate-900 text-white text-xs">복사</button></div></div>`;
      $('#cp').onclick = () => { navigator.clipboard?.writeText(r.url); toast('링크를 복사했습니다'); };
      loadHistory();
    };
    let previewBusy=false;
    const send = async channel => {
      if(previewBusy)return;previewBusy=true;
      $('#s-send').disabled=true;$('#s-link').disabled=true;
      try{
        const includeAnnotations=$('#s-annotations').checked;
        const r=await dispatchFlow({ids,channel,includeAnnotations,phone:picked?'':(($('#s-phone').value||'').trim()||(state.patient&&state.patient.phone)||''),checkin:picked,label:$('#s-label').value});
        if(!r)return;
        showResult(r);
        if(['sent','accepted','delivered'].includes(r.status)){$('#s-phone').value='';$('#s-label').value='';state.patient=null;savePatient();$('#s-phone-wrap').hidden=false;$('#s-phone').disabled=!ready;$('#s-phone').placeholder='010-0000-0000'}
      }catch(e){toast(e.message,false)}finally{previewBusy=false;$('#s-send').disabled=!ready||!list.length;$('#s-link').disabled=!list.length}
    };
    $('#s-send').onclick = () => send('alimtalk'); $('#s-link').onclick = () => send('link');
  }

  // ─── 발송내역 ───
  async function loadHistory() { try { const [d, s] = await Promise.all([api('/dispatches?limit=100'), api('/stats')]); state.dispatches = d.dispatches; state.stats = s; } catch {} }
  function renderHistory(main) {
    const st = state.stats || { d7: { sent: 0, opened: 0 }, d30: { sent: 0, opened: 0 } };
    const rate = (x) => x.sent ? Math.round(x.opened / x.sent * 100) + '%' : '-';
    const badge = { sent: 'bg-emerald-100 text-emerald-800', link: 'bg-sky-100 text-sky-800', failed: 'bg-rose-100 text-rose-800', created: 'bg-slate-100', blocked: 'bg-slate-100' };
    const label = { sent: '접수 (전달 미확인)', accepted:'접수 (전달 대기)', delivered:'전달 완료', unknown:'결과 확인 필요', link: '링크 생성', retry_failed:'재시도 실패', retrying:'재발송 확인 중', failed: '실패', created: '접수 확인 중', blocked: '차단' };
    main.innerHTML = `
      <div class="grid sm:grid-cols-4 gap-3 mb-5 text-sm">
        ${[['7일 발행·접수', st.d7.sent], ['7일 열람률', rate(st.d7)], ['30일 발행·접수', st.d30.sent], ['30일 열람률', rate(st.d30)]].map(([l, v]) => `<div class="bg-white border rounded-xl p-4"><div class="text-slate-500 text-xs">${l}</div><div class="text-2xl font-extrabold mt-1">${v}</div></div>`).join('')}
      </div>
      <div class="bg-white border rounded-xl overflow-hidden">
        <table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="text-left px-4 py-2">보낸 때</th><th class="text-left px-2 py-2">번호</th><th class="text-left px-2 py-2">자료</th><th class="text-left px-2 py-2">메모</th><th class="text-left px-2 py-2">상태</th><th class="text-left px-2 py-2">열람</th><th></th></tr></thead>
        <tbody>${state.dispatches.length ? state.dispatches.map((d) => `<tr class="border-t"><td class="px-4 py-2 whitespace-nowrap text-slate-600">${esc((d.sent_at || d.created_at).slice(0, 16))}</td><td class="px-2 py-2 whitespace-nowrap">${esc(d.phone)}</td><td class="px-2 py-2 max-w-xs truncate" title="${esc(d.titles.join(', '))}">${esc(d.titles.join(', '))}</td><td class="px-2 py-2 text-slate-500">${esc(d.label || '')}</td><td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-xs ${badge[d.status] || 'bg-slate-100'}" title="${esc(d.error || '')}">${label[d.status] || d.status}</span>${d.error?`<p class="text-xs text-rose-700">${esc(d.error)}</p>`:''}${['sent','accepted','created','unknown','retrying'].includes(d.status)?`<button data-status="${d.id}" class="contact-button">결과 확인</button>`:''}</td><td class="px-2 py-2 whitespace-nowrap">${d.first_opened_at ? `<span class="text-emerald-700">열람 ${d.open_count}회</span>` : '<span class="text-slate-400">아직</span>'}</td><td class="px-2 py-2"><button data-copy="${esc(d.url)}" class="text-slate-400 hover:text-slate-800" title="링크 복사"><i class="fa-solid fa-link"></i></button>${d.status==='failed'&&d.channel==='alimtalk'?`<button data-resend="${d.id}" class="contact-button">재발송 확인</button>`:''}</td></tr>`).join('') : `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">아직 보낸 안내장이 없습니다</td></tr>`}</tbody></table>
      </div>
      <p class="text-xs text-slate-400 mt-3">통신 결과가 불확실한 요청은 자동 재발송하지 않습니다. 실패 시 링크를 복사해 전달하거나 SOLAPI 콘솔에서 먼저 확인하세요.<br>번호 원문은 발송 후 7일 내 파기되며 마지막 4자리만 남습니다. 링크는 ${state.me.hospital.link_days}일 뒤 만료됩니다.</p>`;
    main.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('/dispatches/'+b.dataset.status+'/status',{method:'POST'});await loadHistory();render();if(r.error)toast(r.error,false)}catch(e){toast(e.message,false)}finally{b.disabled=false}});
    main.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('링크를 복사했습니다'); });
    main.querySelectorAll('[data-resend]').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try {
        const path='/dispatches/'+b.dataset.resend+'/resend';
        const preview=await api(path,{method:'POST',body:JSON.stringify({preview:true})});
        const dialog=document.createElement('dialog');dialog.className='safety-dialog handout-preview';
        dialog.innerHTML=`<header><h2>기존 안내장 재발송 확인</h2><p>기존 수신번호 ${esc(preview.phone)} · 기존 자료와 필기를 그대로 보냅니다. 비용·사례가 바뀌었다면 새 안내장을 만드세요.</p></header><div class="preview-content">${PCGuide.render(preview)}</div><footer><label><input type="checkbox" data-retry-confirm>수신 대상·내용·동의를 확인했습니다.</label><p role="status"></p><button data-retry-cancel>취소</button><button data-retry-send class="primary-action">확인 · 1회 재발송</button></footer>`;
        document.body.append(dialog);dialog.showModal();let busy=false;
        dialog.oncancel=e=>{if(busy)e.preventDefault()};dialog.onclose=()=>dialog.remove();
        $('[data-retry-cancel]',dialog).onclick=()=>dialog.close();
        $('[data-retry-send]',dialog).onclick=async()=>{
          if(busy)return;if(!$('[data-retry-confirm]',dialog).checked){$('[role=status]',dialog).textContent='최종 확인란을 체크해 주세요.';return}
          busy=true;dialog.querySelectorAll('button').forEach(x=>x.disabled=true);
          try{const r=await api(path,{method:'POST',body:JSON.stringify({confirmed:true,preview_hash:preview.preview_hash})});toast(r.ok?'재발송 요청 접수 · 전달 여부는 결과 확인에서 확인하세요.':(r.error||'전달 결과 확인 필요'),r.ok)}catch(e){toast(e.message+' 발송내역에서 결과를 먼저 확인하세요.',false)}
          finally{busy=false;dialog.close();await loadHistory();render()}
        };
      }catch(e){toast(e.message,false)}finally{b.disabled=false}
    });
  }

  // ─── 설정 ───
  // 【2026-09-19】체어사이드 QR: 자료 묶음 → 링크 안내장 → 큰 QR. 환자분이 찍으면 바로 열리고, 안내장 안에서 본인 번호로 카톡 받기 가능.
  function qrSvg(url, cell) { const q = qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: cell || 6, margin: 2, scalable: true }); }
  async function showQr(list, scope, parent) {
    let r;
    try { r = await api('/dispatches/qr', { method: 'POST', body: JSON.stringify({ material_ids: list.map(m => m.id), scope: scope || '' }) }); }
    catch (e) { toast(e.message, false); return; }
    const hb = state.me.hospital;
    const ov = document.createElement('div'); ov.className = 'pc-qr-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'QR 안내장');
    ov.innerHTML = `<div class="pc-qr-card fade-in">
      <div class="text-sm font-semibold text-slate-500">${esc(hb.name)}</div>
      <h2 class="text-2xl font-extrabold mt-1">휴대폰 카메라로 찍어 주세요</h2>
      <p class="text-slate-600 mt-1">오늘 설명드린 자료 ${list.length - (r.skipped || []).length}개가 바로 열립니다</p>
      ${qrSvg(r.url, 8)}
      <div class="text-xs text-slate-400 break-all">${esc(r.url)}</div>
      <p class="text-sm text-slate-500 mt-3">열린 안내장 아래에서 환자분이 직접 번호를 넣으면 카카오톡으로도 받아둘 수 있습니다 · ${esc(String(r.expires_at).slice(0, 10))}까지</p>
      ${(r.skipped || []).length ? `<p class="text-xs text-amber-700 mt-2">공유 조건이 안 된 자료는 빠졌습니다: ${esc(r.skipped.join(', '))}</p>` : ''}
      <button id="qr-close" class="mt-4 px-6 py-2.5 rounded-xl bg-slate-900 text-white font-semibold">닫기</button>
    </div>`;
    (parent || document.body).appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    $('#qr-close', ov).onclick = close; ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  }
  function qrCardsHtml() {
    const cards = state.qrCards || [];
    const cats = categoryList();
    return `<fieldset class="brand-editor"><legend>체어사이드 QR 카드 <span class="text-slate-400 font-normal">환자분이 찍으면 자료가 열리고 맨 위에 병원 채널 친구추가 버튼이 뜹니다 · 3년 유효</span></legend>
      <div id="qc-list" class="mt-2 space-y-1.5 text-sm">${cards.length ? cards.map(k => `<div class="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"><i class="fa-solid fa-qrcode text-slate-400"></i><span class="font-semibold">${esc(k.title)}</span><span class="text-xs text-slate-400 truncate flex-1">${esc(k.titles.join(', '))}</span><span class="text-xs text-slate-500 whitespace-nowrap">열람 ${k.open_count} · 친구추가 클릭 ${k.friend_clicks || 0}${k.self_sends ? ' · 카톡요청 ' + k.self_sends : ''}</span><button data-qc-del="${k.id}" class="text-xs text-rose-600">삭제</button></div>`).join('') : '<p class="text-xs text-slate-400">아직 카드가 없습니다. 분류를 고르고 만들어 보세요.</p>'}</div>
      <div class="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-center"><select id="qc-cat" class="border rounded-lg px-2 py-2">${cats.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select><input id="qc-title" maxlength="30" placeholder="카드 제목 (예: 스케일링 후 주의)" class="border rounded-lg px-3 py-2"><button id="qc-make" class="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold whitespace-nowrap">카드 만들기</button></div>
      <p class="text-xs text-slate-400 mt-2">친구추가 버튼은 위 '병원 카카오 상담 주소'(pf.kakao.com)를 씁니다. 고른 분류의 공유 가능한 설명·질환·주의사항 자료가 담깁니다(비용·비포애프터 제외). 만든 뒤 <a href="/app/qr-cards/print" target="_blank" class="underline text-sky-700">QR 카드 인쇄 페이지</a>에서 A4로 뽑으세요.</p>
    </fieldset>`;
  }
  function bindQrCards() {
    const mk = $('#qc-make'); if (!mk) return;
    mk.onclick = async () => {
      const cat = $('#qc-cat').value, title = $('#qc-title').value.trim() || cat;
      const ids = state.materials.filter(m => m.active !== false && categoryOf(m) === cat && ['explain', 'disease', 'notice'].includes(m.kind)).map(m => m.id);
      if (!ids.length) { toast('이 분류에 담을 설명 자료가 없습니다', false); return; }
      try { const r = await api('/qr-cards', { method: 'POST', body: JSON.stringify({ title, material_ids: ids }) }); state.qrCards = (await api('/qr-cards')).cards; toast('QR 카드를 만들었습니다' + (r.skipped?.length ? ' (제외 ' + r.skipped.length + '개)' : '')); render(); }
      catch (e) { toast(e.message, false); }
    };
    document.querySelectorAll('[data-qc-del]').forEach(b => b.onclick = async () => { if (!confirm('이 QR 카드를 삭제할까요? 인쇄한 카드는 더 이상 열리지 않습니다.')) return; await api('/qr-cards/' + b.dataset.qcDel, { method: 'DELETE' }); state.qrCards = (await api('/qr-cards')).cards; render(); });
  }

  function renderSettings(main) {
    const h = state.me.hospital;
    if (!state.qrCards) { api('/qr-cards').then(r => { state.qrCards = r.cards; if (state.tab === 'settings') render(); }).catch(() => { state.qrCards = []; }); }
    main.innerHTML = `<div class="max-w-xl bg-white border rounded-xl p-5 space-y-4 text-sm">
      <h2 class="text-lg font-bold">설정</h2>
      <div><div class="text-slate-500 text-xs">병원명 (Patient Hub 정본 · 발송 메시지의 #{병원명})</div><div class="font-semibold mt-1">${esc(h.name)}</div></div>
      <label class="block">안내장에 표시할 병원 전화<input id="st-phone" value="${esc(h.phone || '')}" placeholder="041-000-0000" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">주소 (선택)<input id="st-addr" value="${esc(h.address || '')}" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">병원 카카오 상담 주소<input id="st-chat" type="url" value="${esc(h.chat_url||'')}" placeholder="https://pf.kakao.com/..." class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">예약 페이지 주소<input id="st-booking" type="url" value="${esc(h.booking_url||'')}" placeholder="https://..." class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">안내장 링크 유효기간(일)<input id="st-days" type="number" min="7" max="180" value="${h.link_days}" class="mt-1 w-32 border rounded-lg px-3 py-2"></label>
      <fieldset class="brand-editor"><legend>병원 브랜드 <span class="text-slate-400 font-normal">안내장·설명 화면 상단에 표시</span></legend>
        <div class="flex items-center gap-3 mt-2">
          <div class="brand-logo-box">${h.logo_key?`<img src="/a/${esc(h.logo_key)}" alt="로고">`:'<span class="text-xs text-slate-400">로고 없음</span>'}</div>
          <div class="flex flex-col gap-1"><label class="contact-button" style="margin:0;cursor:pointer"><i class="fa-solid fa-upload mr-1"></i>로고 올리기<input id="st-logo" type="file" accept="image/png,image/jpeg,image/webp" class="hidden"></label>${h.logo_key?'<button id="st-logo-del" class="text-xs text-rose-600">로고 삭제</button>':''}<span class="text-[11px] text-slate-400">배경 투명 PNG · 2MB 이하</span></div>
        </div>
        <div class="flex items-center gap-3 mt-3"><label class="flex items-center gap-2">대표색 <input id="st-color" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(h.primary_color||'')?h.primary_color:'#0ea5e9')}"></label><span class="text-xs text-slate-400">버튼·강조 표시에 쓰입니다</span></div>
        <label class="block mt-3">한 줄 소개 (선택)<input id="st-tagline" maxlength="60" value="${esc(h.tagline||'')}" placeholder="예: 천안 불당동 · 임플란트·교정 전문" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      </fieldset>
      ${qrCardsHtml()}
      <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">카카오 알림톡 상태: ${state.me.alimtalk_ready ? '<span class="text-emerald-700 font-semibold">사용 가능</span>' : '<span class="text-amber-700 font-semibold">설정 미완료</span>'} · 발송 채널은 페이션트퍼널의 'Patient Connect' 공용 채널이며 병원이 따로 개설할 것은 없습니다.</div>
      <div class="flex gap-2"><button id="st-save" class="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold">저장</button><button id="st-logout" class="ml-auto px-3 py-2 text-slate-500">로그아웃</button></div>
      <p class="text-xs text-slate-400"><a href="/legal-guide" target="_blank" class="underline">병원용 안내 문구</a> · <a href="/privacy" target="_blank" class="underline">개인정보처리방침</a></p>
    </div>`;
    $('#st-save').onclick = async () => { try { await api('/settings', { method: 'PUT', body: JSON.stringify({ phone: $('#st-phone').value, address: $('#st-addr').value, link_days: $('#st-days').value, chat_url: $('#st-chat').value, booking_url: $('#st-booking').value, primary_color: $('#st-color').value, tagline: $('#st-tagline').value }) }); await loadMe(); toast('저장했습니다'); render(); } catch (e) { toast(e.message, false); } };
    $('#st-logo').onchange = async () => { const f = $('#st-logo').files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); try { const r = await fetch('/api/settings/logo', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || '업로드 실패'); await loadMe(); toast('로고를 올렸습니다'); render(); } catch (e) { toast(e.message, false); } };
    const ld = $('#st-logo-del'); if (ld) ld.onclick = async () => { await api('/settings/logo', { method: 'DELETE' }); await loadMe(); render(); };
    $('#st-logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; };
    bindQrCards();
  }

  async function loadSets(){state.sets=(await api('/material-sets')).sets}
  async function loadMe() { state.me = await api('/me'); }
  async function loadLibrary() { state.library = await api('/material-library'); }
  async function loadMaterials() { const all = (await api('/materials?all=1')).materials; state.materials = all.filter(m => m.active !== false); state.hidden = all.filter(m => m.active === false); state.today = state.today.filter((id) => state.materials.some((m) => m.id === id)); }
  (async () => {
    try { await loadMe(); loadPatient();try{state.today=JSON.parse(sessionStorage.getItem('pc_today_'+state.me.hospital.id)||'[]');state.scope=sessionStorage.getItem('pc_scope_'+state.me.hospital.id)||''}catch{state.today=[]} await Promise.all([loadMaterials(), loadLibrary(), loadSets()]); await loadHistory(); render(); }
    catch (e) { if (e.message !== 'auth') app.innerHTML = `<div class="p-10 text-center text-rose-600">${esc(e.message)}</div>`; }
  })();
})();
