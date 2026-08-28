// 운영자 콘솔 — 공개 자료 등록/통계/정렬
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
  document.getElementById('app').innerHTML = `
  ${PC.headerHTML('admin')}
  <main class="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
    <h1 class="text-3xl font-extrabold text-slate-900 mb-6">운영자 콘솔</h1>
    <div class="grid grid-cols-3 gap-4 mb-8">
      ${[
        ['가입 병원', st.clinic_count, 'fa-hospital', 'brand'],
        ['상담 세션', st.session_count, 'fa-comments', 'sky'],
        ['공개 자료', st.assets.length, 'fa-folder-open', 'violet'],
      ].map(([label, val, icon, color]) => `
      <div class="bg-white rounded-3xl shadow-sm p-6">
        <div class="w-11 h-11 rounded-2xl bg-${color}-100 flex items-center justify-center mb-3"><i class="fas ${icon} text-${color}-600"></i></div>
        <p class="text-3xl font-extrabold text-slate-900">${val}</p>
        <p class="text-slate-400 font-semibold text-sm mt-0.5">${label}</p>
      </div>`).join('')}
    </div>

    <div class="bg-white rounded-3xl shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h2 class="text-xl font-extrabold text-slate-900">공개 라이브러리 자료</h2>
        <span class="text-sm text-slate-400">사용 횟수 순</span>
      </div>
      <table class="w-full">
        <thead><tr class="text-left text-sm text-slate-400 border-b border-slate-100">
          <th class="px-6 py-3 font-bold">자료</th><th class="px-3 py-3 font-bold">진료</th>
          <th class="px-3 py-3 font-bold text-right">사용</th><th class="px-3 py-3 font-bold text-right">전송</th>
          <th class="px-3 py-3 font-bold text-center">순서</th>
        </tr></thead>
        <tbody>
        ${st.assets.map((a) => `
        <tr class="border-b border-slate-50 hover:bg-slate-50/60">
          <td class="px-6 py-3"><a href="/consult/${a.id}" class="font-bold text-slate-800 hover:text-brand-600">${PC.esc(a.title)}</a></td>
          <td class="px-3 py-3 text-sm text-slate-500">${PC.esc(a.treatment_name || '-')}</td>
          <td class="px-3 py-3 text-right font-bold text-brand-700">${a.use_count}</td>
          <td class="px-3 py-3 text-right font-bold text-sky-600">${a.send_count}</td>
          <td class="px-3 py-3 text-center">
            <input type="number" value="${a.sort_order}" onchange="setOrder(${a.id}, this.value)" class="w-16 h-9 px-2 text-center rounded-lg border border-slate-200 text-sm">
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="mt-4 text-sm text-slate-400"><i class="fas fa-circle-info mr-1"></i>공개 자료 등록: 병원 계정처럼 상담 화면과 자료 API를 그대로 쓰되, 운영자 계정으로 업로드하면 is_public 지정이 가능합니다. (POST /api/assets, is_public: true)</p>
  </main>`
}

window.setOrder = async (id, order) => {
  await axios.put(`/api/assets/${id}`, { sort_order: parseInt(order) || 0 })
  PC.toast('노출 순서가 변경되었습니다')
}

init()
