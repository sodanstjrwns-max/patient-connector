/* 공개 설명자료 라이브러리 / — 로그인 없이 보는 플랫폼 영상·요약 이미지. 전송·QR·병원 자료 없음. 【2026-09-25】 */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  const A = 'https://patient-connect.pages.dev/a/'; // 국내 트래픽이 LAX로 붙는 patientfunnel.kr 존을 피해 ICN으로 붙는 원본에서 미디어를 받는다
  const CATS = ['임플란트', '보철·틀니', '충치·신경치료', '잇몸치료', '치아교정', '사랑니·발치', '소아치과', '심미치료', '턱관절', '구강점막', '예방·구강관리', '진료 전·후 안내'];
  const state = { topics: [], cat: '', q: '', open: null, speed: 1 };
  const mmss = (s) => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';
  const bodyHtml = (t) => String(t || '').split('\n').map((l) => l.startsWith('- ') ? `<div class="li">${esc(l.slice(2))}</div>` : l.trim() ? `<p>${esc(l)}</p>` : '').join('');
  try { state.speed = [1, 1.5, 2, 3].includes(parseFloat(localStorage.getItem('pc_speed'))) ? parseFloat(localStorage.getItem('pc_speed')) : 1; } catch {}

  // 영상 자료(drive:ID)와 요약 이미지(drive:ID:img)를 주제 하나로 묶는다 — 영상 다음에 요약 이미지가 오는 흐름 유지
  function group(items) {
    const map = new Map();
    for (const it of items) {
      const t = map.get(it.topic_id) || { id: it.topic_id, title: it.title.replace(/\s*·\s*요약 이미지$/, ''), category: it.category || '기타', body: it.body, video: null, images: [] };
      for (const m of it.media) { if (m.media_type === 'video') t.video = m; else t.images.push(m); }
      if (!t.body && it.body) t.body = it.body;
      map.set(it.topic_id, t);
    }
    return [...map.values()];
  }
  const catOrder = (c) => { const i = CATS.indexOf(c); return i < 0 ? 99 : i; };
  const visible = () => state.topics.filter((t) => (!state.cat || t.category === state.cat) && (!state.q || (t.title + ' ' + t.category + ' ' + t.body).toLocaleLowerCase().includes(state.q)));

  function render() {
    const list = visible();
    const cats = [...new Set(state.topics.map((t) => t.category))].sort((a, b) => catOrder(a) - catOrder(b));
    const groups = state.cat || state.q ? [{ name: state.cat || '검색 결과', items: list }] : cats.map((name) => ({ name, items: list.filter((t) => t.category === name) })).filter((g) => g.items.length);
    app.innerHTML = `
      <header class="cat-top"><a href="/" class="cat-brand"><span>📨</span> Patient Connect</a><nav><a href="/about">서비스 소개</a><a href="/app" class="cat-login">병원 로그인</a></nav></header>
      <section class="cat-hero">
        <p class="cat-eyebrow">환자 설명자료 라이브러리</p>
        <h1>치과 치료, 영상으로 쉽게 이해하세요</h1>
        <p class="cat-sub">진료실에서 의료진이 보여드리는 설명 영상 ${state.topics.length}편과 요약 이미지입니다. 로그인 없이 누구나 볼 수 있습니다.</p>
        <label class="cat-search"><i class="fa-solid fa-magnifying-glass"></i><input id="q" type="search" placeholder="치료 이름으로 찾기 (예: 임플란트, 신경치료)" value="${esc(state.q)}" aria-label="검색"></label>
        <div class="cat-chips" role="group" aria-label="진료 분류"><button data-cat="" aria-pressed="${!state.cat}">전체 <small>${state.topics.length}</small></button>${cats.map((c) => `<button data-cat="${esc(c)}" aria-pressed="${state.cat === c}">${esc(c)} <small>${state.topics.filter((t) => t.category === c).length}</small></button>`).join('')}</div>
      </section>
      <main class="cat-main">
        ${list.length ? groups.map((g) => `<section class="cat-group"><h2>${esc(g.name)} <span>${g.items.length}</span></h2><div class="cat-grid">${g.items.map(card).join('')}</div></section>`).join('') : '<p class="cat-empty">찾는 자료가 없습니다. 다른 이름으로 검색해 보세요.</p>'}
      </main>
      <footer class="cat-foot">
        <p>이 페이지의 영상·이미지는 페이션트퍼널이 제작한 일반 진료 설명 자료입니다. 특정 병원이나 환자의 정보는 포함하지 않으며, 진단과 치료 계획은 담당 의료진과 상의해 주세요.</p>
        <p>병원에서 설명한 자료를 환자분 카카오톡으로 보내는 기능은 병원 계정(<a href="/app">로그인</a>)에서만 제공됩니다.</p>
        <p>페이션트퍼널 · 대표 문석준 · patientsfunnel@gmail.com · 010-4445-1873 · <a href="/privacy">개인정보처리방침</a> · <a href="/terms">이용약관</a></p>
      </footer>`;
    $('#q').oninput = (e) => { state.q = e.target.value.trim().toLocaleLowerCase(); renderKeepFocus(); };
    app.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { state.cat = b.dataset.cat; state.q = ''; render(); window.scrollTo({ top: $('.cat-main').offsetTop - 12, behavior: 'smooth' }); });
    app.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openTopic(b.dataset.open));
  }
  function renderKeepFocus() { const pos = $('#q').selectionStart; render(); const q = $('#q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch {} }
  const poster = (t) => t.video?.poster_key ? `${A}${t.video.poster_key}` : t.images[0] ? `${A}${t.images[0].key}` : '';
  function card(t) {
    return `<button class="cat-card" data-open="${esc(t.id)}"><span class="cat-cover">${poster(t) ? `<img src="${esc(poster(t))}" alt="" loading="lazy">` : '<i class="fa-regular fa-image"></i>'}${t.video ? `<span class="cat-badge"><i class="fa-solid fa-play"></i> ${mmss(t.video.duration_seconds) || '영상'}</span>` : ''}</span><span class="cat-card-body"><small>${esc(t.category)}${t.images.length ? ' · 요약 이미지' : ''}</small><b>${esc(t.title)}</b></span></button>`;
  }

  // ─── 보기 화면 ───
  function openTopic(id) {
    const list = visible(); const i = list.findIndex((t) => t.id === id); if (i < 0) return;
    state.open = id; history.replaceState(null, '', '#' + encodeURIComponent(id));
    let box = $('.cat-viewer'); if (!box) { box = document.createElement('div'); box.className = 'cat-viewer'; document.body.appendChild(box); document.body.style.overflow = 'hidden'; }
    const t = list[i];
    box.innerHTML = `<header><button class="cat-close" aria-label="닫기"><i class="fa-solid fa-xmark"></i> 닫기</button><span class="cat-viewer-cat">${esc(t.category)}</span><span class="cat-viewer-nav"><button class="cat-prev" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> 이전</button><span>${i + 1} / ${list.length}</span><button class="cat-next" ${i === list.length - 1 ? 'disabled' : ''}>다음 <i class="fa-solid fa-chevron-right"></i></button></span></header>
      <div class="cat-stage"><h1>${esc(t.title)}</h1>
        ${t.video ? `<div class="pc-video"><video src="${A}${esc(t.video.key)}" ${t.video.poster_key ? `poster="${A}${esc(t.video.poster_key)}"` : ''} controls playsinline preload="metadata" aria-label="${esc(t.title)} 설명 영상"></video><div class="pc-speed" role="group" aria-label="재생 속도">${[1, 1.5, 2, 3].map((v) => `<button type="button" data-speed="${v}" aria-pressed="${state.speed === v}">${v}×</button>`).join('')}</div></div>` : ''}
        ${t.images.map((im) => `<figure class="cat-summary"><img src="${A}${esc(im.key)}" alt="${esc(im.caption || '요약 이미지')}" loading="lazy"><figcaption>${esc(im.caption || '요약 이미지')}</figcaption></figure>`).join('')}
        ${t.body ? `<div class="cat-body pc-body">${bodyHtml(t.body)}</div>` : ''}
        <p class="cat-note">일반 진료 설명 자료입니다. 개인의 상태에 따라 치료 방법과 결과는 달라질 수 있으니 담당 의료진과 상의해 주세요.</p>
      </div>`;
    const video = box.querySelector('video');
    if (video) { video.playbackRate = state.speed; video.addEventListener('loadedmetadata', () => { video.playbackRate = state.speed; }); box.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { state.speed = parseFloat(b.dataset.speed); try { localStorage.setItem('pc_speed', String(state.speed)); } catch {} video.playbackRate = state.speed; box.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(parseFloat(x.dataset.speed) === state.speed))); }); }
    $('.cat-close', box).onclick = close;
    $('.cat-prev', box).onclick = () => openTopic(list[i - 1].id);
    $('.cat-next', box).onclick = () => openTopic(list[i + 1].id);
    box.scrollTop = 0;
    function close() { box.remove(); document.body.style.overflow = ''; state.open = null; history.replaceState(null, '', location.pathname); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' && i < list.length - 1) openTopic(list[i + 1].id); else if (e.key === 'ArrowLeft' && i > 0) openTopic(list[i - 1].id); }
    document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
  }

  async function load() {
    app.innerHTML = '<div class="cat-loading">설명자료를 불러오는 중…</div>';
    try {
      const r = await fetch('/api/public/library'); const j = await r.json();
      state.topics = group(j.items || []).sort((a, b) => catOrder(a.category) - catOrder(b.category));
      render();
      const h = decodeURIComponent(location.hash.slice(1)); if (h && state.topics.some((t) => t.id === h)) openTopic(h);
    } catch (e) { app.innerHTML = '<div class="cat-loading">자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>'; }
  }
  load();
})();
