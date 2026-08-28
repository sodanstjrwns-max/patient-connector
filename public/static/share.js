// 환자 전송 페이지 /p/{token} — 로그인 불필요 (v3 APPLE LIGHT)
const token = location.pathname.split('/').pop()

async function init() {
  let data
  try {
    const res = await axios.get(`/api/share/${token}`)
    data = res.data
  } catch (e) {
    document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div class="w-20 h-20 rounded-3xl card flex items-center justify-center float-y"><i class="fas fa-link-slash text-3xl text-[#c7c7cc]"></i></div>
      <h1 class="text-2xl font-bold text-[#1d1d1f]">링크가 유효하지 않습니다</h1>
      <p class="text-[#a1a1a6]">병원에 문의해 주세요</p>
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
      ${items.map((it) => `<figure class="rounded-xl overflow-hidden bg-[#f5f5f7] border border-black/5">
        <img src="${it.image}" class="w-full aspect-[4/3] object-cover" loading="lazy">
        <figcaption class="p-2 text-[13px] font-bold text-[#6e6e73]">${PC.esc(it.label ? it.label + ' ' : '') + PC.esc(it.title)}</figcaption>
      </figure>`).join('')}
    </div>`
  } else if (asset.type === 'cost') {
    media = `<div class="rounded-2xl border border-black/8 overflow-hidden">
      <table class="w-full text-[15px]">
        <tbody>${(p.rows || []).map((r, i) => `
          <tr class="${i ? 'border-t border-black/5' : ''}">
            <td class="px-4 py-3 font-semibold text-[#424245]">${PC.esc(r.item)}</td>
            <td class="px-4 py-3 text-right font-extrabold text-[#0071e3] whitespace-nowrap">${PC.esc(r.price)}</td>
            <td class="px-3 py-3 text-center text-xs"><span class="px-2 py-0.5 rounded-full font-bold ${r.insurance === '급여' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#f5f5f7] text-[#86868b]'}">${PC.esc(r.insurance)}</span></td>
          </tr>`).join('')}</tbody>
      </table>
      ${p.note ? `<p class="px-4 py-3 bg-[#fafafa] text-xs text-[#a1a1a6]">${PC.esc(p.note)}</p>` : ''}
    </div>`
  } else if (asset.type === 'faq') {
    media = `<div class="p-5 rounded-2xl border border-[#0071e3]/15" style="background:rgba(0,113,227,.05)">
      <p class="font-extrabold text-[#0071e3] text-lg">Q. ${PC.esc(p.question || asset.title)}</p>
      <p class="mt-2 text-[#424245] leading-relaxed">${PC.esc(p.answer || '')}</p>
    </div>`
  } else if (asset.media_urls?.length) {
    media = `<img src="${asset.media_urls[0]}" class="w-full rounded-2xl" loading="lazy">`
  }

  // 그린 그림 합성: 원본 위에 드로잉 PNG 오버레이
  const drawn = slide.drawing_png ? `
    <div class="relative rounded-2xl overflow-hidden bg-[#1d1d1f]">
      <img src="${PC.thumbOf(asset)}" class="w-full object-contain">
      <img src="${slide.drawing_png}" class="absolute inset-0 w-full h-full object-fill">
      <span class="absolute top-3 left-3 px-3 py-1.5 rounded-full text-white text-xs font-bold" style="background:linear-gradient(120deg,#0071e3,#5e5ce6)"><i class="fas fa-pen mr-1"></i>상담 중 그린 설명</span>
    </div>` : ''

  return `
  <section class="card p-5 sm:p-7 space-y-4 card-in">
    <div>
      <div class="flex items-center gap-2 flex-wrap">${PC.typeBadge(asset.type)}
        ${asset.reviewer_name ? `<span class="text-sm font-bold text-[#0071e3]"><i class="fas fa-user-doctor mr-1"></i>감수 ${PC.esc(asset.reviewer_name)}</span>` : ''}
      </div>
      <h2 class="mt-2 text-xl sm:text-2xl font-extrabold text-[#1d1d1f]">${PC.esc(asset.title)}</h2>
      ${asset.description ? `<p class="mt-1.5 text-[#6e6e73] leading-relaxed">${PC.esc(asset.description)}</p>` : ''}
    </div>
    ${drawn}
    ${media}
    ${slide.note ? `<div class="p-4 rounded-2xl bg-amber-50 border border-amber-200/60"><p class="text-sm font-bold text-amber-700 mb-1"><i class="fas fa-note-sticky mr-1"></i>원장님 메모</p><p class="text-[#424245]">${PC.esc(slide.note)}</p></div>` : ''}
  </section>`
}

function render(d) {
  const assetMap = {}
  d.assets.forEach((a) => (assetMap[a.id] = a))
  const slides = d.slides.filter((s) => assetMap[s.asset_id])
  const date = new Date(d.created_at + 'Z').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  document.getElementById('app').innerHTML = `
  <!-- 병원 브랜드 히어로 -->
  <header class="relative overflow-hidden bg-white border-b border-black/5">
    <div class="blob w-[300px] h-[300px] bg-[#5e5ce6]/12 -top-24 -right-16"></div>
    <div class="blob w-[260px] h-[260px] bg-[#0071e3]/10 -bottom-20 -left-16" style="animation-delay:-8s"></div>
    <div class="relative max-w-2xl mx-auto px-5 py-12 text-center">
      <div class="w-16 h-16 mx-auto rounded-[1.4rem] bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-xl shadow-[#5e5ce6]/30 float-y"><i class="fas fa-hand-holding-medical text-white text-2xl"></i></div>
      <h1 class="mt-5 text-3xl sm:text-4xl font-extrabold grad-text grad-animate">${PC.esc(d.clinic.name)}</h1>
      <p class="mt-3 text-[#1d1d1f] text-lg font-semibold">${d.patient_label ? PC.esc(d.patient_label) + ', ' : ''}오늘 설명드린 자료입니다</p>
      <p class="mt-1 text-[#a1a1a6] text-sm">${date} 상담</p>
    </div>
  </header>

  <main class="max-w-2xl mx-auto px-4 py-7 space-y-5">
    ${slides.length ? slides.map((s) => slideCard(s, assetMap[s.asset_id])).join('') : '<p class="text-center text-[#a1a1a6] py-10">표시할 자료가 없습니다</p>'}

    ${d.cautions.length ? `
    <section class="card p-5 sm:p-7 card-in">
      <h2 class="text-xl font-extrabold text-[#1d1d1f] flex items-center gap-2"><span class="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><i class="fas fa-triangle-exclamation text-amber-500"></i></span>꼭 지켜주세요</h2>
      <div class="mt-4 space-y-3">
        ${d.cautions.map((cu) => `
        <div class="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/50">
          <p class="font-extrabold text-[#1d1d1f]">${PC.esc(cu.title)}</p>
          ${cu.description ? `<p class="mt-1 text-[#6e6e73] text-[15px] leading-relaxed">${PC.esc(cu.description)}</p>` : ''}
        </div>`).join('')}
      </div>
    </section>` : ''}

    ${d.schedule_note ? `
    <section class="card p-5 sm:p-7 card-in">
      <h2 class="text-xl font-extrabold text-[#1d1d1f]"><i class="far fa-calendar-check text-[#0071e3] mr-2"></i>치료 일정</h2>
      <p class="mt-3 text-[#6e6e73] leading-relaxed">${PC.esc(d.schedule_note)}</p>
    </section>` : ''}

    <!-- 병원 정보 -->
    <section class="rounded-[28px] overflow-hidden card-in shadow-xl shadow-black/8" style="background:linear-gradient(135deg,#1d1d1f,#2c2c2e)">
      <div class="p-7 sm:p-8 text-center">
        <p class="font-extrabold text-2xl" style="background:linear-gradient(94deg,#64d2ff,#5e5ce6 60%,#bf5af2);-webkit-background-clip:text;background-clip:text;color:transparent">${PC.esc(d.clinic.name)}</p>
        ${d.clinic.address ? `<p class="mt-2 text-[#a1a1a6] text-sm"><i class="fas fa-location-dot mr-1"></i>${PC.esc(d.clinic.address)}</p>` : ''}
        ${d.clinic.phone ? `<a href="tel:${d.clinic.phone}" class="btn-touch btn-primary mt-5 inline-flex items-center gap-2 px-9 font-extrabold text-lg"><i class="fas fa-phone"></i>${PC.esc(d.clinic.phone)}</a>` : ''}
        ${d.clinic.emergency ? `<p class="mt-4 text-[#86868b] text-[13px] leading-relaxed max-w-md mx-auto">${PC.esc(d.clinic.emergency)}</p>` : ''}
      </div>
    </section>

    <div class="flex gap-2">
      <button onclick="shareLink()" class="btn-touch flex-1 btn-kakao"><i class="fas fa-comment mr-2"></i>카카오톡 공유</button>
      <button onclick="copyLink()" class="btn-touch flex-1 rounded-full bg-white shadow-md text-[#1d1d1f] font-extrabold hover:shadow-lg transition"><i class="fas fa-link mr-2"></i>링크 복사</button>
    </div>
    <p class="text-center text-xs text-[#c7c7cc] pt-2 pb-6">본 자료는 이해를 돕기 위한 설명자료입니다. 실제 치료는 진단에 따라 달라질 수 있습니다.</p>
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
