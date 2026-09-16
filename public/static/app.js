/* Patient Connect 병원 콘솔 — 자료함 · 설명하기 · 보내기 · 발송내역 · 설정 (의존성 없음) */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { explain: '설명', before_after: '비포애프터', cost: '비용 안내', notice: '주의사항' };
  const KIND_COLOR = { explain: 'bg-sky-100 text-sky-800', before_after: 'bg-violet-100 text-violet-800', cost: 'bg-amber-100 text-amber-800', notice: 'bg-rose-100 text-rose-800' };
  const won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';
  const state = { me: null, materials: [], today: [], tab: 'library', dispatches: [], stats: null, filter: '', editing: null, present: null };
  const app = $('#app');

  async function api(path, opt) {
    const r = await fetch('/api' + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opt || {}));
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.auth_required) { location.href = '/api/auth/hub'; throw new Error('auth'); }
    if (!r.ok) throw new Error(j.error || ('오류 ' + r.status));
    return j;
  }
  function bodyHtml(text) {
    return String(text || '').split('\n').map((l) => l.startsWith('- ') ? `<div class="li">${esc(l.slice(2))}</div>` : `<div>${l.trim() ? esc(l) : '&nbsp;'}</div>`).join('');
  }
  function imgUrl(key, token) { return '/a/' + key + (token ? '?t=' + token : ''); }
  function toast(msg, ok) {
    const t = document.createElement('div');
    t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm z-[70] fade-in ' + (ok === false ? 'bg-rose-600' : 'bg-slate-900');
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }
  try { state.today = JSON.parse(sessionStorage.getItem('pc_today') || '[]'); } catch { state.today = []; }
  function saveToday() { sessionStorage.setItem('pc_today', JSON.stringify(state.today)); }

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
      main.insertAdjacentHTML('afterbegin', `<div class="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">카카오 알림톡 채널 준비 중입니다(템플릿 심사). 그동안은 <b>링크 직접 전달</b>로 안내장을 보낼 수 있습니다.</div>`);
    }
  }

  // ─── 자료함 ───
  function materialCard(m, extra) {
    const img = m.images[0] ? `<img src="${imgUrl(m.images[0].key)}" class="w-full h-32 object-cover rounded-t-xl bg-slate-100" loading="lazy">` : `<div class="w-full h-16 rounded-t-xl bg-slate-100 flex items-center justify-center text-slate-300 text-2xl"><i class="fa-regular fa-file-lines"></i></div>`;
    return `<div class="bg-white rounded-xl border shadow-sm flex flex-col fade-in">
      ${img}
      <div class="p-3 flex-1">
        <div class="flex items-center gap-2 text-xs"><span class="px-1.5 py-0.5 rounded ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span>${m.category ? `<span class="text-slate-500">${esc(m.category)}</span>` : ''}</div>
        <div class="font-bold mt-1.5 leading-snug">${esc(m.title)}</div>
        <div class="text-xs text-slate-500 mt-1 line-clamp-2">${esc((m.body || '').replace(/\n/g, ' '))}${m.kind === 'cost' && m.cost.length ? ' · 항목 ' + m.cost.length + '개' : ''}</div>
      </div>
      <div class="px-3 pb-3 flex gap-2 text-sm">${extra}</div>
    </div>`;
  }
  function renderLibrary(main) {
    const q = state.filter.trim();
    const list = state.materials.filter((m) => !q || (m.title + ' ' + (m.category || '') + ' ' + (m.body || '')).includes(q));
    const cats = [...new Set(state.materials.map((m) => m.category).filter(Boolean))];
    main.innerHTML = `
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <h2 class="text-lg font-bold">자료함 <span class="text-sm font-normal text-slate-500">${state.materials.length}개</span></h2>
        <input id="q" value="${esc(state.filter)}" placeholder="제목·분류·내용 검색" class="border rounded-lg px-3 py-2 text-sm w-56">
        <div class="flex gap-1 text-xs">${cats.map((c) => `<button data-cat="${esc(c)}" class="px-2 py-1 rounded-full border ${state.filter === c ? 'bg-slate-900 text-white' : 'bg-white'}">${esc(c)}</button>`).join('')}</div>
        <button id="new" class="ml-auto px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"><i class="fa-solid fa-plus mr-1"></i>자료 등록</button>
      </div>
      ${list.length ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${list.map((m) => materialCard(m, `
          <button data-add="${m.id}" class="flex-1 px-2 py-1.5 rounded-lg ${state.today.includes(m.id) ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 hover:bg-slate-200'}">${state.today.includes(m.id) ? '<i class="fa-solid fa-check mr-1"></i>오늘 설명에 담김' : '<i class="fa-solid fa-plus mr-1"></i>오늘 설명에 담기'}</button>
          <button data-edit="${m.id}" class="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200"><i class="fa-solid fa-pen"></i></button>`)).join('')}</div>`
        : `<div class="bg-white rounded-xl border p-10 text-center text-slate-500">
            <div class="text-3xl mb-2">🗂️</div>
            <p class="font-semibold text-slate-700">아직 등록한 자료가 없습니다</p>
            <p class="text-sm mt-1">임플란트 설명, 교정 전후 사진, 비용표, 발치 후 주의사항처럼 매번 말로 반복하는 설명부터 등록해 보세요.</p>
            <button id="new2" class="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold">첫 자료 등록</button>
          </div>`}`;
    $('#q').oninput = (e) => { state.filter = e.target.value; renderLibrary(main); $('#q').focus(); $('#q').setSelectionRange(state.filter.length, state.filter.length); };
    main.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { state.filter = state.filter === b.dataset.cat ? '' : b.dataset.cat; renderLibrary(main); });
    const nb = $('#new') || $('#new2'); if (nb) nb.onclick = () => openEditor(null);
    const nb2 = $('#new2'); if (nb2) nb2.onclick = () => openEditor(null);
    main.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { const id = Number(b.dataset.add); state.today = state.today.includes(id) ? state.today.filter((x) => x !== id) : [...state.today, id]; saveToday(); render(); });
    main.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditor(state.materials.find((m) => m.id === Number(b.dataset.edit))));
  }

  // ─── 자료 편집 모달 ───
  function openEditor(m) {
    state.editing = m ? JSON.parse(JSON.stringify(m)) : { kind: 'explain', category: '', title: '', body: '', images: [], cost: [] };
    renderEditor();
  }
  function renderEditor() {
    const m = state.editing; if (!m) return;
    let box = $('#editor');
    if (!box) { box = document.createElement('div'); box.id = 'editor'; document.body.appendChild(box); }
    const costRows = (m.cost.length ? m.cost : []).map((c, i) => `<tr><td><input data-c="name" data-i="${i}" value="${esc(c.name)}" placeholder="항목" class="w-full border rounded px-2 py-1"></td><td><input data-c="price" data-i="${i}" type="number" value="${c.price}" class="w-28 border rounded px-2 py-1 text-right"></td><td><input data-c="qty" data-i="${i}" type="number" value="${c.qty || 1}" class="w-16 border rounded px-2 py-1 text-right"></td><td><input data-c="note" data-i="${i}" value="${esc(c.note || '')}" placeholder="비고" class="w-full border rounded px-2 py-1"></td><td><button data-cdel="${i}" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-xmark"></i></button></td></tr>`).join('');
    const total = m.cost.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.qty) || 1), 0);
    const imgLimit = m.kind === 'before_after' ? 2 : 6;
    box.innerHTML = `<div class="fixed inset-0 bg-black/40 z-40 flex items-start justify-center overflow-auto p-4">
      <div class="bg-white rounded-2xl w-full max-w-2xl my-6 fade-in">
        <div class="px-5 py-4 border-b flex items-center"><h3 class="font-bold">${m.id ? '자료 수정' : '자료 등록'}</h3><button id="ed-close" class="ml-auto text-slate-400 hover:text-slate-800 text-xl">&times;</button></div>
        <div class="p-5 space-y-4 text-sm">
          <div class="flex gap-2">${Object.entries(KIND).map(([k, l]) => `<button data-kind="${k}" class="px-3 py-1.5 rounded-full border ${m.kind === k ? 'bg-slate-900 text-white' : ''}">${l}</button>`).join('')}</div>
          <div class="grid grid-cols-3 gap-3">
            <label class="col-span-2">제목<input id="ed-title" value="${esc(m.title)}" maxlength="80" placeholder="예: 임플란트 치료 과정" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
            <label>진료 분류<input id="ed-cat" value="${esc(m.category || '')}" maxlength="30" placeholder="예: 임플란트" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
          </div>
          <label class="block">${m.kind === 'cost' ? '설명(선택)' : '설명 본문'}<span class="text-slate-400 ml-2">줄 앞에 "- "를 붙이면 항목으로 표시됩니다</span>
            <textarea id="ed-body" rows="7" class="mt-1 w-full border rounded-lg px-3 py-2 leading-relaxed" placeholder="${m.kind === 'notice' ? '- 2시간 동안 거즈를 물고 계세요\n- 오늘은 뜨거운 음식·음주·흡연을 피하세요' : '환자분께 말로 설명하던 내용을 그대로 적어 주세요'}">${esc(m.body || '')}</textarea></label>
          ${m.kind === 'cost' ? `<div><div class="font-semibold mb-1">비용표</div><table class="w-full text-sm"><thead class="text-slate-500 text-xs"><tr><th class="text-left">항목</th><th class="text-right">단가</th><th class="text-right">수량</th><th class="text-left">비고</th><th></th></tr></thead><tbody>${costRows}</tbody></table>
            <div class="flex items-center mt-2"><button id="ed-cadd" class="text-sky-700 text-sm"><i class="fa-solid fa-plus mr-1"></i>항목 추가</button><div class="ml-auto font-bold">합계 ${won(total)}</div></div>
            <p class="text-xs text-slate-400 mt-1">환자용 안내장에는 "안내 시점 기준 금액이며 진단에 따라 달라질 수 있습니다"가 자동으로 붙습니다.</p></div>` : ''}
          <div>
            <div class="font-semibold mb-1">${m.kind === 'before_after' ? '비포 · 애프터 사진 (첫 장 = 치료 전, 둘째 장 = 치료 후)' : '이미지'} <span class="text-slate-400 font-normal">${m.images.length}/${imgLimit} · JPG·PNG·WebP 5MB 이하</span></div>
            ${m.id ? `<div class="flex flex-wrap gap-2">${m.images.map((im, i) => `<div class="relative"><img src="${imgUrl(im.key)}" class="h-24 w-32 object-cover rounded-lg border">${m.kind === 'before_after' ? `<span class="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">${i === 0 ? '치료 전' : '치료 후'}</span>` : ''}<button data-imgdel="${im.key}" class="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-xs text-rose-600">&times;</button></div>`).join('')}
              ${m.images.length < imgLimit ? `<label class="h-24 w-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:border-sky-400"><i class="fa-solid fa-image"></i><span class="text-xs mt-1">올리기</span><input type="file" id="ed-file" accept="image/jpeg,image/png,image/webp" class="hidden"></label>` : ''}</div>`
              : `<p class="text-xs text-slate-400">제목을 먼저 저장하면 이미지를 올릴 수 있습니다.</p>`}
          </div>
        </div>
        <div class="px-5 py-4 border-t flex gap-2">
          ${m.id ? `<button id="ed-del" class="text-rose-600 text-sm">삭제</button>` : ''}
          <button id="ed-save" class="ml-auto px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold text-sm">${m.id ? '저장' : '등록'}</button>
        </div>
      </div></div>`;
    const sync = () => { m.title = $('#ed-title').value; m.category = $('#ed-cat').value; m.body = $('#ed-body').value; };
    $('#ed-close').onclick = () => { box.remove(); state.editing = null; };
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
        m.images = j.images; await loadMaterials(); renderEditor();
      } catch (e) { toast(e.message, false); }
    };
    box.querySelectorAll('[data-imgdel]').forEach((b) => b.onclick = async () => { const j = await api('/materials/' + m.id + '/images?key=' + encodeURIComponent(b.dataset.imgdel), { method: 'DELETE' }); m.images = j.images; await loadMaterials(); renderEditor(); });
  }

  // ─── 설명하기 ───
  function todayList() { return state.today.map((id) => state.materials.find((m) => m.id === id)).filter(Boolean); }
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
      return `<div class="ba">${[['치료 전', b], ['치료 후', a]].map(([l, im]) => `<figure>${im ? `<img src="${imgUrl(im.key, token)}" class="w-full">` : '<div class="h-48 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">사진 없음</div>'}<figcaption>${l}</figcaption></figure>`).join('')}</div>${m.body ? `<div class="text mt-6">${bodyHtml(m.body)}</div>` : ''}`;
    }
    if (m.kind === 'cost') {
      const total = m.cost.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.qty) || 1), 0);
      return `${m.body ? `<div class="text mb-6">${bodyHtml(m.body)}</div>` : ''}<table class="w-full max-w-2xl"><tbody>${m.cost.map((c) => `<tr class="border-b border-slate-700"><td class="py-3">${esc(c.name)}${c.note ? `<div class="text-sm text-slate-400">${esc(c.note)}</div>` : ''}</td><td class="py-3 text-right text-slate-400">${(c.qty || 1) > 1 ? `${won(c.price)} × ${c.qty}` : ''}</td><td class="py-3 text-right font-bold">${won((Number(c.price) || 0) * (Number(c.qty) || 1))}</td></tr>`).join('')}<tr><td class="py-4 font-extrabold" colspan="2">합계</td><td class="py-4 text-right font-extrabold text-sky-300">${won(total)}</td></tr></tbody></table><p class="text-sm text-slate-400 mt-4">안내 시점 기준 금액이며 진단에 따라 달라질 수 있습니다.</p>`;
    }
    const imgs = m.images.map((im) => `<figure><img src="${imgUrl(im.key, token)}" class="w-full">${im.caption ? `<figcaption class="text-center text-slate-400 mt-2">${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    return `<div class="grid ${m.images.length ? 'lg:grid-cols-2' : ''} gap-8 items-start">${m.body ? `<div class="text">${bodyHtml(m.body)}</div>` : ''}${imgs ? `<div class="space-y-4">${imgs}</div>` : ''}</div>`;
  }
  function startPresent(list) {
    let i = 0;
    const box = document.createElement('div'); box.className = 'present'; document.body.appendChild(box);
    const draw = () => {
      const m = list[i];
      box.innerHTML = `<div class="stage fade-in"><div class="text-sky-300 text-sm font-semibold mb-2">${KIND[m.kind]}${m.category ? ' · ' + esc(m.category) : ''}</div><h1>${esc(m.title)}</h1><div class="mt-6">${slideHtml(m)}</div></div>
        <div class="flex items-center gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button id="pv" class="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> 이전</button>
          <span class="text-slate-400 text-sm">${i + 1} / ${list.length}</span>
          <button id="nx" class="px-4 py-2 rounded-lg bg-slate-800 disabled:opacity-30" ${i === list.length - 1 ? 'disabled' : ''}>다음 <i class="fa-solid fa-chevron-right"></i></button>
          <button id="fs" class="ml-auto px-3 py-2 rounded-lg bg-slate-800 text-sm"><i class="fa-solid fa-expand"></i></button>
          <button id="ex" class="px-4 py-2 rounded-lg bg-sky-600 text-sm font-semibold">설명 끝 · 보내기</button>
          <button id="cl" class="px-3 py-2 rounded-lg bg-slate-800 text-sm">닫기</button>
        </div>`;
      $('#pv', box).onclick = () => { i--; draw(); }; $('#nx', box).onclick = () => { i++; draw(); };
      $('#fs', box).onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else box.requestFullscreen?.(); };
      $('#cl', box).onclick = close; $('#ex', box).onclick = () => { close(); state.tab = 'send'; render(); };
    };
    const key = (e) => { if (e.key === 'ArrowRight' && i < list.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } else if (e.key === 'Escape') close(); };
    const close = () => { document.removeEventListener('keydown', key); if (document.fullscreenElement) document.exitFullscreen(); box.remove(); };
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
          ${list.length ? `<ol class="space-y-2">${list.map((m, i) => `<li class="bg-white border rounded-xl px-4 py-3 flex items-center gap-3"><span class="text-slate-400 w-5">${i + 1}</span><span class="px-1.5 py-0.5 rounded text-xs ${KIND_COLOR[m.kind]}">${KIND[m.kind]}</span><span class="font-semibold truncate">${esc(m.title)}</span></li>`).join('')}</ol>` : `<div class="bg-white border rounded-xl p-8 text-center text-slate-500 text-sm">보낼 자료가 없습니다. 자료함에서 담아 주세요.</div>`}
        </section>
        <section class="lg:col-span-2">
          <div class="bg-white border rounded-xl p-5 space-y-4 text-sm">
            <label class="block">환자 휴대전화<input id="s-phone" inputmode="numeric" placeholder="010-0000-0000" class="mt-1 w-full border rounded-lg px-3 py-2.5 text-lg tracking-wider" ${ready ? '' : 'disabled'}></label>
            <label class="block">내부 메모 <span class="text-slate-400">(환자에게 안 보임)</span><input id="s-label" maxlength="40" placeholder="예: 3시 임플란트 상담" class="mt-1 w-full border rounded-lg px-3 py-2"></label>
            <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">카카오톡에 <b>[${esc(state.me.hospital.name)} 진료 안내]</b>로 도착하며, 마지막 줄에 "${esc(state.me.hospital.name)}의 요청으로 'Patient Connect'가 발송합니다"가 표시됩니다.<br>환자분께 번호 수집·발송 동의를 받으셨는지 확인하세요 (<a href="/legal-guide" target="_blank" class="underline">안내 문구</a>).</div>
            <button id="s-send" class="w-full py-3 rounded-lg bg-yellow-400 text-slate-900 font-bold disabled:opacity-40" ${list.length && ready ? '' : 'disabled'}><i class="fa-solid fa-comment mr-1"></i>카카오톡으로 보내기</button>
            <button id="s-link" class="w-full py-2.5 rounded-lg border font-semibold disabled:opacity-40" ${list.length ? '' : 'disabled'}><i class="fa-solid fa-link mr-1"></i>링크만 만들기 (직접 전달)</button>
            <div id="s-result"></div>
          </div>
        </section>
      </div>`;
    const ids = list.map((m) => m.id);
    const showResult = (r) => {
      const ok = r.status === 'sent';
      $('#s-result').innerHTML = `<div class="rounded-lg p-3 text-sm ${ok ? 'bg-emerald-50 text-emerald-800' : r.status === 'link' ? 'bg-sky-50 text-sky-800' : 'bg-rose-50 text-rose-800'}">
        ${ok ? '카카오톡으로 보냈습니다.' : r.status === 'link' ? '안내장 링크를 만들었습니다. 복사해서 전달하세요.' : '발송 실패: ' + esc(r.error || '') + '<br>아래 링크를 직접 전달할 수 있습니다.'}
        <div class="mt-2 flex gap-2"><input readonly value="${esc(r.url)}" class="flex-1 border rounded px-2 py-1 bg-white text-xs"><button id="cp" class="px-2 py-1 rounded bg-slate-900 text-white text-xs">복사</button></div></div>`;
      $('#cp').onclick = () => { navigator.clipboard?.writeText(r.url); toast('링크를 복사했습니다'); };
      loadHistory();
    };
    const send = async (channel) => {
      const btn = channel === 'link' ? $('#s-link') : $('#s-send'); btn.disabled = true;
      try {
        const r = await api('/dispatches', { method: 'POST', body: JSON.stringify({ material_ids: ids, phone: $('#s-phone').value, label: $('#s-label').value, channel }) });
        showResult(r);
        if (r.status === 'sent') { $('#s-phone').value = ''; $('#s-label').value = ''; }
      } catch (e) { toast(e.message, false); }
      btn.disabled = false;
    };
    $('#s-send').onclick = () => send('alimtalk'); $('#s-link').onclick = () => send('link');
  }

  // ─── 발송내역 ───
  async function loadHistory() { try { const [d, s] = await Promise.all([api('/dispatches?limit=100'), api('/stats')]); state.dispatches = d.dispatches; state.stats = s; } catch {} }
  function renderHistory(main) {
    const st = state.stats || { d7: { sent: 0, opened: 0 }, d30: { sent: 0, opened: 0 } };
    const rate = (x) => x.sent ? Math.round(x.opened / x.sent * 100) + '%' : '-';
    const badge = { sent: 'bg-emerald-100 text-emerald-800', link: 'bg-sky-100 text-sky-800', failed: 'bg-rose-100 text-rose-800', created: 'bg-slate-100', blocked: 'bg-slate-100' };
    const label = { sent: '카톡 발송', link: '링크 전달', failed: '실패', created: '대기', blocked: '차단' };
    main.innerHTML = `
      <div class="grid sm:grid-cols-4 gap-3 mb-5 text-sm">
        ${[['7일 발송', st.d7.sent], ['7일 열람률', rate(st.d7)], ['30일 발송', st.d30.sent], ['30일 열람률', rate(st.d30)]].map(([l, v]) => `<div class="bg-white border rounded-xl p-4"><div class="text-slate-500 text-xs">${l}</div><div class="text-2xl font-extrabold mt-1">${v}</div></div>`).join('')}
      </div>
      <div class="bg-white border rounded-xl overflow-hidden">
        <table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="text-left px-4 py-2">보낸 때</th><th class="text-left px-2 py-2">번호</th><th class="text-left px-2 py-2">자료</th><th class="text-left px-2 py-2">메모</th><th class="text-left px-2 py-2">상태</th><th class="text-left px-2 py-2">열람</th><th></th></tr></thead>
        <tbody>${state.dispatches.length ? state.dispatches.map((d) => `<tr class="border-t"><td class="px-4 py-2 whitespace-nowrap text-slate-600">${esc((d.sent_at || d.created_at).slice(0, 16))}</td><td class="px-2 py-2 whitespace-nowrap">${esc(d.phone)}</td><td class="px-2 py-2 max-w-xs truncate" title="${esc(d.titles.join(', '))}">${esc(d.titles.join(', '))}</td><td class="px-2 py-2 text-slate-500">${esc(d.label || '')}</td><td class="px-2 py-2"><span class="px-1.5 py-0.5 rounded text-xs ${badge[d.status] || 'bg-slate-100'}" title="${esc(d.error || '')}">${label[d.status] || d.status}</span></td><td class="px-2 py-2 whitespace-nowrap">${d.first_opened_at ? `<span class="text-emerald-700">열람 ${d.open_count}회</span>` : '<span class="text-slate-400">아직</span>'}</td><td class="px-2 py-2"><button data-copy="${esc(d.url)}" class="text-slate-400 hover:text-slate-800" title="링크 복사"><i class="fa-solid fa-link"></i></button></td></tr>`).join('') : `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">아직 보낸 안내장이 없습니다</td></tr>`}</tbody></table>
      </div>
      <p class="text-xs text-slate-400 mt-3">번호 원문은 발송 후 7일 내 파기되며 마지막 4자리만 남습니다. 링크는 ${state.me.hospital.link_days}일 뒤 만료됩니다.</p>`;
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
      <label class="block">안내장 링크 유효기간(일)<input id="st-days" type="number" min="7" max="180" value="${h.link_days}" class="mt-1 w-32 border rounded-lg px-3 py-2"></label>
      <div class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">카카오 알림톡 상태: ${state.me.alimtalk_ready ? '<span class="text-emerald-700 font-semibold">사용 가능</span>' : '<span class="text-amber-700 font-semibold">준비 중 (템플릿 심사)</span>'} · 발송 채널은 페이션트퍼널의 'Patient Connect' 공용 채널이며 병원이 따로 개설할 것은 없습니다.</div>
      <div class="flex gap-2"><button id="st-save" class="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold">저장</button><button id="st-logout" class="ml-auto px-3 py-2 text-slate-500">로그아웃</button></div>
      <p class="text-xs text-slate-400"><a href="/legal-guide" target="_blank" class="underline">병원용 안내 문구</a> · <a href="/privacy" target="_blank" class="underline">개인정보처리방침</a></p>
    </div>`;
    $('#st-save').onclick = async () => { try { await api('/settings', { method: 'PUT', body: JSON.stringify({ phone: $('#st-phone').value, address: $('#st-addr').value, link_days: $('#st-days').value }) }); await loadMe(); toast('저장했습니다'); render(); } catch (e) { toast(e.message, false); } };
    $('#st-logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; };
  }

  async function loadMe() { state.me = await api('/me'); }
  async function loadMaterials() { state.materials = (await api('/materials')).materials; state.today = state.today.filter((id) => state.materials.some((m) => m.id === id)); }
  (async () => {
    try { await loadMe(); await loadMaterials(); await loadHistory(); render(); }
    catch (e) { if (e.message !== 'auth') app.innerHTML = `<div class="p-10 text-center text-rose-600">${esc(e.message)}</div>`; }
  })();
})();
