/* Patient Connect 병원 콘솔 — 자료함 · 설명하기 · 보내기 · 발송내역 · 설정 (의존성 없음) */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { explain: '진료설명', disease: '질환설명', cost: '비용설명', before_after: '비포애프터', notice: '주의사항' };
  const LIBRARY_KINDS = ['explain', 'disease', 'cost', 'before_after'];
  // Legacy precautions remain visible under treatment explanations without rewriting stored snapshots.
  const groupKind = (kind) => kind === 'notice' ? 'explain' : kind;
  const KIND_COLOR = { explain: 'bg-sky-100 text-sky-800', disease: 'bg-emerald-100 text-emerald-800', before_after: 'bg-violet-100 text-violet-800', cost: 'bg-amber-100 text-amber-800', notice: 'bg-rose-100 text-rose-800' };
  const won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';
  const state = { me: null, materials: [], today: [], tab: 'library', dispatches: [], stats: null, library: { categories: {}, examples: [], imported_count: 0 }, filter: '', kindFilter: '', categoryFilter: '', editing: null, present: null, sets: [], scope: '' };
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
  function imgUrl(key, token) { return '/a/' + key + (token ? '?t=' + token : ''); }
  const isVideo = im => im?.media_type === 'video' || /\.(mp4|webm)$/i.test(im?.key || '');
  const mediaHtml = (im, token, cls='w-full') => isVideo(im) ? `<video src="${imgUrl(im.key, token)}" controls playsinline preload="metadata" class="${cls}" aria-label="${esc(im.caption || '설명 영상')}"></video>` : `<img src="${imgUrl(im.key, token)}" alt="${esc(im.caption || '설명 이미지')}" class="${cls}" loading="lazy">`;
  function toast(msg, ok) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm z-[70] fade-in ' + (ok === false ? 'bg-rose-600' : 'bg-slate-900');
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  // The selection and current scope are restored only after the clinic identity is known.
  function saveToday() { sessionStorage.setItem('pc_today_' + state.me.hospital.id, JSON.stringify(state.today)); }

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
  function materialCard(m, extra) {
    const img = m.images[0] ? `<button class="media-card-cover" data-preview="${m.id}" aria-label="${esc(m.title)} 크게 보기">${isVideo(m.images[0]) ? '<span class="video-cover"><i class="fa-solid fa-circle-play"></i><span>영상 설명자료</span></span>' : mediaHtml(m.images[0])}<span class="media-cover-label">${isVideo(m.images[0]) ? '영상' : '이미지'} · ${m.images.length}개 <i class="fa-solid fa-expand"></i></span></button>` : `<button data-preview="${m.id}" class="empty-media-cover" aria-label="${esc(m.title)} 설명 보기"><i class="fa-regular fa-image"></i><span>이미지·영상 추가 전</span></button>`;
    return `<div class="bg-white rounded-xl border shadow-sm flex flex-col fade-in">
      ${img}
      <div class="p-3 flex-1">
        <div class="flex flex-wrap items-center gap-2 text-xs"><span class="px-1.5 py-0.5 rounded ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span>${m.is_example ? '<span class="example-badge">검토용 예시</span>' : ''}${m.kind==='before_after'?`<span class="example-badge">${m.guidance?.external_allowed?'외부 전송 확인됨':'병원 내 설명용'}</span>`:''}${m.category ? `<span class="text-slate-500">${esc(m.category)}</span>` : ''}</div>
        <div class="font-bold mt-1.5 leading-snug">${esc(m.title)}</div>
        <div class="text-xs text-slate-500 mt-1 line-clamp-2">${esc((m.body || '').replace(/\n/g, ' '))}${m.kind === 'cost' && m.cost.length ? ' · 항목 ' + m.cost.length + '개' : ''}</div>
      </div>
      <div class="px-3 pb-3 flex gap-2 text-sm">${extra}</div>
    </div>`;
  }
  function renderLibrary(main) {
    const q = state.filter.trim().toLocaleLowerCase();
    const list = state.materials.filter((m) => (!state.kindFilter || groupKind(m.kind) === state.kindFilter) && (!state.categoryFilter || m.category === state.categoryFilter) && (!q || (m.title + ' ' + (m.category || '') + ' ' + (m.body || '')).toLocaleLowerCase().includes(q)));
    const cats = categoriesFor(state.kindFilter);
    const categoryLabel = state.kindFilter === 'disease' ? '질환 분류' : state.kindFilter ? '진료 분류' : '세부 분류';
    const allExamplesAdded = state.library.examples.length > 0 && state.library.imported_count >= state.library.examples.length && !state.library.missing_images;
    const countKind = (kind) => state.materials.filter((m) => !kind || groupKind(m.kind) === kind).length;
    main.innerHTML = `
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <h2 class="text-lg font-bold">자료함 <span class="text-sm font-normal text-slate-500">${state.materials.length}개</span></h2>
        <input id="q" value="${esc(state.filter)}" aria-label="자료 검색" placeholder="제목·진료 항목·내용 검색" class="border rounded-lg px-3 py-2 text-sm w-56">
        <button id="add-examples" class="ml-auto px-3 py-2 rounded-lg border bg-white text-sm font-semibold" ${allExamplesAdded ? 'disabled' : ''}>${allExamplesAdded ? '이미지 목업 추가됨' : state.library.missing_images ? '기존 예시에 이미지 채우기' : '이미지 목업 ' + state.library.examples.length + '개 넣기'}</button>
        <button id="new" class="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"><i class="fa-solid fa-plus mr-1"></i>자료 등록</button>
      </div>
      ${setsHtml()}
      <nav class="material-kind-tabs" aria-label="자료 유형">${[['', '전체'], ...LIBRARY_KINDS.map(k => [k, KIND[k]])].map(([k, label]) => `<button data-kind-filter="${k}" aria-pressed="${state.kindFilter === k}">${label}<span>${countKind(k)}</span></button>`).join('')}</nav>
      <div class="material-category-filters" aria-label="${categoryLabel}"><span>${categoryLabel}</span><button data-cat="" aria-pressed="${!state.categoryFilter}">전체</button>${cats.map(c => `<button data-cat="${esc(c)}" aria-pressed="${state.categoryFilter === c}">${esc(c)}<small>${state.materials.filter(m => (!state.kindFilter || groupKind(m.kind) === state.kindFilter) && m.category === c).length}</small></button>`).join('')}</div>
      <p id="material-result-count" class="text-xs text-slate-500 mb-4" aria-live="polite">${state.kindFilter ? KIND[state.kindFilter] : '전체 자료'} · ${list.length}개${state.kindFilter === 'explain' ? ' · 기존 주의사항 포함' : ''}</p>
      ${list.length ? `<div id="material-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${list.map((m) => materialCard(m, `
          <button data-add="${m.id}" class="flex-1 px-2 py-1.5 rounded-lg ${state.today.includes(m.id) ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 hover:bg-slate-200'}">${state.today.includes(m.id) ? '<i class="fa-solid fa-check mr-1"></i>오늘 설명에 담김' : '<i class="fa-solid fa-plus mr-1"></i>오늘 설명에 담기'}</button>
          <button data-edit="${m.id}" class="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"><i class="fa-solid fa-pen"></i></button>`)).join('')}</div>`
        : `<div class="bg-white rounded-xl border p-10 text-center text-slate-500">
            <div class="text-3xl mb-2">🗂️</div>
            <p class="font-semibold text-slate-700">${state.materials.length ? '선택한 조건에 맞는 자료가 없습니다' : '아직 등록한 자료가 없습니다'}</p>
            <p class="text-sm mt-1">${state.materials.length ? '다른 자료 유형이나 진료 항목을 선택하거나 검색어를 바꿔 보세요.' : '진료 과정, 질환의 원인, 비용표, 치료 전후 자료를 분류해서 등록해 보세요.'}</p>
            ${state.materials.length ? '<button id="reset-filters" class="mt-4 px-4 py-2 rounded-lg border text-sm font-semibold">필터 초기화</button>' : ''}
            <button id="new2" class="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold">${state.kindFilter ? KIND[state.kindFilter] + ' 등록' : '첫 자료 등록'}</button>
          </div>`}`;
    bindSets(main);
    $('#q').oninput = (e) => { state.filter = e.target.value; renderLibrary(main); $('#q').focus(); $('#q').setSelectionRange(state.filter.length, state.filter.length); };
    main.querySelectorAll('[data-kind-filter]').forEach((b) => b.onclick = () => { state.kindFilter = b.dataset.kindFilter; state.categoryFilter = ''; renderLibrary(main); });
    main.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { state.categoryFilter = b.dataset.cat; renderLibrary(main); });
    const reset = $('#reset-filters'); if (reset) reset.onclick = () => { state.filter = ''; state.kindFilter = ''; state.categoryFilter = ''; renderLibrary(main); };
    $('#add-examples').onclick = openExamples;
    const nb = $('#new') || $('#new2'); if (nb) nb.onclick = () => openEditor(null);
    const nb2 = $('#new2'); if (nb2) nb2.onclick = () => openEditor(null);
    main.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { const id = Number(b.dataset.add); state.today = state.today.includes(id) ? state.today.filter((x) => x !== id) : [...state.today, id]; saveToday(); render(); });
    main.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => startPresent([state.materials.find(m => m.id === Number(b.dataset.preview))]));
    main.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditor(state.materials.find((m) => m.id === Number(b.dataset.edit))));
  }

  function openExamples() {
    if ($('#example-dialog')) return;
    const box = document.createElement('div'); box.id = 'example-dialog'; box.className = 'example-dialog-backdrop';
    const returnFocus = document.activeElement;
    box.innerHTML = `<section class="example-dialog" role="dialog" aria-modal="true" aria-labelledby="example-title"><h2 id="example-title">치과 이미지 목업 ${state.library.examples.length}개 넣기</h2><p>${esc(state.library.example_notice)}</p><ul>${state.library.examples.map(m => `<li><span>${KIND[m.kind]} · ${esc(m.category)}</span><b>${esc(m.title)}</b></li>`).join('')}</ul><p>설명용 도식과 참고 이미지를 배치한 이미지 목업입니다. 실제 환자 사례나 확정된 치료 안내가 아닙니다. 현재 병원 자료함에만 추가하며 기존 자료는 수정하지 않습니다. 반복 실행해도 중복 추가하지 않습니다.</p><label class="example-confirm"><input id="sample-confirm" type="checkbox">검토용 예시임을 확인했습니다.</label><p id="sample-status" role="status"></p><footer><button id="sample-cancel" class="px-4 py-2 border rounded-lg">취소</button><button id="sample-import" class="px-4 py-2 rounded-lg bg-slate-900 text-white">자료함에 추가</button></footer></section>`;
    document.body.append(box); const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    let busy = false;
    const close = () => { if (busy) return; box.remove(); document.body.style.overflow = oldOverflow; returnFocus?.focus(); };
    $('#sample-cancel').onclick = close; $('#sample-confirm').focus();
    box.onkeydown = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const nodes = [...box.querySelectorAll('button:not(:disabled),input:not(:disabled)')], first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    $('#sample-import').onclick = async () => {
      if (!$('#sample-confirm').checked) { $('#sample-status').textContent = '검토용 예시임을 먼저 확인해 주세요.'; return; }
      busy = true; $('#sample-import').disabled = true; $('#sample-cancel').disabled = true;
      try {
        const result = await api('/materials/examples', { method: 'POST', body: JSON.stringify({ confirmed: true }) });
        await Promise.all([loadMaterials(), loadLibrary()]);
        busy = false; close(); state.kindFilter = ''; state.categoryFilter = ''; state.filter = ''; render();
        toast(result.added ? `이미지 목업 ${result.added}개를 추가했습니다.` : result.updated ? `기존 예시 ${result.updated}개에 이미지를 채웠습니다.` : '이미 추가한 목업은 그대로 유지했습니다.');
      } catch (e) { $('#sample-status').textContent = e.message; }
      finally { busy = false; if (box.isConnected) { $('#sample-import').disabled = false; $('#sample-cancel').disabled = false; } }
    };
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
    const categoryOptions = state.library.categories[groupKind(m.kind)] || [];
    const customCategory = !!m.category && !categoryOptions.includes(m.category);
    box.innerHTML = `<div class="fixed inset-0 bg-black/40 z-40 flex items-start justify-center overflow-auto p-4">
      <div class="bg-white rounded-2xl w-full max-w-2xl my-6 fade-in">
        <div class="px-5 py-4 border-b flex items-center"><h3 class="font-bold">${m.id ? '자료 수정' : '자료 등록'}</h3><button id="ed-close" class="ml-auto text-slate-400 hover:text-slate-800 text-xl">&times;</button></div>
        <div class="p-5 space-y-4 text-sm">
          <div class="flex flex-wrap gap-2" aria-label="자료 유형 선택">${LIBRARY_KINDS.map(k => `<button data-kind="${k}" aria-pressed="${groupKind(m.kind) === k}" class="px-3 py-1.5 rounded-full border ${groupKind(m.kind) === k ? 'bg-slate-900 text-white' : ''}">${KIND[k]}</button>`).join('')}</div>
          ${m.is_example ? `<p class="example-editor-notice">${esc(state.library.example_notice)}</p>` : ''}
          ${m.kind === 'notice' ? '<p class="text-xs text-slate-500">기존 주의사항 자료입니다. 진료설명에 함께 표시하며, 유형을 직접 변경하지 않으면 기존 주의사항 분류를 유지합니다.</p>' : ''}
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
          ${m.id ? `<button id="ed-del" class="text-rose-600 text-sm">삭제</button>` : ''}
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
    const del = $('#ed-del'); if (del) del.onclick = async () => { if (!confirm('이 자료를 자료함에서 뺄까요? (이미 보낸 안내장에는 영향 없음)')) return; await api('/materials/' + m.id, { method: 'DELETE' }); state.today = state.today.filter((x) => x !== m.id); saveToday(); await loadMaterials(); box.remove(); state.editing = null; render(); };
    const f = $('#ed-file'); if (f) f.onchange = async () => {
      const file = f.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        const r = await fetch('/api/materials/' + m.id + '/images', { method: 'POST', body: fd }); const j = await r.json();
        if (!r.ok) throw new Error(j.error || '업로드 실패');
        sync(); m.images = j.images; m.guidance = {...m.guidance, external_allowed:false, deidentified:false}; await loadMaterials(); renderEditor();
      } catch (e) { toast(e.message, false); }
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
        ${list.length ? `<button id="go" class="ml-auto px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold"><i class="fa-solid fa-display mr-1"></i>큰 화면으로 설명</button><button id="clear" class="px-3 py-2 text-sm text-slate-500">비우기</button>` : ''}
      </div>
      ${list.length ? `<ol class="space-y-2">${list.map((m, i) => `<li class="bg-white border rounded-xl px-4 py-3 flex items-center gap-3 fade-in">
          <span class="text-slate-400 w-5">${i + 1}</span>
          <span class="px-1.5 py-0.5 rounded text-xs ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span>
          <span class="font-semibold flex-1 truncate">${esc(m.title)}</span>
          <button data-up="${i}" class="text-slate-400 hover:text-slate-800 px-1" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
          <button data-down="${i}" class="text-slate-400 hover:text-slate-800 px-1" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
          <button data-rm="${m.id}" class="text-slate-400 hover:text-rose-600 px-1"><i class="fa-solid fa-xmark"></i></button>
        </li>`).join('')}</ol>
        <p class="text-xs text-slate-400 mt-3">설명이 끝나면 [보내기]에서 이 목록을 그대로 안내장으로 보낼 수 있습니다.</p>`
        : `<div class="bg-white rounded-xl border p-10 text-center text-slate-500"><div class="text-3xl mb-2">🖥️</div><p class="font-semibold text-slate-700">오늘 설명할 자료를 자료함에서 담아 주세요</p><p class="text-sm mt-1">담은 순서대로 큰 화면에 넘겨 가며 보여줍니다.</p><button id="tolib" class="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">자료함으로</button></div>`}`;
    main.insertAdjacentHTML('afterbegin',setsHtml());bindSets(main);
    const go = $('#go'); if (go) go.onclick = () => startPresent(list);
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
    const box = document.createElement('div'); box.className = 'present'; document.body.appendChild(box);
    const draw = () => {
      const m = list[i];
      box.innerHTML = `<div class="stage fade-in"><div class="text-sky-300 text-sm font-semibold mb-2">${KIND[m.kind]}${m.category ? ' · ' + esc(m.category) : ''}</div><h1>${esc(m.title)}</h1><div class="mt-6">${slideHtml(m)}${PCGuide.guidanceHtml(m)}</div></div>
        <div class="flex items-center gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button id="pv" class="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> 이전</button>
          <span class="text-slate-400 text-sm">${i + 1} / ${list.length}</span>
          <button id="nx" class="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30" ${i === list.length - 1 ? 'disabled' : ''}>다음 <i class="fa-solid fa-chevron-right"></i></button>
          <button id="fs" class="ml-auto px-3 py-2 rounded-lg bg-slate-800 text-sm"><i class="fa-solid fa-expand"></i></button>
          <button id="ex" class="px-4 py-2 rounded-lg bg-sky-600 text-sm font-semibold">설명 끝 · 보내기</button>
          <button id="cl" class="px-3 py-2 rounded-lg bg-slate-800 text-sm">닫기</button>
        </div>`;
      annotationView = window.PCAnnotations.mount(box, m, annotationApi);
      $('#pv', box).onclick = () => move(-1); $('#nx', box).onclick = () => move(1);
      $('#fs', box).onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else box.requestFullscreen?.(); };
      $('#cl', box).onclick = () => close(); $('#ex', box).onclick = () => close(true);
    };
    const move = async delta => {
      if (navigating || i + delta < 0 || i + delta >= list.length) return;
      navigating = true;
      try { await annotationView?.flush(); box.querySelectorAll('video').forEach(v => v.pause()); i += delta; draw(); }
      catch (e) { toast(e.message, false); }
      finally { navigating = false; }
    };
    const key = e => { if (e.target.closest('.annotation-toolbar') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowRight') move(1); else if (e.key === 'ArrowLeft') move(-1); else if (e.key === 'Escape') close(); };
    const close = async (send = false) => {
      if (navigating) return; navigating = true;
      try { await annotationView?.flush(); box.querySelectorAll('video').forEach(v => v.pause()); document.removeEventListener('keydown', key); if (document.fullscreenElement) await document.exitFullscreen(); box.remove(); if (send) { state.today = list.map(m => m.id); saveToday(); state.tab = 'send'; render(); } }
      catch (e) { toast(e.message, false); }
      finally { navigating = false; }
    };
    document.addEventListener('keydown', key); draw();
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
          ${list.some(m => m.is_example) ? '<p class="example-editor-notice mb-3">검토용 예시가 포함되어 있습니다. 환자에게 보내기 전에 의료진이 내용을 확인·수정해 주세요. 안내장에도 예시 표시가 유지됩니다.</p>' : ''}
          ${list.length ? `<ol class="space-y-2">${list.map((m, i) => `<li class="bg-white border rounded-xl px-4 py-3 flex items-center gap-3"><span class="text-slate-400 w-5">${i + 1}</span><span class="px-1.5 py-0.5 rounded text-xs ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span><span class="font-semibold truncate">${esc(m.title)}</span></li>`).join('')}</ol>` : `<div class="bg-white border rounded-xl p-8 text-center text-slate-500 text-sm">보낼 자료가 없습니다. 자료함에서 담아 주세요.</div>`}
        </section>
        <section class="lg:col-span-2">
          <div class="bg-white border rounded-xl p-5 space-y-4 text-sm">
            <label class="block">환자 휴대전화<input id="s-phone" inputmode="numeric" placeholder="010-0000-0000" class="mt-1 w-full border rounded-lg px-3 py-2.5 text-lg tracking-wider" ${ready ? '' : 'disabled'}></label>
            <label class="block">내부 메모 <span class="text-slate-400">(환자에게 안 보임)</span><input id="s-label" maxlength="40" placeholder="예: 3시 임플란트 상담" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
            <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">카카오톡에 <b>[${esc(state.me.hospital.name)} 진료 안내]</b>로 도착하며, 마지막 줄에 "${esc(state.me.hospital.name)}의 요청으로 'Patient Connect'가 발송합니다"가 표시됩니다.<br>환자분께 번호 수집·발송 동의를 받으셨는지 확인하세요 (<a href="/legal-guide" target="_blank" class="underline">안내 문구</a>).</div>
            <label class="annotation-send-option"><input id="s-annotations" type="checkbox" >현재 설명의 필기 포함</label><p class="text-xs text-slate-500">이미지는 필기한 화면을, 영상은 원본과 필기한 장면 캡처를 함께 보냅니다. 이번 설명에서 저장한 필기만 포함합니다. 개인정보가 적혀 있지 않은지 미리보기에서 확인하세요.</p>
            <button id="s-send" class="w-full py-3 rounded-lg bg-yellow-400 text-slate-900 font-bold disabled:opacity-40" ${list.length && ready ? '' : 'disabled'}><i class="fa-solid fa-comment mr-1"></i>카카오톡 발송 전 확인</button>
            <button id="s-link" class="w-full py-2.5 rounded-lg border font-semibold disabled:opacity-40" ${list.length ? '' : 'disabled'}><i class="fa-solid fa-link mr-1"></i>안내장 미리보기 · 링크 만들기</button>
            <div id="s-result"></div>
          </div>
        </section>
      </div>`;
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
        if(includeAnnotations&&!state.scope)throw new Error('설명하기에서 이번 설명을 시작한 뒤 필기를 선택하세요.');
        if(includeAnnotations)await PCAnnotations.flush(ids);
        const payload={material_ids:ids,phone:$('#s-phone').value,label:$('#s-label').value,channel,include_annotations:includeAnnotations,annotation_scope:state.scope};
        const preview=await api('/dispatches/preview',{method:'POST',body:JSON.stringify(payload)});
        payload.preview_hash=preview.preview_hash;payload.request_key=crypto.randomUUID();payload.confirmed=true;
        const dialog=document.createElement('dialog');dialog.id='dispatch-preview';dialog.className='safety-dialog handout-preview';
        dialog.innerHTML=`<header><h2>환자에게 전달될 안내장</h2><p>${channel==='link'?'링크 직접 전달':'카카오 수신번호: '+esc(payload.phone)} · ${includeAnnotations?'현재 설명 필기 포함':'원본 자료만'}</p><p>아직 발행·발송되지 않았습니다. 자료·순서·비용·필기와 수신번호를 확인하세요.</p></header><div class="preview-content">${PCGuide.render(preview)}</div><footer><label><input id="preview-confirmed" type="checkbox">내용·수신 대상·전송 권한을 확인했고, 필기에 다른 환자의 개인정보가 없습니다.</label><p id="preview-error" role="status"></p><button id="preview-cancel">돌아가서 수정</button><button id="preview-send" class="primary-action">${channel==='link'?'확인 · 링크 만들기':'확인 · 카카오톡 발송'}</button></footer>`;
        document.body.append(dialog);dialog.showModal();let sending=false,ambiguous=false;
        dialog.addEventListener('cancel',e=>{if(sending||ambiguous)e.preventDefault()});
        dialog.addEventListener('close',()=>dialog.remove());
        $('#preview-cancel').onclick=()=>{if(!sending&&!ambiguous)dialog.close()};
        $('#preview-send').onclick=async()=>{
          if(sending)return;if(!$('#preview-confirmed').checked){$('#preview-error').textContent='최종 확인란을 체크해 주세요.';return}
          sending=true;$('#preview-send').disabled=true;$('#preview-cancel').disabled=true;
          try{
            const r=await api('/dispatches',{method:'POST',body:JSON.stringify(payload)});
            ambiguous=false;dialog.close();showResult(r);
            if(['sent','accepted','delivered'].includes(r.status)){$('#s-phone').value='';$('#s-label').value=''}
          }catch(e){
            ambiguous=!e.status||e.status>=500;
            $('#preview-error').textContent=e.message+(ambiguous?' 같은 요청으로 결과를 다시 확인하세요. 새 발송은 만들지 않습니다.':'');
            $('#preview-send').textContent=ambiguous?'같은 요청 결과 다시 확인':'확인 후 다시 시도';
          }finally{sending=false;if(dialog.isConnected){$('#preview-send').disabled=false;$('#preview-cancel').disabled=ambiguous}}
        };
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
    const label = { sent: '접수 (전달 미확인)', accepted:'접수 (전달 대기)', delivered:'전달 완료', unknown:'결과 확인 필요', link: '링크 생성', failed: '실패', created: '접수 확인 중', blocked: '차단' };
    main.innerHTML = `
      <div class="grid sm:grid-cols-4 gap-3 mb-5 text-sm">
        ${[['7일 발행·접수', st.d7.sent], ['7일 열람률', rate(st.d7)], ['30일 발행·접수', st.d30.sent], ['30일 열람률', rate(st.d30)]].map(([l, v]) => `<div class="bg-white border rounded-xl p-4"><div class="text-slate-500 text-xs">${l}</div><div class="text-2xl font-extrabold mt-1">${v}</div></div>`).join('')}
      </div>
      <div class="bg-white border rounded-xl overflow-hidden">
        <table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="text-left px-4 py-2">보낸 때</th><th class="text-left px-2 py-2">번호</th><th class="text-left px-2 py-2">자료</th><th class="text-left px-2 py-2">메모</th><th class="text-left px-2 py-2">상태</th><th class="text-left px-2 py-2">열람</th><th></th></tr></thead>
        <tbody>${state.dispatches.length ? state.dispatches.map((d) => `<tr class="border-t"><td class="px-4 py-2 whitespace-nowrap text-slate-600">${esc((d.sent_at || d.created_at).slice(0, 16))}</td><td class="px-2 py-2 whitespace-nowrap">${esc(d.phone)}</td><td class="px-2 py-2 max-w-xs truncate" title="${esc(d.titles.join(', '))}">${esc(d.titles.join(', '))}</td><td class="px-2 py-2 text-slate-500">${esc(d.label || '')}</td><td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-xs ${badge[d.status] || 'bg-slate-100'}" title="${esc(d.error || '')}">${label[d.status] || d.status}</span>${d.error?`<p class="text-xs text-rose-700">${esc(d.error)}</p>`:''}${['sent','accepted','created','unknown'].includes(d.status)?`<button data-status="${d.id}" class="contact-button">결과 확인</button>`:''}</td><td class="px-2 py-2 whitespace-nowrap">${d.first_opened_at ? `<span class="text-emerald-700">열람 ${d.open_count}회</span>` : '<span class="text-slate-400">아직</span>'}</td><td class="px-2 py-2"><button data-copy="${esc(d.url)}" class="text-slate-400 hover:text-slate-800" title="링크 복사"><i class="fa-solid fa-link"></i></button></td></tr>`).join('') : `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">아직 보낸 안내장이 없습니다</td></tr>`}</tbody></table>
      </div>
      <p class="text-xs text-slate-400 mt-3">통신 결과가 불확실한 요청은 자동 재발송하지 않습니다. 실패 시 링크를 복사해 전달하거나 SOLAPI 콘솔에서 먼저 확인하세요.<br>번호 원문은 발송 후 7일 내 파기되며 마지막 4자리만 남습니다. 링크는 ${state.me.hospital.link_days}일 뒤 만료됩니다.</p>`;
    main.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('/dispatches/'+b.dataset.status+'/status',{method:'POST'});await loadHistory();render();if(r.error)toast(r.error,false)}catch(e){toast(e.message,false)}finally{b.disabled=false}});
    main.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('링크를 복사했습니다'); });
  }

  // ─── 설정 ───
  function renderSettings(main) {
    const h = state.me.hospital;
    main.innerHTML = `<div class="max-w-xl bg-white border rounded-xl p-5 space-y-4 text-sm">
      <h2 class="text-lg font-bold">설정</h2>
      <div><div class="text-slate-500 text-xs">병원명 (Patient Hub 정본 · 발송 메시지의 #{병원명})</div><div class="font-semibold mt-1">${esc(h.name)}</div></div>
      <label class="block">안내장에 표시할 병원 전화<input id="st-phone" value="${esc(h.phone || '')}" placeholder="041-000-0000" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">주소 (선택)<input id="st-addr" value="${esc(h.address || '')}" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">병원 카카오 상담 주소<input id="st-chat" type="url" value="${esc(h.chat_url||'')}" placeholder="https://pf.kakao.com/..." class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">예약 페이지 주소<input id="st-booking" type="url" value="${esc(h.booking_url||'')}" placeholder="https://..." class="mt-1 w-full border rounded-lg px-3 py-2"></label>
      <label class="block">안내장 링크 유효기간(일)<input id="st-days" type="number" min="7" max="180" value="${h.link_days}" class="mt-1 w-32 border rounded-lg px-3 py-2"></label>
      <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">카카오 알림톡 상태: ${state.me.alimtalk_ready ? '<span class="text-emerald-700 font-semibold">사용 가능</span>' : '<span class="text-amber-700 font-semibold">설정 미완료</span>'} · 발송 채널은 페이션트퍼널의 'Patient Connect' 공용 채널이며 병원이 따로 개설할 것은 없습니다.</div>
      <div class="flex gap-2"><button id="st-save" class="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold">저장</button><button id="st-logout" class="ml-auto px-3 py-2 text-slate-500">로그아웃</button></div>
      <p class="text-xs text-slate-400"><a href="/legal-guide" target="_blank" class="underline">병원용 안내 문구</a> · <a href="/privacy" target="_blank" class="underline">개인정보처리방침</a></p>
    </div>`;
    $('#st-save').onclick = async () => { try { await api('/settings', { method: 'PUT', body: JSON.stringify({ phone: $('#st-phone').value, address: $('#st-addr').value, link_days: $('#st-days').value, chat_url: $('#st-chat').value, booking_url: $('#st-booking').value }) }); await loadMe(); toast('저장했습니다'); render(); } catch (e) { toast(e.message, false); } };
    $('#st-logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; };
  }

  async function loadSets(){state.sets=(await api('/material-sets')).sets}
  async function loadMe() { state.me = await api('/me'); }
  async function loadLibrary() { state.library = await api('/material-library'); }
  async function loadMaterials() { state.materials = (await api('/materials')).materials; state.today = state.today.filter((id) => state.materials.some((m) => m.id === id)); }
  (async () => {
    try { await loadMe(); try{state.today=JSON.parse(sessionStorage.getItem('pc_today_'+state.me.hospital.id)||'[]');state.scope=sessionStorage.getItem('pc_scope_'+state.me.hospital.id)||''}catch{state.today=[]} await Promise.all([loadMaterials(), loadLibrary(), loadSets()]); await loadHistory(); render(); }
    catch (e) { if (e.message !== 'auth') app.innerHTML = `<div class="p-10 text-center text-rose-600">${esc(e.message)}</div>`; }
  })();
})();
