// The application uses versioned, self-hosted JS and CSS; no runtime Tailwind compiler.
const V = "care-20260908-1";
const head = (title: string) => `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#285847"><meta name="description" content="좋은 설명이 만드는 더 나은 환자 경험. 병원 상담 자료와 판서, 환자 안내를 연결하는 페이션트 커넥트."><title>${title}</title><link rel="manifest" href="/manifest.json"><link rel="icon" href="/static/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/icon-192.png"><link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"><link rel="stylesheet" href="/static/styles.css?v=${V}"><script src="/static/axios.min.js?v=${V}" defer></script></head>`;
function page(title: string, script: string, cls = "", editor = false) {
  return `${head(title)}<body class="${cls}"><a class="skip-link" href="#main-content">본문 바로가기</a><div id="app"><main style="min-height:100vh;display:grid;place-items:center;color:#66736b"><p>진료를 위한 공간을 준비하고 있습니다…</p></main></div><noscript>이 서비스는 JavaScript가 필요합니다. 브라우저 설정에서 JavaScript를 허용해 주세요.</noscript><script src="/static/common.js?v=${V}" defer></script>${editor ? `<script src="/static/editor.js?v=${V}" defer></script>` : ""}<script src="/static/${script}.js?v=${V}" defer></script><script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});</script></body></html>`;
}
export const pageHome = () =>
  page("페이션트 커넥트 · 더 나은 설명, 더 깊은 신뢰", "home");
export const pageConsult = () =>
  page("상담 스튜디오 · 페이션트 커넥트", "consult", "cinema");
export const pageCases = () => page("비포·애프터 · 페이션트 커넥트", "cases");
export const pageManage = () =>
  page("우리 병원 작업 공간 · 페이션트 커넥트", "manage", "", true);
export const pageAdmin = () =>
  page("운영자 콘솔 · 페이션트 커넥트", "admin", "", true);
export const pageLogin = () => page("병원 로그인 · 페이션트 커넥트", "login");
export const pageShare = () =>
  page("병원에서 보내드린 상담 안내", "share", "patient-body");
export const pageNotFound = (msg: string) =>
  `${head("페이션트 커넥트")}<body><main id="main-content" class="page" style="padding-top:100px;text-align:center"><section class="empty-state"><h1 style="font-size:22px">${msg}</h1><a class="btn-primary" href="/" style="margin-top:22px">라이브러리로 돌아가기</a></section></main></body></html>`;
