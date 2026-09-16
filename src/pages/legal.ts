// 법적 문서 — 서버 렌더링 정적 페이지 (써모 legal.ts 구조 재사용, 커넥트 용어로 조정)
export const legalShell = (title: string, body: string) => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Patient Connect</title>
  <meta name="robots" content="index,follow">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📨</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>
    body{font-family:'Pretendard',-apple-system,sans-serif}
    .legal h2{font-size:1.15rem;font-weight:700;margin:2rem 0 .75rem;color:#1e293b;padding-top:.5rem;border-top:1px solid #f1f5f9}
    .legal h3{font-size:1rem;font-weight:600;margin:1.25rem 0 .5rem;color:#334155}
    .legal p{margin:.5rem 0;line-height:1.75;color:#475569;font-size:.925rem}
    .legal ul,.legal ol{margin:.5rem 0 .75rem 1.25rem;color:#475569;font-size:.925rem;line-height:1.75}
    .legal ul{list-style:disc}.legal ol{list-style:decimal}
    .legal table{width:100%;border-collapse:collapse;margin:.75rem 0;font-size:.875rem}
    .legal th{background:#f8fafc;text-align:left;padding:.5rem .75rem;border:1px solid #e2e8f0;color:#334155;font-weight:600}
    .legal td{padding:.5rem .75rem;border:1px solid #e2e8f0;color:#475569;vertical-align:top}
    .legal .copybox{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:.5rem;padding:.875rem 1rem;margin:.5rem 0;font-size:.875rem;color:#334155;white-space:pre-line;line-height:1.7}
  </style>
</head>
<body class="bg-white text-slate-800">
  <div class="max-w-3xl mx-auto px-5 py-10">
    <a href="/" class="text-sm text-slate-500 hover:text-slate-800">← Patient Connect</a>
    <h1 class="text-2xl font-bold mt-4 mb-2">${title}</h1>
    <div class="legal">${body}</div>
    <footer class="mt-12 pt-6 border-t text-xs text-slate-400 leading-relaxed">
      페이션트퍼널 · 대표 문석준 · 문의 patientsfunnel@gmail.com · 010-4445-1873<br>
      <a href="/privacy" class="underline">개인정보처리방침</a> · <a href="/terms" class="underline">이용약관</a> · <a href="/legal-guide" class="underline">병원용 안내 문구</a>
    </footer>
  </div>
</body>
</html>`

export const privacyBody = `
<p>페이션트퍼널(이하 "회사")은 Patient Connect(이하 "서비스")를 운영하면서 개인정보 보호법을 준수합니다. 이 방침은 서비스 이용자(의료기관 임직원)와, 의료기관의 요청으로 안내장을 받는 환자분의 정보를 어떻게 다루는지 설명합니다.</p>
<h2>1. 회사의 지위</h2>
<p>환자분께 안내장(진료 설명자료·주의사항·비용 안내)을 카카오톡으로 보내는 기능에서 회사는 각 의료기관으로부터 발송 업무를 위탁받은 <b>수탁자</b>입니다(개인정보 보호법 제26조). 수신번호의 수집·이용 근거와 안내 의무는 위탁한 의료기관에 있으며, 회사는 위탁 범위를 넘어 정보를 이용하지 않습니다.</p>
<h2>2. 처리하는 정보</h2>
<table>
<tr><th style="width:30%">구분</th><th>항목</th><th>보유 기간</th></tr>
<tr><td>서비스 이용자</td><td>Patient Hub 계정 정보(이메일·이름·역할), 소속 의료기관명, 접속 기록</td><td>탈퇴 시까지</td></tr>
<tr><td>환자 안내장 발송</td><td>수신 휴대전화번호(암호화 저장), 발송·열람 시각</td><td>번호 원문은 발송 후 7일 내 파기, 이후 마지막 4자리와 해시값만 보관</td></tr>
<tr><td>안내자료</td><td>의료기관이 등록한 설명 문안·이미지·비용표</td><td>의료기관이 삭제할 때까지</td></tr>
</table>
<p>안내장 페이지에는 환자분의 이름·진료 기록을 싣지 않습니다. 의료기관이 입력하는 내부 메모는 환자분께 표시되지 않습니다.</p>
<h2>3. 처리 위탁</h2>
<table>
<tr><th style="width:35%">수탁자</th><th>위탁 업무</th></tr>
<tr><td>㈜누리고 (SOLAPI)</td><td>카카오 알림톡 발송 대행</td></tr>
<tr><td>Cloudflare, Inc.</td><td>서비스 호스팅·데이터 저장(해외: 미국 등)</td></tr>
</table>
<h2>4. 정보주체의 권리</h2>
<p>환자분은 안내장 하단 [수신거부]로 해당 의료기관의 발송을 즉시 중단할 수 있습니다. 열람·정정·삭제 요구는 해당 의료기관 또는 회사(patientsfunnel@gmail.com)에 할 수 있습니다.</p>
<h2>5. 안전조치</h2>
<p>수신번호는 AES-256-GCM 으로 암호화하여 저장하고, 안내장 링크는 무작위 토큰과 유효기간(기본 30일)으로 보호합니다. 접근은 HTTPS 로만 허용합니다.</p>
<h2>6. 개인정보 보호책임자</h2>
<p>문석준 · patientsfunnel@gmail.com · 010-4445-1873</p>
<p>시행일: 2026-09-16</p>
`

export const termsBody = `
<h2>제1조 (목적)</h2><p>이 약관은 페이션트퍼널(이하 "회사")이 제공하는 Patient Connect(이하 "서비스")의 이용 조건을 정합니다.</p>
<h2>제2조 (서비스)</h2><p>서비스는 의료기관이 환자에게 진료 설명자료·비포애프터·비용·주의사항을 화면으로 제시하고, 선택한 자료를 안내장 링크로 묶어 카카오톡 알림톡(Patient Connect 채널)으로 발송하는 도구입니다.</p>
<h2>제3조 (회원의 의무)</h2>
<ul>
<li>회원(의료기관)은 수신번호를 적법하게 수집하고, 환자에게 회사가 발송 수탁자임을 안내할 의무가 있습니다(<a href="/legal-guide" class="underline">병원용 안내 문구</a>).</li>
<li>안내장은 진료 안내 목적에 한하며, 광고성 문구·이벤트·할인 유도를 담을 수 없습니다. 위반 시 발송이 제한될 수 있습니다.</li>
<li>등록하는 이미지·문안의 저작권과 의료광고 관련 법령 준수 책임은 회원에게 있습니다.</li>
</ul>
<h2>제4조 (발송·수신거부)</h2><p>발송은 카카오 알림톡 정책과 검수 템플릿 범위 안에서 이뤄지며, 환자가 수신거부한 번호로는 발송하지 않습니다. 카카오톡 미가입·차단 등 사유로 도달하지 않을 수 있습니다.</p>
<h2>제5조 (책임의 한계)</h2><p>회사는 통신사·카카오·SOLAPI 의 장애로 인한 미발송에 대해 고의·중과실이 없는 한 책임지지 않습니다.</p>
<h2>제6조 (계약 해지)</h2><p>회원은 언제든 이용을 중단할 수 있으며, 요청 시 등록 자료와 발송내역을 삭제합니다.</p>
<p>시행일: 2026-09-16</p>
`

export const legalGuideBody = `
<p>Patient Connect 로 안내장을 보내려면 병원이 환자분께 두 가지를 알려야 합니다. 아래 문구를 접수 동의서나 개인정보처리방침에 그대로 넣으시면 됩니다.</p>
<h2>1. 개인정보처리방침의 위탁 항목</h2>
<div class="copybox">■ 개인정보 처리 위탁
- 수탁자: 페이션트퍼널 (Patient Connect)
- 위탁 업무: 진료 안내장(설명자료·주의사항·비용 안내) 카카오톡 발송
- 재위탁: ㈜누리고(SOLAPI) — 알림톡 발송 대행</div>
<h2>2. 접수 시 안내(동의) 문구</h2>
<div class="copybox">진료 설명자료와 주의사항을 카카오톡으로 받아보시겠습니까?
- 항목: 휴대전화번호
- 목적: 진료 안내장 발송 (광고 아님)
- 보유: 발송 후 7일 내 번호 파기
- 발송 대행: 페이션트퍼널 Patient Connect 채널
동의하지 않아도 진료에는 불이익이 없습니다. 언제든 안내장 하단 [수신거부]로 중단할 수 있습니다.</div>
<h2>3. 이렇게 보내면 안 됩니다</h2>
<ul>
<li>할인·이벤트·시술 권유 등 광고성 내용 (알림톡 정책 위반, 의료광고 심의 대상)</li>
<li>환자 이름·진단명·치료 기록 등 민감정보를 안내장에 싣는 것</li>
<li>동의 없이 수집한 번호, 타인의 번호</li>
</ul>
<p>발송 메시지 마지막 줄에는 항상 "이 메시지는 #{병원명}의 요청으로 'Patient Connect'가 발송합니다"가 붙어 발신 관계가 환자분께 표시됩니다.</p>
`

export const landingPage = () => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Patient Connect — 환자 설명, 보여주고 보내기</title>
  <meta name="description" content="진료 설명자료·비포애프터·비용 안내를 환자분께 보기 좋게 보여주고, 필요한 자료를 카카오톡으로 보내 병원 밖에서도 다시 볼 수 있게 하는 환자 설명 도구">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📨</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>body{font-family:'Pretendard',-apple-system,sans-serif}</style>
</head>
<body class="bg-white text-slate-800">
  <main class="max-w-3xl mx-auto px-6 py-16">
    <p class="text-sm font-semibold text-sky-600">Patient Connect · 페이션트 커넥트</p>
    <h1 class="text-3xl md:text-4xl font-bold mt-3 leading-snug">설명은 화면으로 보여주고,<br>자료는 카카오톡으로 보내세요.</h1>
    <p class="mt-5 text-slate-600 leading-relaxed">진료 설명자료·비포애프터·비용 안내를 환자분께 보기 좋게 제시하고, 오늘 설명한 자료를 골라 안내장 링크 하나로 보냅니다. 환자분은 집에서 다시 읽고, 병원은 누가 열어봤는지 알 수 있습니다.</p>
    <div class="mt-8 flex flex-wrap gap-3">
      <a href="/api/auth/hub" class="inline-flex items-center px-5 py-3 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-700">Patient Hub 계정으로 시작</a>
      <a href="/legal-guide" class="inline-flex items-center px-5 py-3 rounded-lg border border-slate-300 font-semibold hover:bg-slate-50">병원용 안내 문구</a>
    </div>
    <section class="mt-14 grid md:grid-cols-3 gap-6 text-sm">
      <div class="p-5 rounded-xl bg-slate-50"><h3 class="font-bold">1. 자료함</h3><p class="mt-2 text-slate-600">설명 문안·이미지·비포애프터·비용표를 진료별로 등록합니다. 한 번 만들면 계속 씁니다.</p></div>
      <div class="p-5 rounded-xl bg-slate-50"><h3 class="font-bold">2. 설명하기</h3><p class="mt-2 text-slate-600">오늘 설명할 자료를 골라 큰 화면으로 넘기며 보여줍니다. 태블릿·모니터 어디서나.</p></div>
      <div class="p-5 rounded-xl bg-slate-50"><h3 class="font-bold">3. 보내기</h3><p class="mt-2 text-slate-600">번호만 넣으면 병원 이름으로 안내장이 카카오톡에 도착합니다. 병원별 채널 개설이 필요 없습니다.</p></div>
    </section>
    <p class="mt-10 text-xs text-slate-400">발송은 페이션트퍼널의 카카오 채널 'Patient Connect'가 각 병원의 요청으로 대행하며, 메시지에 병원명과 대행 고지가 표시됩니다. 광고성 발송은 할 수 없습니다.</p>
  </main>
  <footer class="max-w-3xl mx-auto px-6 pb-10 text-xs text-slate-400">
    페이션트퍼널 · 대표 문석준 · patientsfunnel@gmail.com · 010-4445-1873 · <a href="/privacy" class="underline">개인정보처리방침</a> · <a href="/terms" class="underline">이용약관</a>
  </footer>
</body>
</html>`
