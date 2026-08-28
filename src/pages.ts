// HTML 페이지 셸 — 실제 UI는 /static/*.js 가 렌더링
const V = 'v5' // 정적 자산 버전 (구 SW·HTTP 캐시 무력화)
const head = (title: string, extra = '') => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
<meta name="theme-color" content="#f7f7f8">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/static/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/icon-192.png">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: { extend: {
    colors: { brand: { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81' } },
    fontFamily: { sans: ['Pretendard','Apple SD Gothic Neo','Noto Sans KR','sans-serif'] }
  } }
}
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<link href="/static/styles.css?${V}" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
${extra}
</head>`

export const pageHome = () => `${head('페이션트 커넥트 — 진료 상담 설명자료 라이브러리')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/home.js?${V}"></script>
<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}</script>
</body></html>`

export const pageConsult = () => `${head('상담 화면 — 페이션트 커넥트')}
<body class="font-sans antialiased overflow-hidden cinema">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/consult.js?${V}"></script>
</body></html>`

export const pageCases = () => `${head('비포·애프터 갤러리 — 페이션트 커넥트')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/cases.js?${V}"></script>
</body></html>`

export const pageManage = () => `${head('우리 병원 자료 관리 — 페이션트 커넥트')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/manage.js?${V}"></script>
</body></html>`

export const pageAdmin = () => `${head('운영자 콘솔 — 페이션트 커넥트')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/admin.js?${V}"></script>
</body></html>`

export const pageLogin = () => `${head('로그인 — 페이션트 커넥트')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/login.js?${V}"></script>
</body></html>`

export const pageShare = () => `${head('오늘 설명드린 자료')}
<body class="font-sans antialiased">
<div id="app"></div>
<script src="/static/common.js?${V}"></script>
<script src="/static/share.js?${V}"></script>
</body></html>`

export const pageNotFound = (msg: string) => `${head('준비 중 — 페이션트 커넥트')}
<body class="font-sans antialiased">
<div class="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
  <div class="w-14 h-14 rounded-[12px] bg-white border border-[#e4e4e7] flex items-center justify-center"><i class="fas fa-hammer text-[20px] text-[#4f46e5]"></i></div>
  <h1 class="text-[20px] font-bold text-[#18181b]">${msg}</h1>
  <a href="/" class="btn-primary mt-1 px-6 py-2.5">라이브러리로 돌아가기</a>
</div>
<script src="/static/common.js?${V}"></script>
</body></html>`
