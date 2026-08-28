// 로그인 / 회원가입 — v2 AURORA DARK
let mode = 'login'
const SPECIALTIES = ['치과', '피부·미용', '성형외과', '정형·재활', '안과', '한방', '기타']
let pickedSpecialty = '치과'

function render() {
  document.getElementById('app').innerHTML = `
  <div class="min-h-screen flex">
    <!-- 좌측 브랜딩 -->
    <div class="hidden lg:flex w-[46%] relative overflow-hidden items-center justify-center p-14">
      <div class="absolute inset-0" style="background:
        radial-gradient(ellipse 60% 45% at 70% 10%, rgba(45,212,191,0.22), transparent 60%),
        radial-gradient(ellipse 50% 40% at 20% 85%, rgba(99,102,241,0.18), transparent 58%)"></div>
      <div class="relative max-w-md">
        <div class="relative inline-block mb-9">
          <div class="absolute inset-0 rounded-3xl bg-teal-400/40 blur-2xl"></div>
          <div class="relative w-18 h-18 p-5 rounded-3xl bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center shadow-2xl">
            <i class="fas fa-hand-holding-medical text-white text-3xl"></i>
          </div>
        </div>
        <h1 class="text-5xl font-black text-white leading-[1.12] tracking-tight">우리 병원 이름이 걸린<br><span class="grad-text">상담 전용 프로그램</span></h1>
        <p class="mt-5 text-slate-400 text-lg leading-relaxed">로그인하면 헤더에 병원 이름이 크게 표시되고, 환자에게 보내는 링크에도 병원 브랜드가 담깁니다.</p>
        <div class="mt-12 space-y-5">
          ${[
            ['fa-display', '상담 화면에서 그림 그리며 설명'],
            ['fa-paper-plane', '오늘 설명한 자료를 환자에게 전송'],
            ['fa-infinity', '모든 기능 영원히 무료'],
          ].map(([icon, text]) => `
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-2xl glass flex items-center justify-center shrink-0"><i class="fas ${icon} text-teal-400"></i></div>
            <p class="text-slate-200 font-bold text-lg">${text}</p>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- 우측 폼 -->
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-md fade-in">
        <a href="/" class="inline-flex items-center gap-2 text-slate-500 font-bold mb-9 hover:text-teal-300 transition"><i class="fas fa-arrow-left"></i>라이브러리로</a>
        <h2 class="text-4xl font-black text-white tracking-tight">${mode === 'login' ? '병원 로그인' : '병원 계정 만들기'}</h2>
        <p class="mt-2.5 text-slate-400 text-lg">${mode === 'login' ? '상담 저장·업로드·전송 기능을 사용하세요' : '1분이면 됩니다. 무료이고, 계속 무료입니다.'}</p>

        <form id="auth-form" class="mt-9 space-y-4" onsubmit="return submitForm(event)">
          ${mode === 'signup' ? `
          <input name="clinic_name" required placeholder="병원 이름 (예: 서울비디치과)" class="input-dark w-full h-14 px-5 text-lg">
          <div>
            <p class="text-sm font-bold text-slate-500 mb-2">진료 분야</p>
            <div class="flex flex-wrap gap-2" id="spec-chips">
              ${SPECIALTIES.map((sp) => `<button type="button" onclick="pickSpec('${sp}')" class="chip ${pickedSpecialty === sp ? 'on' : ''} px-4 py-2.5 rounded-xl text-sm">${sp}</button>`).join('')}
            </div>
          </div>
          <input name="name" required placeholder="원장님 성함" class="input-dark w-full h-14 px-5 text-lg">
          <input name="phone" placeholder="병원 전화번호 (선택)" class="input-dark w-full h-14 px-5 text-lg">
          ` : ''}
          <input name="email" type="email" required placeholder="이메일" class="input-dark w-full h-14 px-5 text-lg">
          <input name="password" type="password" required minlength="6" placeholder="비밀번호 (6자 이상)" class="input-dark w-full h-14 px-5 text-lg">
          <button class="btn-touch btn-primary w-full h-14 rounded-2xl text-lg">${mode === 'login' ? '로그인' : '무료로 시작하기'}</button>
        </form>

        <p class="mt-7 text-center text-slate-500">
          ${mode === 'login'
            ? `처음이신가요? <button onclick="switchMode('signup')" class="text-teal-400 font-extrabold hover:text-teal-300">병원 계정 만들기</button>`
            : `이미 계정이 있으신가요? <button onclick="switchMode('login')" class="text-teal-400 font-extrabold hover:text-teal-300">로그인</button>`}
        </p>
        ${mode === 'login' ? `
        <div class="mt-9 p-5 rounded-2xl glass text-sm">
          <p class="font-extrabold text-teal-300 mb-2"><i class="fas fa-flask mr-1.5"></i>데모 계정으로 둘러보기</p>
          <p class="text-slate-400">병원: <b class="text-slate-200">demo@clinic.com</b> / demo1234</p>
          <p class="text-slate-400 mt-1">운영자: <b class="text-slate-200">admin@patientconnect.kr</b> / admin1234</p>
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
