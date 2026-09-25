/* 환자용 안내장 /g/:token · 수신거부 /optout/:token */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';
  // 【2026-09-25】라이브러리 미디어는 국내에서 빠른 pages.dev 원본으로(존 라우팅 LAX 회피). 병원 자료는 그대로 /a/.
  const A = (key) => (typeof key === 'string' && key.startsWith('library/') ? 'https://patient-connect.pages.dev/a/' : '/a/') + key;
  const KIND = { explain: '설명자료', disease: '설명자료', cost: '비용설명', before_after: '비포애프터', notice: '주의사항' };
  const app = $('#app');
  const m = location.pathname.match(/^\/(g|optout)\/([0-9a-f]{32})$/);
  const mode = m?.[1], token = m?.[2] || '';
  const bodyHtml = (t) => String(t || '').split('\n').map((l) => l.startsWith('- ') ? `<div class="li">${esc(l.slice(2))}</div>` : `<div>${l.trim() ? esc(l) : '&nbsp;'}</div>`).join('');
  const isVideo = im => im?.media_type === 'video' || /\.(mp4|webm)$/i.test(im?.key || '');
  const annotationFor = (im, notes) => (notes || []).find(a => a.media_key === im.key && a.image_key);
  const img = (im, notes) => {
    const a = annotationFor(im, notes), video = isVideo(im);
    const time = a?.video_time == null ? '' : `${Math.floor(a.video_time / 60)}:${String(Math.floor(a.video_time % 60)).padStart(2, '0')}`;
    return `<figure class="my-3">${video ? `<div class="pc-video"><video src="${A(im.key)}?t=${token}" ${im.poster_key ? `poster="${A(im.poster_key)}?t=${token}"` : ''} controls playsinline preload="metadata" class="w-full rounded-xl" aria-label="${esc(im.caption || '설명 영상')}"></video><div class="pc-speed" role="group" aria-label="재생 속도">${[1, 1.5, 2, 3].map((v) => `<button type="button" data-speed="${v}">${v}×</button>`).join('')}</div></div>` : `<img src="${A(a?.image_key || im.key)}?t=${token}" alt="${a ? '의료진 필기가 포함된 설명 이미지' : esc(im.caption || '설명 이미지')}" class="w-full rounded-xl bg-slate-100 ${a ? 'patient-annotation' : ''}" loading="lazy">`}${a && video ? `<figcaption class="annotation-caption">${time} 장면에 필기한 설명</figcaption><img src="${A(a.image_key)}?t=${token}" alt="영상 장면에 필기한 설명" class="w-full rounded-xl patient-annotation" loading="lazy">` : a ? '<figcaption class="annotation-caption">의료진 필기 포함 · 원본은 변경되지 않았습니다</figcaption>' : ''}${im.caption ? `<figcaption class="text-center text-sm text-slate-500 mt-1">${esc(im.caption)}</figcaption>` : ''}${a && !video ? `<details class="media-supplement"><summary>원본 이미지 보기</summary><img src="${A(im.key)}?t=${token}" alt="필기 전 원본" class="w-full rounded-xl" loading="lazy"></details>` : ''}</figure>`;
  };

  function materialHtml(x, i) {
    let inner = '';
    if (x.images.length && x.kind !== 'before_after') {
      inner = x.images.map(im => img(im, x.annotations)).join('') + (x.body ? `<details class="media-supplement"><summary>보충 설명 보기</summary><div class="pc-body">${bodyHtml(x.body)}</div></details>` : '');
    } else if (x.kind === 'before_after') {
      const [b, a] = x.images;
      inner = `<div class="ba">${[['치료 전', b], ['치료 후', a]].map(([l, im]) => `<figure>${im ? `<img src="${A(annotationFor(im, x.annotations)?.image_key || im.key)}?t=${token}" class="w-full rounded-xl bg-slate-100 ${annotationFor(im, x.annotations) ? 'patient-annotation' : ''}" alt="${esc(l)}${annotationFor(im, x.annotations) ? ' · 필기 포함' : ''}">` : ''}<figcaption class="text-sm">${l}</figcaption></figure>`).join('')}</div>${x.body ? `<div class="pc-body mt-3">${bodyHtml(x.body)}</div>` : ''}`;
    } else if (x.kind === 'cost') {
      const total = x.cost.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.qty) || 1), 0);
      inner = `${x.body ? `<div class="pc-body mb-3">${bodyHtml(x.body)}</div>` : ''}<div class="pc-cost">${x.cost.map((c) => `<div class="pc-cost-row"><div><b>${esc(c.name)}</b>${c.note ? `<small>${esc(c.note)}</small>` : ''}${(c.qty || 1) > 1 ? `<small>${won(c.price)} × ${c.qty}</small>` : ''}</div><span>${won((Number(c.price) || 0) * (Number(c.qty) || 1))}</span></div>`).join('')}<div class="pc-cost-total"><span>합계</span><b>${won(total)}</b></div></div><p class="pc-fine">안내 시점 기준 금액이며 진단에 따라 달라질 수 있습니다.</p>`;
    } else {
      inner = `${x.body ? `<div class="pc-body">${bodyHtml(x.body)}</div>` : ''}${x.images.map(im => img(im, x.annotations)).join('')}`;
    }
    inner += guidanceHtml(x);
    return `<section class="pc-mat pc-mat-${esc(x.kind)}" data-i="${i}" id="mat-${i}">
      <div class="pc-mat-head"><span class="pc-mat-no">${String(i + 1).padStart(2, '0')}</span><span class="pc-kind-pill">${KIND[x.kind] || ''}</span>${x.category ? `<span class="pc-cat">${esc(x.category)}</span>` : ''}</div>
      <h2 class="pc-mat-title">${esc(x.title)}</h2>${inner}</section>`;
  }

  function guidanceHtml(x) {
    const g=x.guidance || {};
    const fields=x.kind==='cost' ? [['포함 범위',g.included],['추가 비용 조건',g.extra],['대안별 차이',g.alternatives],['안내 기준일',g.basis_date],['비용 안내 유효기간',g.valid_until],['검사 후 달라질 수 있는 부분',g.variability]] : x.kind==='before_after' ? [['치료 내용',g.treatment],['치료 기간',g.period],['개인차 안내',g.individual_notice]] : [];
    return fields.some(([,v])=>v) ? `<aside class="guidance-panel"><h3>${x.kind==='cost'?'공용 비용 안내 · 확정 견적이 아닙니다':'참고 사례 안내'}</h3><dl>${fields.filter(([,v])=>v).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></aside>` : '';
  }
  const safeContact=(v,chat=false)=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&(!chat||u.hostname==='pf.kakao.com')?u.href:''}catch{return ''}};
  const HEX=/^#[0-9a-f]{6}$/i;
  const brandCss=h=>{const c=HEX.test(h.primary_color||'')?h.primary_color:'#0ea5e9';return `<style>.pc-brand{--pc-accent:${c}}.pc-brand .pc-body .li:before{color:var(--pc-accent)}.pc-brand .pc-kind{color:var(--pc-accent)}.pc-brand .pc-cta-primary{background:var(--pc-accent)}.pc-brand .pc-header{border-top:6px solid var(--pc-accent)}</style>`};
  function ctaHtml(h){
    const tel=h.phone?`<a href="tel:${esc(h.phone.replace(/[^+0-9]/g,''))}" class="pc-cta pc-cta-primary"><i class="fa-solid fa-phone"></i><span>전화 문의</span></a>`:'';
    const chat=safeContact(h.chat_url,true)?`<a href="${esc(safeContact(h.chat_url,true))}" target="_blank" rel="noopener noreferrer" class="pc-cta pc-cta-kakao"><i class="fa-solid fa-comment"></i><span>카카오톡 문의</span></a>`:'';
    const book=safeContact(h.booking_url)?`<a href="${esc(safeContact(h.booking_url))}" target="_blank" rel="noopener noreferrer" class="pc-cta pc-cta-book"><i class="fa-regular fa-calendar-check"></i><span>예약하기</span></a>`:'';
    const items=[tel,chat,book].filter(Boolean);
    return items.length?`<nav class="pc-cta-bar" aria-label="병원 연락">${items.join('')}</nav>`:'';
  }
  // 병원 채널 친구추가 주소: pf.kakao.com/_id(/chat|/friend) → /_id/friend  【2026-09-19 QR = 친구 늘리기】
  const friendUrl=h=>{const c=safeContact(h.chat_url,true);const m=c.match(/^https:\/\/pf\.kakao\.com\/(_[A-Za-z0-9]+)/);return m?`https://pf.kakao.com/${m[1]}/friend`:''};
  function friendHtml(h){const u=friendUrl(h);return u?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" class="pc-friend" data-friend><span class="pc-friend-ico"><i class="fa-solid fa-comment"></i></span><span><b>${esc(h.name)} 카카오톡 채널 친구추가</b><small>치료 안내와 병원 소식을 카카오톡으로 받아보세요</small></span><i class="fa-solid fa-chevron-right"></i></a>`:''}
  function guideHtml(j) {
    const h=j.hospital;
    const logo=h.logo_key?`<img src="${A(esc(h.logo_key))}?t=${token}" alt="${esc(h.name)} 로고" class="pc-logo">`:'';
    const d = new Date(String(j.sent_at).replace(' ', 'T'));
    const dateTxt = isNaN(d) ? esc(j.sent_at.slice(0, 10)) : `${d.getMonth() + 1}월 ${d.getDate()}일`;
    const kinds = [...new Set(j.materials.map((x) => x.kind))];
    return `${brandCss(h)}<div class="pc-brand pc-guide">
      <header class="pc-hero"><span class="pc-orb a"></span><span class="pc-orb b"></span><div class="pc-wrap">
        <div class="pc-hero-top">${logo ? `<span class="pc-logo-chip">${logo}</span>` : `<span class="pc-logo-chip"><i class="fa-solid fa-tooth"></i>${esc(h.name)}</span>`}<span class="pc-date"><i class="fa-regular fa-calendar"></i>${dateTxt} 안내</span></div>
        <p class="pc-eyebrow">진료 안내장</p>
        <h1 class="pc-title">${esc(h.name)}에서<br>오늘 설명드린 자료입니다</h1>
        ${h.tagline?`<p class="pc-tagline">${esc(h.tagline)}</p>`:''}
        <div class="pc-meta"><span><i class="fa-solid fa-layer-group"></i>자료 ${j.materials.length}개</span>${kinds.map((k) => `<span>${KIND[k] || k}</span>`).join('')}</div>
        ${j.materials.length > 2 ? `<nav class="pc-toc" aria-label="자료 바로가기">${j.materials.map((x, i) => `<a href="#mat-${i}"><b>${String(i + 1).padStart(2, '0')}</b>${esc(x.title)}</a>`).join('')}</nav>` : ''}
      </div></header>
      <div class="pc-wrap pc-main">
      ${j.self_send ? friendHtml(h) : ''}
      ${j.materials.map(materialHtml).join('')}
      ${j.self_send ? `<section class="pc-selfsend" id="selfsend"><h3 class="font-bold"><i class="fa-solid fa-comment text-yellow-500 mr-1"></i>이 안내장을 카카오톡으로도 받아두기</h3>
        <p class="text-sm text-slate-600 mt-1">번호를 넣으시면 ${esc(h.name)} 이름으로 카카오톡 알림톡이 갑니다. 본인이 요청하실 때만 발송되며, 번호는 발송 후 7일 뒤 삭제됩니다.</p>
        <form id="ss-form"><input id="ss-phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000" maxlength="13" required><button type="submit">카카오톡으로 받기</button></form>
        <div id="ss-msg" class="text-sm mt-2" role="status"></div></section>` : ''}
      <footer class="pc-foot">
        <div class="pc-clinic"><b>${esc(h.name)}</b>${h.phone ? `<p><i class="fa-solid fa-phone"></i><a href="tel:${esc(h.phone.replace(/[^+0-9]/g,''))}">${esc(h.phone)}</a></p>` : ''}${h.address ? `<p><i class="fa-solid fa-location-dot"></i><span>${esc(h.address)}</span></p>` : ''}</div>
        <p class="pc-legal">이 안내장은 ${esc(h.name)}의 요청으로 'Patient Connect'(페이션트퍼널)가 전달합니다. 링크는 ${esc(j.expires_at.slice(0, 10))}까지 열립니다. 안내 자료는 이해를 돕기 위한 것이며 진단·치료 계획은 담당 의료진의 판단에 따릅니다.</p>
        <p class="pc-legal"><a href="/optout/${token}">이 병원의 카카오톡 안내 수신거부</a> · <a href="/privacy">개인정보처리방침</a></p>
      </footer></div>
      ${ctaHtml(h)}
    </div>`;
  }
  // 【2026-09-20】영상 배속 공통: .pc-video 안의 <video> + .pc-speed 버튼. 선택값은 localStorage(pc_speed)에 기억, 새 영상에도 적용.
  window.PCSpeed = (() => {
    const KEY = 'pc_speed';
    const get = () => { try { const v = parseFloat(localStorage.getItem(KEY)); return [1, 1.5, 2, 3].includes(v) ? v : 1; } catch { return 1; } };
    const set = (v) => { try { localStorage.setItem(KEY, String(v)); } catch {} };
    function paint(wrap, v) { wrap.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(parseFloat(b.dataset.speed) === v))); }
    function bind(root) {
      (root || document).querySelectorAll('.pc-video').forEach((wrap) => {
        if (wrap.dataset.speedBound) return; wrap.dataset.speedBound = '1';
        const video = wrap.querySelector('video'); if (!video) return;
        const apply = (v) => { video.playbackRate = v; video.defaultPlaybackRate = v; paint(wrap, v); };
        apply(get());
        video.addEventListener('loadedmetadata', () => { video.playbackRate = get(); });
        wrap._applySpeed = apply;
        wrap.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const v = parseFloat(b.dataset.speed); set(v); document.querySelectorAll('.pc-video').forEach((w) => { if (w._applySpeed) w._applySpeed(v); }); }));
      });
    }
    return { bind, get };
  })();
  window.PCGuide={render:guideHtml,materialHtml,guidanceHtml};
  if (!m) return;

  async function loadGuide() {
    app.innerHTML = '<div class="p-10 text-center text-slate-400">불러오는 중…</div>';
    const r = await fetch('/api/g/' + token); const j = await r.json().catch(() => ({}));
    if (r.status === 410) { app.innerHTML = `<div class="max-w-md mx-auto p-8 text-center"><div class="text-3xl">⏳</div><p class="mt-3 font-semibold">안내장 열람 기간이 지났습니다</p><p class="text-sm text-slate-500 mt-1">궁금한 점은 ${esc(j.hospital?.name || '병원')}${j.hospital?.phone ? ` (${esc(j.hospital.phone)})` : ''}으로 문의해 주세요.</p></div>`; return; }
    if (!r.ok) { app.innerHTML = '<div class="p-10 text-center text-slate-500">안내장을 찾을 수 없습니다.</div>'; return; }
    const h = j.hospital;
    app.innerHTML = guideHtml(j);
    PCSpeed.bind(app);
    // 자료 단위 열람 기록 (화면에 들어올 때 1회)
    const seen = new Set();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const i = Number(e.target.dataset.i); if (!seen.has(i)) { seen.add(i); fetch('/api/g/' + token + '/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: i }) }).catch(() => {}); } } }), { threshold: 0.4 });
    app.querySelectorAll('[data-i]').forEach((el) => io.observe(el));
    const reveal = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } }), { threshold: 0.06 });
    app.querySelectorAll('.pc-mat, .pc-selfsend, .pc-foot').forEach((el) => reveal.observe(el));
    setTimeout(() => app.querySelectorAll('.pc-mat, .pc-selfsend, .pc-foot').forEach((el) => el.classList.add('in')), 1500);
    const fr = $('[data-friend]'); if (fr) fr.addEventListener('click', () => { fetch('/api/g/' + token + '/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: -1 }) }).catch(() => {}); });
    const ss = $('#ss-form');
    if (ss) ss.onsubmit = async (e) => {
      e.preventDefault();
      const btn = ss.querySelector('button'), msg = $('#ss-msg'); btn.disabled = true; msg.textContent = '보내는 중…';
      try {
        const r = await fetch('/api/g/' + token + '/send-self', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: $('#ss-phone').value }) });
        const jj = await r.json().catch(() => ({}));
        msg.textContent = jj.message || jj.error || (r.ok ? '보냈습니다' : '보내지 못했습니다');
        msg.className = 'text-sm mt-2 ' + (jj.ok ? 'text-emerald-700 font-semibold' : 'text-rose-600');
        if (jj.ok) { $('#ss-phone').value = ''; }
      } catch (err) { msg.textContent = '네트워크 오류입니다. 잠시 후 다시 시도해 주세요'; msg.className = 'text-sm mt-2 text-rose-600'; }
      finally { btn.disabled = false; }
    };
  }
  function renderOptout() {
    app.innerHTML = `<div class="max-w-md mx-auto px-4 py-10 text-center">
      <div class="text-3xl">🔕</div><h1 class="text-lg font-bold mt-3">카카오톡 안내 수신거부</h1>
      <p class="text-sm text-slate-600 mt-2">이 병원에서 보내는 진료 안내장을 더 이상 받지 않습니다. 이미 받은 안내장 링크는 그대로 열립니다.</p>
      <button id="do" class="mt-6 px-5 py-2.5 rounded-lg bg-slate-900 text-white font-semibold">수신거부하기</button>
      <div id="msg" class="mt-4 text-sm"></div>
      <a href="/g/${token}" class="block mt-6 text-sm text-slate-400 underline">안내장으로 돌아가기</a></div>`;
    $('#do').onclick = async () => { $('#do').disabled = true; const r = await fetch('/api/optout/' + token, { method: 'POST' }); $('#msg').textContent = r.ok ? '수신거부가 완료되었습니다.' : '처리하지 못했습니다. 병원으로 문의해 주세요.'; };
  }
  if (mode === 'g') loadGuide(); else renderOptout();
})();
