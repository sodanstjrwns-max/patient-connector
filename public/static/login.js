// 로그인 / 회원가입 — v4 CLINICAL WORKSPACE
let mode = 'login'
const SPECIALTIES = ['치과', '피부·미용', '성형외과', '정형·재활', '안과', '한방', '기타']
let pickedSpecialty = '치과'

function render() {
  document.getElementById('app').innerHTML = `
  <div class="min-h-screen flex items-center justify-center p-6 bg-[#f7f7f8]">
    <div class="w-full max-w-[400px] fade-in">
      <div class="flex items-center gap-2.5 mb-8">
        <div class="w-9 h-9 rounded-lg bg-[#4f46e5] flex items-center justify-center"><i class="fas fa-hand-holding-medical text-white text-sm"></i></div>
        <div>
          <p class="font-bold text-[15px] text-[#18181b] leading-tight">페이션트 커넥트</p>
          <p class="text-[11px] text-[#a1a1aa] leading-tight">진료 상담 설명 도구</p>
        </div>
      </div>

      <div class="card p-7">
        <h1 class="text-[20px] font-bold text-[#18181b]">${mode === 'login' ? '병원 로그인' : '병원 계정 만들기'}</h1>
        <p class="mt-1 text-[13.5px] text-[#71717a]">${mode === 'login' ? '상담 저장 · 자료 업로드 · 환자 전송' : '1분이면 됩니다. 무료이고, 계속 무료입니다.'}</p>

        <form id="auth-form" class="mt-6 space-y-3" onsubmit="return submitForm(event)">
          ${mode === 'signup' ? `
          <div>
            <label class="block text-[12.5px] font-semibold text-[#52525b] mb-1.5">병원 이름</label>
            <input name="clinic_name" required placeholder="예: 서울비디치과" class="input w-full h-10 px-3">
          </div>
          <div>
            <label class="block text-[12.5px] font-semibold text-[#52525b] mb-1.5">진료 분야 <span class="font-normal text-[#a1a1aa]">— 로그인하면 이 분야 자료가 자동으로 표시됩니다</span></label>
            <div class="flex flex-wrap gap-1.5" id="spec-chips">
              ${SPECIALTIES.map((sp) => `<button type="button" onclick="pickSpec('${sp}')" class="chip ${pickedSpecialty === sp ? 'on' : ''}">${sp}</button>`).join('')}
            </div>
          </div>
          <div>
            <label class="block text-[12.5px] font-semibold text-[#52525b] mb-1.5">원장님 성함</label>
            <input name="name" required placeholder="성함" class="input w-full h-10 px-3">
          </div>
          <div>
            <label class="block text-[12.5px] font-semibold text-[#52525b] mb-1.5">병원 전화번호 <span class="font-normal text-[#a1a1aa]">(선택)</span></label>
            <input name="phone" placeholder="02-0000-0000" class="input w-full h-10 px-3">
          </div>` : ''}
          <div>
            <label class="block text-[12.5px] font-semibold text-[#52525b] mb-1.5">이메일</label>
            <input name="email" type="email" required placeholder="you@clinic.com" class="input w-full h-10 px-3">
          </div>
          <div>
            <label class="block text-[12.5px] font-semibold text-[#52525b] mb-1.5">비밀번호</label>
            <input name="password" type="password" required minlength="6" placeholder="6자 이상" class="input w-full h-10 px-3">
          </div>
          <button class="btn-primary w-full !h-10 mt-1">${mode === 'login' ? '로그인' : '무료로 시작하기'}</button>
        </form>

        <p class="mt-5 text-center text-[13px] text-[#71717a]">
          ${mode === 'login'
            ? `처음이신가요? <button onclick="switchMode('signup')" class="text-[#4f46e5] font-semibold hover:underline">병원 계정 만들기</button>`
            : `이미 계정이 있으신가요? <button onclick="switchMode('login')" class="text-[#4f46e5] font-semibold hover:underline">로그인</button>`}
        </p>
      </div>

      ${mode === 'login' ? `
      <div class="mt-4 card p-4 text-[12.5px]">
        <p class="font-semibold text-[#18181b] mb-1.5"><i class="fas fa-flask text-[#4f46e5] mr-1"></i>데모 계정으로 둘러보기</p>
        <p class="text-[#71717a]">병원 <b class="text-[#18181b]">demo@clinic.com</b> / demo1234 &nbsp;·&nbsp; 운영자 <b class="text-[#18181b]">admin@patientconnect.kr</b> / admin1234</p>
      </div>` : ''}

      <p class="mt-5 text-center"><a href="/" class="text-[13px] text-[#a1a1aa] hover:text-[#4f46e5] transition"><i class="fas fa-arrow-left mr-1.5"></i>라이브러리로 돌아가기</a></p>
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
