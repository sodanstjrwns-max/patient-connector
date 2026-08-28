// 운영자 콘솔 — v4 CLINICAL WORKSPACE
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
  const statCard = ([label, val, icon]) => `
    <div class="card p-5 card-in">
      <div class="flex items-center justify-between">
        <p class="text-[12.5px] font-semibold text-[#71717a]">${label}</p>
        <i class="fas ${icon} text-[#a1a1aa] text-[13px]"></i>
      </div>
      <p class="mt-2 text-[28px] font-bold text-[#18181b] tracking-tight num" style="text-align:left">${val}</p>
    </div>`
  const main = `
  <main class="px-4 sm:px-8 py-6 max-w-[1100px]">
    <h1 class="text-[22px] font-bold tracking-tight text-[#18181b] mb-5">운영자 콘솔</h1>
    <div class="grid grid-cols-3 gap-4 mb-6">
      ${[
        ['가입 병원', st.clinic_count, 'fa-hospital'],
        ['상담 세션', st.session_count, 'fa-comments'],
        ['공개 자료', st.assets.length, 'fa-folder-open'],
      ].map(statCard).join('')}
    </div>

    <div class="card overflow-x-auto">
      <div class="px-5 py-4 border-b border-[#e4e4e7] flex items-center justify-between">
        <h2 class="text-[15px] font-bold text-[#18181b]">공개 라이브러리 자료</h2>
        <span class="text-[12px] text-[#a1a1aa]">사용 횟수 순</span>
      </div>
      <table class="tbl min-w-[640px]">
        <thead><tr>
          <th>자료</th><th>진료</th><th class="num">사용</th><th class="num">전송</th><th style="text-align:center">순서</th>
        </tr></thead>
        <tbody>
        ${st.assets.map((a) => `
        <tr>
          <td><a href="/consult/${a.id}" class="font-semibold text-[#18181b] hover:text-[#4f46e5] transition">${PC.esc(a.title)}</a></td>
          <td class="text-[#71717a]">${PC.esc(a.treatment_name || '-')}</td>
          <td class="num font-semibold">${a.use_count}</td>
          <td class="num font-semibold">${a.send_count}</td>
          <td style="text-align:center">
            <input type="number" value="${a.sort_order}" onchange="setOrder(${a.id}, this.value)" class="input w-16 h-8 px-2 text-center text-[12.5px]">
          </td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-[12.5px] text-[#a1a1aa]"><i class="fas fa-circle-info mr-1"></i>공개 자료 등록: 운영자 계정으로 업로드 시 is_public 지정 가능 (POST /api/assets, is_public: true)</p>
  </main>`
  document.getElementById('app').innerHTML = PC.shell('admin', main)
}

window.setOrder = async (id, order) => {
  await axios.put(`/api/assets/${id}`, { sort_order: parseInt(order) || 0 })
  PC.toast('노출 순서가 변경되었습니다')
}

init()
