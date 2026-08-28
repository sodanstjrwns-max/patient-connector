// 환자 전송 페이지 /p/{token} — 로그인 불필요 (v2 AURORA DARK)
const token = location.pathname.split('/').pop()

async function init() {
  let data
  try {
    const res = await axios.get(`/api/share/${token}`)
    data = res.data
  } catch (e) {
    document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div class="w-20 h-20 rounded-3xl glass flex items-center justify-center float-y"><i class="fas fa-link-slash text-3xl text-slate-500"></i></div>
      <h1 class="text-2xl font-bold text-white">링크가 유효하지 않습니다</h1>
      <p class="text-slate-500">병원에 문의해 주세요</p>
    </div>`
    return
  }
  render(data)
}

function slideCard(slide, asset) {
  const p = asset.payload || {}
  let media = ''
  if (asset.type === 'video') {
    media = `<video src="${asset.media_urls[0]}" class="w-full rounded-2xl" controls playsinline></video>`
  } else if (asset.type === 'steps' || asset.type === 'progression') {
    const items = p.steps || p.stages || []
    media = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      ${items.map((it) => `<figure class="rounded-xl overflow-hidden bg-white/5 border border-white/10">
        <img src="${it.image}" class="w-full aspect-[4/3] object-cover" loading="lazy">
        <figcaption class="p-2 text-[13px] font-bold text-slate-300">${PC.esc(it.label ? it.label + ' ' : '') + PC.esc(it.title)}</figcaption>
      </figure>`).join('')}
    </div>`
  } else if (asset.type === 'cost') {
    media = `<div class="rounded-2xl border border-white/10 overflow-hidden">
      <table class="w-full text-[15px]">
        <tbody>${(p.rows || []).map((r, i) => `
          <tr class="${i ? 'border-t border-white/5' : ''}">
            <td class="px-4 py-3 font-semibold text-slate-200">${PC.esc(r.item)}</td>
            <td class="px-4 py-3 text-right font-extrabold text-teal-300 whitespace-nowrap">${PC.esc(r.price)}</td>
            <td class="px-3 py-3 text-center text-xs"><span class="px-2 py-0.5 rounded-full font-bold ${r.insurance === '급여' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-slate-400'}">${PC.esc(r.insurance)}</span></td>
          </tr>`).join('')}</tbody>
      </table>
      ${p.note ? `<p class="px-4 py-3 bg-white/5 text-xs text-slate-500">${PC.esc(p.note)}</p>` : ''}
    </div>`
  } else if (asset.type === 'faq') {
    media = `<div class="p-5 rounded-2xl bg-teal-500/8 border border-teal-400/20" style="background:rgba(20,184,166,.08)">
      <p class="font-extrabold text-teal-300 text-lg">Q. ${PC.esc(p.question || asset.title)}</p>
      <p class="mt-2 text-slate-300 leading-relaxed">${PC.esc(p.answer || '')}</p>
    </div>`
  } else if (asset.media_urls?.length) {
    media = `<img src="${asset.media_urls[0]}" class="w-full rounded-2xl" loading="lazy">`
  }

  // 그린 그림 합성: 원본 위에 드로잉 PNG 오버레이
  const drawn = slide.drawing_png ? `
    <div class="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10">
      <img src="${PC.thumbOf(asset)}" class="w-full object-contain">
      <img src="${slide.drawing_png}" class="absolute inset-0 w-full h-full object-fill">
      <span class="absolute top-3 left-3 px-2.5 py-1 rounded-full btn-primary text-white text-xs font-bold" style="height:auto"><i class="fas fa-pen mr-1"></i>상담 중 그린 설명</span>
    </div>` : ''

  return `
  <section class="card rounded-3xl p-5 sm:p-7 space-y-4 card-in">
    <div>
      <div class="flex items-center gap-2 flex-wrap">${PC.typeBadge(asset.type)}
        ${asset.reviewer_name ? `<span class="text-sm font-bold text-teal-300"><i class="fas fa-user-doctor mr-1"></i>감수 ${PC.esc(asset.reviewer_name)}</span>` : ''}
      </div>
      <h2 class="mt-2 text-xl sm:text-2xl font-extrabold text-white">${PC.esc(asset.title)}</h2>
      ${asset.description ? `<p class="mt-1.5 text-slate-400 leading-relaxed">${PC.esc(asset.description)}</p>` : ''}
    </div>
    ${drawn}
    ${media}
    ${slide.note ? `<div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/20"><p class="text-sm font-bold text-amber-300 mb-1"><i class="fas fa-note-sticky mr-1"></i>원장님 메모</p><p class="text-slate-200">${PC.esc(slide.note)}</p></div>` : ''}
  </section>`
}

function render(d) {
  const assetMap = {}
  d.assets.forEach((a) => (assetMap[a.id] = a))
  const slides = d.slides.filter((s) => assetMap[s.asset_id])
  const date = new Date(d.created_at + 'Z').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  document.getElementById('app').innerHTML = `
  <!-- 병원 브랜드 히어로 -->
  <header class="relative overflow-hidden">
    <div class="absolute inset-0 opacity-40" style="background:radial-gradient(circle at 80% 10%, rgba(45,212,191,.25) 0, transparent 45%), radial-gradient(circle at 15% 80%, rgba(56,189,248,.18) 0, transparent 50%)"></div>
    <div class="relative max-w-2xl mx-auto px-5 py-12 text-center">
      <div class="w-16 h-16 mx-auto rounded-3xl glass-strong flex items-center justify-center pulse-glow"><i class="fas fa-hand-holding-medical text-teal-300 text-2xl"></i></div>
      <h1 class="mt-4 text-3xl sm:text-4xl font-extrabold grad-text">${PC.esc(d.clinic.name)}</h1>
      <p class="mt-2 text-slate-200 text-lg font-semibold">${d.patient_label ? PC.esc(d.patient_label) + ', ' : ''}오늘 설명드린 자료입니다</p>
      <p class="mt-1 text-slate-500 text-sm">${date} 상담</p>
    </div>
  </header>

  <main class="max-w-2xl mx-auto px-4 py-4 space-y-5">
    ${slides.length ? slides.map((s) => slideCard(s, assetMap[s.asset_id])).join('') : '<p class="text-center text-slate-500 py-10">표시할 자료가 없습니다</p>'}

    ${d.cautions.length ? `
    <section class="card rounded-3xl p-5 sm:p-7 card-in">
      <h2 class="text-xl font-extrabold text-white flex items-center gap-2"><span class="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><i class="fas fa-triangle-exclamation text-amber-400"></i></span>꼭 지켜주세요</h2>
      <div class="mt-4 space-y-3">
        ${d.cautions.map((cu) => `
        <div class="p-4 rounded-2xl bg-amber-500/8 border border-amber-400/15" style="background:rgba(245,158,11,.07)">
          <p class="font-extrabold text-slate-100">${PC.esc(cu.title)}</p>
          ${cu.description ? `<p class="mt-1 text-slate-400 text-[15px] leading-relaxed">${PC.esc(cu.description)}</p>` : ''}
        </div>`).join('')}
      </div>
    </section>` : ''}

    ${d.schedule_note ? `
    <section class="card rounded-3xl p-5 sm:p-7 card-in">
      <h2 class="text-xl font-extrabold text-white"><i class="far fa-calendar-check text-teal-300 mr-2"></i>치료 일정</h2>
      <p class="mt-3 text-slate-300 leading-relaxed">${PC.esc(d.schedule_note)}</p>
    </section>` : ''}

    <!-- 병원 정보 -->
    <section class="grad-border rounded-3xl overflow-hidden card-in">
      <div class="glass-strong p-6 sm:p-7 text-center rounded-3xl">
        <p class="grad-text font-extrabold text-2xl">${PC.esc(d.clinic.name)}</p>
        ${d.clinic.address ? `<p class="mt-1.5 text-slate-400 text-sm"><i class="fas fa-location-dot mr-1"></i>${PC.esc(d.clinic.address)}</p>` : ''}
        ${d.clinic.phone ? `<a href="tel:${d.clinic.phone}" class="btn-touch btn-primary mt-4 inline-flex items-center gap-2 px-8 rounded-2xl font-extrabold text-lg"><i class="fas fa-phone"></i>${PC.esc(d.clinic.phone)}</a>` : ''}
        ${d.clinic.emergency ? `<p class="mt-4 text-slate-500 text-[13px] leading-relaxed max-w-md mx-auto">${PC.esc(d.clinic.emergency)}</p>` : ''}
      </div>
    </section>

    <div class="flex gap-2">
      <button onclick="shareLink()" class="btn-touch flex-1 rounded-2xl bg-[#FEE500] text-[#191919] font-extrabold"><i class="fas fa-comment mr-2"></i>카카오톡 공유</button>
      <button onclick="copyLink()" class="btn-touch flex-1 rounded-2xl glass text-slate-200 font-extrabold hover:bg-white/10"><i class="fas fa-link mr-2"></i>링크 복사</button>
    </div>
    <p class="text-center text-xs text-slate-600 pt-2 pb-6">본 자료는 이해를 돕기 위한 설명자료입니다. 실제 치료는 진단에 따라 달라질 수 있습니다.</p>
  </main>`
}

window.shareLink = () => {
  if (navigator.share) navigator.share({ title: '오늘 설명드린 자료', url: location.href })
  else copyLink()
}
window.copyLink = async () => {
  await navigator.clipboard.writeText(location.href)
  PC.toast('링크가 복사되었습니다')
}

init()
