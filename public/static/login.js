// 로그인 / 회원가입
let mode = 'login'

function render() {
  document.getElementById('app').innerHTML = `
  <div class="min-h-screen flex bg-slate-50">
    <!-- 좌측 브랜딩 -->
    <div class="hidden lg:flex w-[46%] relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 items-center justify-center p-14">
      <div class="absolute inset-0 opacity-25" style="background-image:radial-gradient(circle at 75% 15%, #5eead4 0, transparent 50%), radial-gradient(circle at 10% 90%, #99f6e4 0, transparent 45%)"></div>
      <div class="relative max-w-md">
        <div class="w-16 h-16 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center mb-8"><i class="fas fa-tooth text-white text-2xl"></i></div>
        <h1 class="text-4xl font-extrabold text-white leading-tight">우리 병원 이름이 걸린<br>상담 전용 프로그램</h1>
        <p class="mt-4 text-brand-100 text-lg leading-relaxed">로그인하면 헤더에 병원 이름이 크게 표시되고, 환자에게 보내는 링크에도 병원 브랜드가 담깁니다.</p>
        <div class="mt-10 space-y-4">
          ${[
            ['fa-display', '상담 화면에서 그림 그리며 설명'],
            ['fa-paper-plane', '오늘 설명한 자료를 환자에게 전송'],
            ['fa-infinity', '모든 기능 영원히 무료'],
          ].map(([icon, text]) => `
          <div class="flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><i class="fas ${icon} text-brand-200"></i></div>
            <p class="text-white font-semibold text-lg">${text}</p>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- 우측 폼 -->
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-md">
        <a href="/" class="inline-flex items-center gap-2 text-slate-400 font-semibold mb-8 hover:text-slate-600"><i class="fas fa-arrow-left"></i>라이브러리로</a>
        <h2 class="text-3xl font-extrabold text-slate-900">${mode === 'login' ? '병원 로그인' : '병원 계정 만들기'}</h2>
        <p class="mt-2 text-slate-500">${mode === 'login' ? '상담·업로드·전송 기능을 사용하려면 로그인하세요' : '1분이면 됩니다. 무료이고, 계속 무료입니다.'}</p>

        <form id="auth-form" class="mt-8 space-y-4" onsubmit="return submitForm(event)">
          ${mode === 'signup' ? `
          <div><label class="block text-sm font-bold text-slate-600 mb-1.5">병원 이름</label>
            <input name="clinic_name" required placeholder="예: 서울비디치과" class="w-full h-14 px-4 rounded-2xl border border-slate-200 bg-white text-lg focus:outline-none focus:ring-4 focus:ring-brand-200 focus:border-brand-400"></div>
          <div><label class="block text-sm font-bold text-slate-600 mb-1.5">이름</label>
            <input name="name" required placeholder="원장님 성함" class="w-full h-14 px-4 rounded-2xl border border-slate-200 bg-white text-lg focus:outline-none focus:ring-4 focus:ring-brand-200 focus:border-brand-400"></div>
          <div><label class="block text-sm font-bold text-slate-600 mb-1.5">병원 전화번호 <span class="text-slate-400 font-normal">(선택)</span></label>
            <input name="phone" placeholder="02-0000-0000" class="w-full h-14 px-4 rounded-2xl border border-slate-200 bg-white text-lg focus:outline-none focus:ring-4 focus:ring-brand-200 focus:border-brand-400"></div>
          ` : ''}
          <div><label class="block text-sm font-bold text-slate-600 mb-1.5">이메일</label>
            <input name="email" type="email" required placeholder="doctor@clinic.com" class="w-full h-14 px-4 rounded-2xl border border-slate-200 bg-white text-lg focus:outline-none focus:ring-4 focus:ring-brand-200 focus:border-brand-400"></div>
          <div><label class="block text-sm font-bold text-slate-600 mb-1.5">비밀번호</label>
            <input name="password" type="password" required minlength="6" placeholder="6자 이상" class="w-full h-14 px-4 rounded-2xl border border-slate-200 bg-white text-lg focus:outline-none focus:ring-4 focus:ring-brand-200 focus:border-brand-400"></div>
          <button class="btn-touch w-full h-14 rounded-2xl bg-brand-600 text-white text-lg font-extrabold shadow-xl shadow-brand-600/30 hover:bg-brand-700 transition">
            ${mode === 'login' ? '로그인' : '무료로 시작하기'}</button>
        </form>

        <p class="mt-6 text-center text-slate-500">
          ${mode === 'login'
            ? `처음이신가요? <button onclick="switchMode('signup')" class="text-brand-600 font-bold">병원 계정 만들기</button>`
            : `이미 계정이 있으신가요? <button onclick="switchMode('login')" class="text-brand-600 font-bold">로그인</button>`}
        </p>
        ${mode === 'login' ? `
        <div class="mt-8 p-4 rounded-2xl bg-brand-50 border border-brand-100 text-sm text-brand-800">
          <p class="font-bold mb-1"><i class="fas fa-flask mr-1"></i>데모 계정으로 둘러보기</p>
          <p>병원: <b>demo@clinic.com</b> / demo1234</p>
          <p>운영자: <b>admin@patientconnect.kr</b> / admin1234</p>
        </div>` : ''}
      </div>
    </div>
  </div>`
}

window.switchMode = (m) => { mode = m; render() }

window.submitForm = async (e) => {
  e.preventDefault()
  const fd = new FormData(e.target)
  const body = Object.fromEntries(fd.entries())
  try {
    await axios.post(mode === 'login' ? '/api/auth/login' : '/api/auth/signup', body)
    location.href = '/'
  } catch (err) {
    PC.toast(err.response?.data?.error || '오류가 발생했습니다', 'err')
  }
  return false
}

render()
