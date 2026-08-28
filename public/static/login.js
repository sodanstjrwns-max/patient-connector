// 로그인 / 회원가입 — v3 APPLE LIGHT
let mode = 'login'
const SPECIALTIES = ['치과', '피부·미용', '성형외과', '정형·재활', '안과', '한방', '기타']
let pickedSpecialty = '치과'

function render() {
  document.getElementById('app').innerHTML = `
  <div class="min-h-screen flex">
    <!-- 좌측 브랜딩 -->
    <div class="hidden lg:flex w-[46%] relative overflow-hidden items-center justify-center p-14 bg-white">
      <div class="blob w-[380px] h-[380px] bg-[#5e5ce6]/14 -top-24 -right-20"></div>
      <div class="blob w-[320px] h-[320px] bg-[#0071e3]/12 bottom-0 -left-24" style="animation-delay:-7s"></div>
      <div class="relative max-w-md">
        <div class="w-[72px] h-[72px] rounded-[1.6rem] bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-2xl shadow-[#5e5ce6]/35 mb-9 float-y">
          <i class="fas fa-hand-holding-medical text-white text-3xl"></i>
        </div>
        <h1 class="text-5xl font-extrabold text-[#1d1d1f] leading-[1.1] tracking-tight">우리 병원 이름이 걸린<br><span class="grad-text grad-animate">상담 전용 프로그램</span></h1>
        <p class="mt-5 text-[#6e6e73] text-lg leading-relaxed">로그인하면 헤더에 병원 이름이 크게 표시되고, 환자에게 보내는 링크에도 병원 브랜드가 담깁니다.</p>
        <div class="mt-12 space-y-5">
          ${[
            ['fa-display', '상담 화면에서 그림 그리며 설명'],
            ['fa-paper-plane', '오늘 설명한 자료를 환자에게 전송'],
            ['fa-infinity', '모든 기능 영원히 무료'],
          ].map(([icon, text]) => `
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl bg-[#f5f5f7] flex items-center justify-center shrink-0"><i class="fas ${icon} text-[#0071e3]"></i></div>
            <p class="text-[#1d1d1f] font-bold text-lg">${text}</p>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- 우측 폼 -->
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-md fade-in">
        <a href="/" class="inline-flex items-center gap-2 text-[#86868b] font-semibold mb-9 hover:text-[#0071e3] transition"><i class="fas fa-arrow-left"></i>라이브러리로</a>
        <h2 class="text-4xl font-extrabold text-[#1d1d1f] tracking-tight">${mode === 'login' ? '병원 로그인' : '병원 계정 만들기'}</h2>
        <p class="mt-2.5 text-[#6e6e73] text-lg">${mode === 'login' ? '상담 저장·업로드·전송 기능을 사용하세요' : '1분이면 됩니다. 무료이고, 계속 무료입니다.'}</p>

        <form id="auth-form" class="mt-9 space-y-4" onsubmit="return submitForm(event)">
          ${mode === 'signup' ? `
          <input name="clinic_name" required placeholder="병원 이름 (예: 서울비디치과)" class="input-light w-full h-14 px-5 text-lg">
          <div>
            <p class="text-sm font-bold text-[#86868b] mb-2">진료 분야</p>
            <div class="flex flex-wrap gap-2" id="spec-chips">
              ${SPECIALTIES.map((sp) => `<button type="button" onclick="pickSpec('${sp}')" class="chip ${pickedSpecialty === sp ? 'on' : ''} px-4 py-2.5 text-sm">${sp}</button>`).join('')}
            </div>
          </div>
          <input name="name" required placeholder="원장님 성함" class="input-light w-full h-14 px-5 text-lg">
          <input name="phone" placeholder="병원 전화번호 (선택)" class="input-light w-full h-14 px-5 text-lg">
          ` : ''}
          <input name="email" type="email" required placeholder="이메일" class="input-light w-full h-14 px-5 text-lg">
          <input name="password" type="password" required minlength="6" placeholder="비밀번호 (6자 이상)" class="input-light w-full h-14 px-5 text-lg">
          <button class="btn-touch ${mode === 'login' ? 'btn-primary' : 'btn-grad'} w-full h-14 text-lg">${mode === 'login' ? '로그인' : '무료로 시작하기'}</button>
        </form>

        <p class="mt-7 text-center text-[#86868b]">
          ${mode === 'login'
            ? `처음이신가요? <button onclick="switchMode('signup')" class="text-[#0071e3] font-extrabold hover:underline">병원 계정 만들기</button>`
            : `이미 계정이 있으신가요? <button onclick="switchMode('login')" class="text-[#0071e3] font-extrabold hover:underline">로그인</button>`}
        </p>
        ${mode === 'login' ? `
        <div class="mt-9 p-5 rounded-2xl bg-white border border-black/5 shadow-sm text-sm">
          <p class="font-extrabold text-[#0071e3] mb-2"><i class="fas fa-flask mr-1.5"></i>데모 계정으로 둘러보기</p>
          <p class="text-[#6e6e73]">병원: <b class="text-[#1d1d1f]">demo@clinic.com</b> / demo1234</p>
          <p class="text-[#6e6e73] mt-1">운영자: <b class="text-[#1d1d1f]">admin@patientconnect.kr</b> / admin1234</p>
        </div>` : ''}
      </div>
    </div>
  </div>`
}

window.pickSpec = (sp) => { pickedSpecialty = sp; render() }
window.switchMode = (m) => { mode = m; render() }

window.submitForm = async (e) => {
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = Object.fromEntries(fd.entries())
  if (mode === 'signup') body.specialty = pickedSpecialty
  try {
    await axios.post(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', body)
    location.href = '/'
  } catch (err) {
    PC.toast(err.response?.data?.error || '오류가 발생했습니다', 'err')
  }
  return false
}

render()
