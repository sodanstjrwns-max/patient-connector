// 운영자 콘솔 — 공개 자료 등록/통계/정렬 (v2 AURORA DARK)
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
    <div class="card rounded-3xl p-6 card-in">
      <div class="w-11 h-11 rounded-2xl ${cls} flex items-center justify-center mb-3"><i class="fas ${icon}"></i></div>
      <p class="text-3xl font-extrabold text-white">${val}</p>
      <p class="text-slate-400 font-semibold text-sm mt-0.5">${label}</p>
    </div>`
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('admin')}
  <main class="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-3xl font-extrabold text-white mb-6">운영자 콘솔</h1>
    <div class="grid grid-cols-3 gap-4 mb-8">
      ${[
        ['가입 병원', st.clinic_count, 'fa-hospital', 'bg-teal-500/15 text-teal-300'],
        ['상담 세션', st.session_count, 'fa-comments', 'bg-sky-500/15 text-sky-300'],
        ['공개 자료', st.assets.length, 'fa-folder-open', 'bg-violet-500/15 text-violet-300'],
      ].map(statCard).join('')}
    </div>

    <div class="glass rounded-3xl overflow-hidden">
      <div class="px-6 py-5 border-b border-white/10 flex items-center justify-between">
        <h2 class="text-xl font-extrabold text-white">공개 라이브러리 자료</h2>
        <span class="text-sm text-slate-500">사용 횟수 순</span>
      </div>
      <table class="w-full">
        <thead><tr class="text-left text-sm text-slate-400 border-b border-white/10">
          <th class="px-6 py-3 font-bold">자료</th><th class="px-3 py-3 font-bold">진료</th>
          <th class="px-3 py-3 font-bold text-right">사용</th><th class="px-3 py-3 font-bold text-right">전송</th>
          <th class="px-3 py-3 font-bold text-center">순서</th>
        </tr></thead>
        <tbody>
        ${st.assets.map((a) => `
        <tr class="border-b border-white/5 hover:bg-white/5">
          <td class="px-6 py-3"><a href="/consult/${a.id}" class="font-bold text-slate-100 hover:text-teal-300">${PC.esc(a.title)}</a></td>
          <td class="px-3 py-3 text-sm text-slate-400">${PC.esc(a.treatment_name || '-')}</td>
          <td class="px-3 py-3 text-right font-bold text-teal-300">${a.use_count}</td>
          <td class="px-3 py-3 text-right font-bold text-sky-300">${a.send_count}</td>
          <td class="px-3 py-3 text-center">
            <input type="number" value="${a.sort_order}" onchange="setOrder(${a.id}, this.value)" class="w-16 h-9 px-2 text-center rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-teal-400/50 focus:outline-none">
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="mt-4 text-sm text-slate-500"><i class="fas fa-circle-info mr-1"></i>공개 자료 등록: 병원 계정처럼 상담 화면과 자료 API를 그대로 쓰되, 운영자 계정으로 업로드하면 is_public 지정이 가능합니다. (POST /api/assets, is_public: true)</p>
  </main>`
}

window.setOrder = async (id, order) => {
  await axios.put(`/api/assets/${id}`, { sort_order: parseInt(order) || 0 })
  PC.toast('노출 순서가 변경되었습니다')
}

init()
