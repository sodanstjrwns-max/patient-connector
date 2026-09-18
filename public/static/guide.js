/* 환자용 안내장 /g/:token · 수신거부 /optout/:token */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';
  const KIND = { explain: '진료설명', disease: '질환설명', cost: '비용설명', before_after: '비포애프터', notice: '주의사항' };
  const app = $('#app');
  const m = location.pathname.match(/^\/(g|optout)\/([0-9a-f]{32})$/);
  const mode = m?.[1], token = m?.[2] || '';
  const bodyHtml = (t) => String(t || '').split('\n').map((l) => l.startsWith('- ') ? `<div class="li">${esc(l.slice(2))}</div>` : `<div>${l.trim() ? esc(l) : '&nbsp;'}</div>`).join('');
  const isVideo = im => im?.media_type === 'video' || /\.(mp4|webm)$/i.test(im?.key || '');
  const annotationFor = (im, notes) => (notes || []).find(a => a.media_key === im.key && a.image_key);
  const img = (im, notes) => {
    const a = annotationFor(im, notes), video = isVideo(im);
    const time = a?.video_time == null ? '' : `${Math.floor(a.video_time / 60)}:${String(Math.floor(a.video_time % 60)).padStart(2, '0')}`;
    return `<figure class="my-3">${video ? `<video src="/a/${im.key}?t=${token}" ${im.poster_key ? `poster="/a/${im.poster_key}?t=${token}"` : ''} controls playsinline preload="metadata" class="w-full rounded-xl" aria-label="${esc(im.caption || '설명 영상')}"></video>` : `<img src="/a/${a?.image_key || im.key}?t=${token}" alt="${a ? '의료진 필기가 포함된 설명 이미지' : esc(im.caption || '설명 이미지')}" class="w-full rounded-xl bg-slate-100 ${a ? 'patient-annotation' : ''}" loading="lazy">`}${a && video ? `<figcaption class="annotation-caption">${time} 장면에 필기한 설명</figcaption><img src="/a/${a.image_key}?t=${token}" alt="영상 장면에 필기한 설명" class="w-full rounded-xl patient-annotation" loading="lazy">` : a ? '<figcaption class="annotation-caption">의료진 필기 포함 · 원본은 변경되지 않았습니다</figcaption>' : ''}${im.caption ? `<figcaption class="text-center text-sm text-slate-500 mt-1">${esc(im.caption)}</figcaption>` : ''}${a && !video ? `<details class="media-supplement"><summary>원본 이미지 보기</summary><img src="/a/${im.key}?t=${token}" alt="필기 전 원본" class="w-full rounded-xl" loading="lazy"></details>` : ''}</figure>`;
  };

  function materialHtml(x, i) {
    let inner = '';
    if (x.images.length && x.kind !== 'before_after') {
      inner = x.images.map(im => img(im, x.annotations)).join('') + (x.body ? `<details class="media-supplement"><summary>보충 설명 보기</summary><div class="pc-body">${bodyHtml(x.body)}</div></details>` : '');
    } else if (x.kind === 'before_after') {
      const [b, a] = x.images;
      inner = `<div class="ba">${[['치료 전', b], ['치료 후', a]].map(([l, im]) => `<figure>${im ? `<img src="/a/${annotationFor(im, x.annotations)?.image_key || im.key}?t=${token}" class="w-full rounded-xl bg-slate-100 ${annotationFor(im, x.annotations) ? 'patient-annotation' : ''}" alt="${esc(l)}${annotationFor(im, x.annotations) ? ' · 필기 포함' : ''}">` : ''}<figcaption class="text-sm">${l}</figcaption></figure>`).join('')}</div>${x.body ? `<div class="pc-body mt-3">${bodyHtml(x.body)}</div>` : ''}`;
    } else if (x.kind === 'cost') {
      const total = x.cost.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.qty) || 1), 0);
      inner = `${x.body ? `<div class="pc-body mb-3">${bodyHtml(x.body)}</div>` : ''}<table class="w-full text-sm"><tbody>${x.cost.map((c) => `<tr class="border-b"><td class="py-2">${esc(c.name)}${c.note ? `<div class="text-xs text-slate-500">${esc(c.note)}</div>` : ''}</td><td class="py-2 text-right text-slate-500 text-xs">${(c.qty || 1) > 1 ? `${won(c.price)} × ${c.qty}` : ''}</td><td class="py-2 text-right font-semibold whitespace-nowrap">${won((Number(c.price) || 0) * (Number(c.qty) || 1))}</td></tr>`).join('')}<tr><td class="py-3 font-bold" colspan="2">합계</td><td class="py-3 text-right font-extrabold">${won(total)}</td></tr></tbody></table><p class="text-xs text-slate-500 mt-2">안내 시점 기준 금액이며 진단에 따라 달라질 수 있습니다.</p>`;
    } else {
      inner = `${x.body ? `<div class="pc-body">${bodyHtml(x.body)}</div>` : ''}${x.images.map(im => img(im, x.annotations)).join('')}`;
    }
    inner += guidanceHtml(x);
    return `<section class="bg-white rounded-2xl border p-5 mb-4 fade-in" data-i="${i}">
      <div class="text-xs font-semibold pc-kind text-sky-700">${KIND[x.kind] || ''}${x.category ? ' · ' + esc(x.category) : ''}</div>
      <h2 class="text-lg font-bold mt-1 mb-3">${esc(x.title)}</h2>${x.is_example ? '<p class="example-editor-notice mb-3">검토용 예시자료입니다. 실제 진료 안내는 담당 의료진에게 확인해 주세요.</p>' : ''}${inner}</section>`;
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
  function guideHtml(j) {
    const h=j.hospital;
    const logo=h.logo_key?`<img src="/a/${esc(h.logo_key)}?t=${token}" alt="${esc(h.name)} 로고" class="pc-logo">`:'';
    return `${brandCss(h)}<div class="pc-brand">
      <header class="pc-header"><div class="max-w-md mx-auto px-4 pt-5 pb-4">
        ${logo}
        <div class="text-xs text-slate-500">진료 안내장</div><h1 class="text-xl font-extrabold mt-0.5">${esc(h.name)}</h1>
        ${h.tagline?`<p class="text-sm text-slate-600 mt-1">${esc(h.tagline)}</p>`:''}
        <p class="text-xs text-slate-400 mt-2">${esc(j.sent_at.slice(0, 10))} 안내드린 자료입니다. 언제든 다시 읽어 보세요.</p>
      </div></header>
      <div class="max-w-md mx-auto px-4 pb-28">
      ${j.materials.map(materialHtml).join('')}
      <footer class="mt-6 text-sm text-slate-600 bg-slate-50 rounded-2xl p-4">
        <div class="font-semibold">${esc(h.name)}</div>
        ${h.phone ? `<div class="text-xs text-slate-500 mt-1">전화 ${esc(h.phone)}</div>` : ''}
        ${h.address ? `<div class="text-xs text-slate-500 mt-1">${esc(h.address)}</div>` : ''}
        <div class="text-xs text-slate-400 mt-4 leading-relaxed">이 안내장은 ${esc(h.name)}의 요청으로 'Patient Connect'(페이션트퍼널)가 전달합니다. 링크는 ${esc(j.expires_at.slice(0, 10))}까지 열립니다.<br><a href="/optout/${token}" class="underline">이 병원의 카카오톡 안내 수신거부</a> · <a href="/privacy" class="underline">개인정보처리방침</a></div>
      </footer></div>
      ${ctaHtml(h)}
    </div>`;
  }
  window.PCGuide={render:guideHtml,materialHtml,guidanceHtml};
  if (!m) return;

  async function loadGuide() {
    app.innerHTML = '<div class="p-10 text-center text-slate-400">불러오는 중…</div>';
    const r = await fetch('/api/g/' + token); const j = await r.json().catch(() => ({}));
    if (r.status === 410) { app.innerHTML = `<div class="max-w-md mx-auto p-8 text-center"><div class="text-3xl">⏳</div><p class="mt-3 font-semibold">안내장 열람 기간이 지났습니다</p><p class="text-sm text-slate-500 mt-1">궁금한 점은 ${esc(j.hospital?.name || '병원')}${j.hospital?.phone ? ` (${esc(j.hospital.phone)})` : ''}으로 문의해 주세요.</p></div>`; return; }
    if (!r.ok) { app.innerHTML = '<div class="p-10 text-center text-slate-500">안내장을 찾을 수 없습니다.</div>'; return; }
    const h = j.hospital;
    app.innerHTML = guideHtml(j);
    // 자료 단위 열람 기록 (화면에 들어올 때 1회)
    const seen = new Set();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const i = Number(e.target.dataset.i); if (!seen.has(i)) { seen.add(i); fetch('/api/g/' + token + '/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: i }) }).catch(() => {}); } } }), { threshold: 0.4 });
    app.querySelectorAll('[data-i]').forEach((el) => io.observe(el));
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
