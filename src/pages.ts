// HTML 페이지 셸 — 실제 UI는 /static/*.js 가 렌더링
const head = (title: string, extra = '') => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
<meta name="theme-color" content="#0d9488">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/static/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/icon-192.png">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: { extend: {
    colors: { brand: { 50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a' } },
    fontFamily: { sans: ['Pretendard','Apple SD Gothic Neo','Noto Sans KR','sans-serif'] }
  } }
}
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<link href="/static/styles.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
${extra}
</head>`

export const pageHome = () => `${head('페이션트 커넥트 — 치과 상담 설명자료 라이브러리')}
<body class="bg-slate-50 font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/home.js"></script>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}</script>
</body></html>`

export const pageConsult = () => `${head('상담 화면 — 페이션트 커넥트')}
<body class="bg-slate-950 font-sans antialiased overflow-hidden">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/consult.js"></script>
</body></html>`

export const pageCases = () => `${head('비포·애프터 갤러리 — 페이션트 커넥트')}
<body class="bg-slate-50 font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/cases.js"></script>
</body></html>`

export const pageManage = () => `${head('우리 병원 자료 관리 — 페이션트 커넥트')}
<body class="bg-slate-50 font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/manage.js"></script>
</body></html>`

export const pageAdmin = () => `${head('운영자 콘솔 — 페이션트 커넥트')}
<body class="bg-slate-50 font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/admin.js"></script>
</body></html>`

export const pageLogin = () => `${head('로그인 — 페이션트 커넥트')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/login.js"></script>
</body></html>`

export const pageShare = () => `${head('오늘 설명드린 자료')}
<body class="bg-slate-50 font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js"></script>
<script src="/static/share.js"></script>
</body></html>`

export const pageNotFound = (msg: string) => `${head('준비 중 — 페이션트 커넥트')}
<body class="bg-slate-50 font-sans antialiased">
<div class="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
  <div class="w-20 h-20 rounded-3xl bg-brand-50 flex items-center justify-center"><i class="fas fa-hammer text-3xl text-brand-600"></i></div>
  <h1 class="text-2xl font-bold text-slate-800">${msg}</h1>
  <a href="/" class="mt-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 transition">라이브러리로 돌아가기</a>
</div>
</body></html>`
