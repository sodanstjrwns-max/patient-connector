let mode =
  new URLSearchParams(location.search).get("mode") === "signup"
    ? "signup"
    : "login";
function render() {
  const signup = mode === "signup";
  document.getElementById("app").innerHTML =
    `<main id="main-content" class="auth-layout"><section class="auth-story">${PC.brand()}<h1>진료의 가치를,<br><em>환자의 이해로.</em></h1><p>함께 보고, 이해하고, 기억하는 상담.<br>좋은 진료와 환자 사이의 거리를 좁힙니다.</p><div class="auth-illustration"><span><i class="fas fa-book-open"></i> &nbsp;설명</span><i class="fas fa-arrow-right" style="opacity:.4"></i><span><i class="fas fa-pen"></i> &nbsp;이해</span><i class="fas fa-arrow-right" style="opacity:.4"></i><span><i class="fas fa-heart"></i> &nbsp;신뢰</span></div><p class="story-bottom">PATIENT CONNECT / BETTER CARE, TOGETHER</p></section><section class="auth-form-wrap"><div class="auth-form fade-in"><div class="mobile-only">${PC.brand()}</div><p class="eyebrow" style="color:var(--accent);margin-bottom:12px">${signup ? "YOUR NEW WORKSPACE" : "WELCOME BACK"}</p><h2>${signup ? "우리 병원 상담의 시작." : "다시 만나 반갑습니다."}</h2><p class="muted">${signup ? "병원 계정을 만들고 모든 기능을 무료로 이용하세요." : "로그인하고 더 좋은 환자 경험을 이어가세요."}</p><form id="auth-form" onsubmit="submitForm(event)">${signup ? `<div class="form-grid"><label class="field">병원 이름<input class="input" name="clinic_name" required maxlength="150" autocomplete="organization" placeholder="예: 서울비디치과"></label><label class="field">이름<input class="input" name="name" required maxlength="100" autocomplete="name" placeholder="이름"></label></div><label class="field">진료 분야<select class="input" name="specialty">${["치과", "피부·미용", "성형외과", "정형·재활", "안과", "한방", "기타"].map((s) => `<option>${s}</option>`).join("")}</select><small>선택한 진료과의 자료가 자동으로 표시됩니다.</small></label><label class="field">병원 전화번호 <span class="subtle">(선택)</span><input class="input" name="phone" type="tel" maxlength="30" autocomplete="tel" placeholder="02-0000-0000"></label>` : ""}<label class="field">이메일<input class="input" name="email" type="email" required maxlength="254" autocomplete="username" placeholder="you@clinic.com"></label><label class="field">비밀번호<span style="position:relative"><input id="password" class="input" name="password" type="password" required ${signup ? 'minlength="10"' : ""} maxlength="128" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "10자 이상의 비밀번호" : "비밀번호를 입력해 주세요"}" style="padding-right:45px"><button class="icon-btn" type="button" aria-label="비밀번호 표시" style="position:absolute;right:5px;top:5px" onclick="togglePassword(this)"><i class="far fa-eye"></i></button></span></label><div id="auth-error" class="error-message hidden" role="alert"></div><button id="auth-submit" class="btn-primary btn-lg" style="width:100%">${signup ? "무료로 시작하기" : "로그인"} <i class="fas fa-arrow-right"></i></button></form><p class="auth-bottom">${signup ? "이미 계정이 있으신가요?" : "아직 병원 계정이 없으신가요?"} <button class="btn-link" onclick="switchMode()">${signup ? "로그인" : "무료 계정 만들기"}</button></p><a class="auth-return" href="/"><i class="fas fa-arrow-left"></i> &nbsp;로그인 없이 라이브러리 둘러보기</a></div></section></main>`;
}
window.switchMode = () => {
  mode = mode === "signup" ? "login" : "signup";
  render();
};
window.togglePassword = (btn) => {
  const el = document.getElementById("password");
  el.type = el.type === "password" ? "text" : "password";
  btn.setAttribute(
    "aria-label",
    el.type === "text" ? "비밀번호 숨기기" : "비밀번호 표시",
  );
};
window.submitForm = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("auth-submit"),
    error = document.getElementById("auth-error");
  btn.disabled = true;
  error.classList.add("hidden");
  try {
    await axios.post(
      "/api/auth/" + mode,
      Object.fromEntries(new FormData(e.target)),
    );
    location.href = "/";
  } catch (err) {
    error.textContent =
      err.response?.data?.error || "로그인하지 못했습니다. 다시 시도해 주세요.";
    error.classList.remove("hidden");
    btn.disabled = false;
  }
};
render();
