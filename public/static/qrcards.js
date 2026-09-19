/* 체어사이드 QR 카드 인쇄 /app/qr-cards/print — 병원 세션 필요. 브라우저 인쇄(PDF 저장)로 뽑는다. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  const svg = (url) => { const q = qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); };
  (async () => {
    const me = await fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null);
    if (!me) { app.innerHTML = '<div class="p-10 text-center text-slate-500">병원 콘솔에 먼저 로그인해 주세요. <a href="/app" class="underline">콘솔 열기</a></div>'; return; }
    const { cards } = await fetch('/api/qr-cards').then(r => r.json());
    const h = me.hospital;
    if (!cards.length) { app.innerHTML = '<div class="p-10 text-center text-slate-500">만든 QR 카드가 없습니다. 콘솔 [설정]에서 카드를 만드세요.</div>'; return; }
    app.innerHTML = `<div class="no-print flex items-center gap-3 px-6 py-3 border-b bg-slate-50 text-sm"><b>QR 카드 ${cards.length}장</b><span class="text-slate-500">A4 · 한 장에 4개 · 코팅하거나 아크릴 꽂이에 넣어 체어 옆에</span><button id="pr" class="ml-auto px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold"><i class="fa-solid fa-print mr-1"></i>인쇄 / PDF 저장</button></div>
      <div class="qr-print">${cards.map(k => `<div class="qr-card">
        ${h.logo_key ? `<img src="/a/${esc(h.logo_key)}" alt="" style="max-height:14mm;margin:0 auto 3mm;display:block">` : `<div style="font-weight:800;font-size:13pt">${esc(h.name)}</div>`}
        <div style="font-size:17pt;font-weight:900;line-height:1.25;margin-top:2mm">${esc(k.title)}</div>
        ${svg(k.url)}
        <div style="font-size:11pt;font-weight:700">휴대폰 카메라로 찍으면<br>안내 자료가 바로 열립니다</div>
        <div style="font-size:8pt;color:#64748b;margin-top:3mm">${esc(k.titles.slice(0, 3).join(' · '))}${k.titles.length > 3 ? ` 외 ${k.titles.length - 3}` : ''}</div>
        <div style="font-size:7pt;color:#94a3b8;margin-top:2mm">${esc(h.name)} · 열린 안내장에서 카카오톡으로도 받아둘 수 있습니다</div>
      </div>`).join('')}</div>`;
    $('#pr').onclick = () => window.print();
  })();
})();
