// 운영자 콘솔 — 공개 자료 등록/통계/정렬 (v3 APPLE LIGHT)
const state = { stats: null, treatments: [] }

async function init() {
  await PC.loadMe()
  if (!PC.user || PC.user.role !== 'admin') { location.href = '/login'; return }
  const [s, t] = await Promise.all([axios.get('/api/admin/stats'), axios.get('/api/treatments')])
  state.stats = s.data
  state.treatments = t.data.treatments
  render()
}

function render() {
  const st = state.stats
  const statCard = ([label, val, icon, cls]) => `
    <div class="card card-hover p-6 card-in">
      <div class="w-11 h-11 rounded-2xl ${cls} flex items-center justify-center mb-3"><i class="fas ${icon}"></i></div>
      <p class="text-4xl font-extrabold text-[#1d1d1f] tracking-tight">${val}</p>
      <p class="text-[#a1a1a6] font-semibold text-sm mt-1">${label}</p>
    </div>`
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('admin')}
  <main class="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
    <h1 class="section-title text-[#1d1d1f] mb-7">운영자 <span class="grad-text-blue">콘솔</span></h1>
    <div class="grid grid-cols-3 gap-4 mb-8">
      ${[
        ['가입 병원', st.clinic_count, 'fa-hospital', 'bg-blue-50 text-[#0071e3]'],
        ['상담 세션', st.session_count, 'fa-comments', 'bg-violet-50 text-[#5e5ce6]'],
        ['공개 자료', st.assets.length, 'fa-folder-open', 'bg-pink-50 text-[#ff375f]'],
      ].map(statCard).join('')}
    </div>

    <div class="card overflow-hidden">
      <div class="px-6 py-5 border-b border-black/5 flex items-center justify-between">
        <h2 class="text-xl font-extrabold text-[#1d1d1f]">공개 라이브러리 자료</h2>
        <span class="text-sm text-[#a1a1a6]">사용 횟수 순</span>
      </div>
      <table class="w-full">
        <thead><tr class="text-left text-sm text-[#a1a1a6] border-b border-black/5">
          <th class="px-6 py-3 font-bold">자료</th><th class="px-3 py-3 font-bold">진료</th>
          <th class="px-3 py-3 font-bold text-right">사용</th><th class="px-3 py-3 font-bold text-right">전송</th>
          <th class="px-3 py-3 font-bold text-center">순서</th>
        </tr></thead>
        <tbody>
        ${st.assets.map((a) => `
        <tr class="border-b border-black/[0.03] hover:bg-[#f5f5f7]/70 transition">
          <td class="px-6 py-3"><a href="/consult/${a.id}" class="font-bold text-[#1d1d1f] hover:text-[#0071e3] transition">${PC.esc(a.title)}</a></td>
          <td class="px-3 py-3 text-sm text-[#6e6e73]">${PC.esc(a.treatment_name || '-')}</td>
          <td class="px-3 py-3 text-right font-bold text-[#0071e3]">${a.use_count}</td>
          <td class="px-3 py-3 text-right font-bold text-[#5e5ce6]">${a.send_count}</td>
          <td class="px-3 py-3 text-center">
            <input type="number" value="${a.sort_order}" onchange="setOrder(${a.id}, this.value)" class="input-light w-16 h-9 px-2 text-center text-sm">
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="mt-4 text-sm text-[#a1a1a6]"><i class="fas fa-circle-info mr-1"></i>공개 자료 등록: 병원 계정처럼 상담 화면과 자료 API를 그대로 쓰되, 운영자 계정으로 업로드하면 is_public 지정이 가능합니다. (POST /api/assets, is_public: true)</p>
  </main>`
}

window.setOrder = async (id, order) => {
  await axios.put(`/api/assets/${id}`, { sort_order: parseInt(order) || 0 })
  PC.toast('노출 순서가 변경되었습니다')
}

init()
