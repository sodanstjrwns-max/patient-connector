// 환자 전송 페이지 /p/{token} — 로그인 불필요 (v4 CLINICAL WORKSPACE)
const token = location.pathname.split('/').pop()

async function init() {
  let data
  try {
    const res = await axios.get(`/api/share/${token}`)
    data = res.data
  } catch (e) {
    document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center">
      <div style="width:56px;height:56px;border-radius:14px;background:#fff;border:1px solid var(--line);display:flex;align-items:center;justify-content:center"><i class="fas fa-link-slash" style="color:var(--ink-3);font-size:20px"></i></div>
      <h1 style="font-size:20px;font-weight:700;color:var(--ink)">링크가 유효하지 않습니다</h1>
      <p style="color:var(--ink-3);font-size:14px">병원에 문의해 주세요</p>
    </div>`
    return
  }
  render(data)
}

function slideCard(slide, asset) {
  const p = asset.payload || {}
  let media = ''
  if (asset.type === 'video') {
    media = `<video src="${asset.media_urls[0]}" class="w-full rounded-lg border border-[#e4e4e7]" controls playsinline></video>`
  } else if (asset.type === 'steps' || asset.type === 'progression') {
    const items = p.steps || p.stages || []
    media = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      ${items.map((it) => `<figure class="rounded-lg overflow-hidden bg-[#f7f7f8] border border-[#e4e4e7]">
        <img src="${it.image}" class="w-full aspect-[4/3] object-cover" loading="lazy">
        <figcaption class="p-2 text-[12px] font-semibold text-[#52525b]">${PC.esc(it.label ? it.label + ' ' : '') + PC.esc(it.title)}</figcaption>
      </figure>`).join('')}
    </div>`
  } else if (asset.type === 'cost') {
    media = `<div class="rounded-lg border border-[#e4e4e7] overflow-hidden">
      <table class="w-full text-[14px]">
        <tbody>${(p.rows || []).map((r, i) => `
          <tr class="${i ? 'border-t border-[#f0f0f2]' : ''}">
            <td class="px-4 py-3 font-medium text-[#3f3f46]">${PC.esc(r.item)}</td>
            <td class="px-4 py-3 text-right font-bold text-[#18181b] whitespace-nowrap" style="font-variant-numeric:tabular-nums">${PC.esc(r.price)}</td>
            <td class="px-3 py-3 text-center"><span class="inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${r.insurance === '급여' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[#f7f7f8] text-[#71717a] border border-[#e4e4e7]'}">${PC.esc(r.insurance)}</span></td>
          </tr>`).join('')}</tbody>
      </table>
      ${p.note ? `<p class="px-4 py-2.5 bg-[#fafafa] border-t border-[#f0f0f2] text-[12px] text-[#a1a1aa]">${PC.esc(p.note)}</p>` : ''}
    </div>`
  } else if (asset.type === 'faq') {
    media = `<div class="p-4 rounded-lg bg-[#eef2ff] border border-[#c7d2fe]">
      <p class="font-bold text-[#4f46e5] text-[15px]">Q. ${PC.esc(p.question || asset.title)}</p>
      <p class="mt-2 text-[#3f3f46] text-[14px] leading-relaxed">${PC.esc(p.answer || '')}</p>
    </div>`
  } else if (asset.media_urls?.length) {
    media = `<img src="${asset.media_urls[0]}" class="w-full rounded-lg border border-[#e4e4e7]" loading="lazy">`
  }

  // 그린 그림 합성: 원본 위에 드로잉 PNG 오버레이
  const drawn = slide.drawing_png ? `
    <div class="relative rounded-lg overflow-hidden bg-[#18181b] border border-[#e4e4e7]">
      <img src="${PC.thumbOf(asset)}" class="w-full object-contain">
      <img src="${slide.drawing_png}" class="absolute inset-0 w-full h-full object-fill">
      <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md text-white text-[11px] font-semibold" style="background:#4f46e5"><i class="fas fa-pen mr-1"></i>상담 중 그린 설명</span>
    </div>` : ''

  return `
  <section class="bg-white rounded-[10px] border border-[#e4e4e7] p-5 sm:p-6 space-y-4">
    <div>
      <div class="flex items-center gap-2 flex-wrap">${PC.typeBadge(asset.type)}
        ${asset.reviewer_name ? `<span class="text-[12px] font-semibold text-[#4f46e5]"><i class="fas fa-user-doctor mr-1"></i>감수 ${PC.esc(asset.reviewer_name)}</span>` : ''}
      </div>
      <h2 class="mt-2 text-[18px] sm:text-[20px] font-bold text-[#18181b]">${PC.esc(asset.title)}</h2>
      ${asset.description ? `<p class="mt-1 text-[14px] text-[#52525b] leading-relaxed">${PC.esc(asset.description)}</p>` : ''}
    </div>
    ${drawn}
    ${media}
    ${slide.note ? `<div class="p-3.5 rounded-lg bg-amber-50 border border-amber-200"><p class="text-[12px] font-bold text-amber-700 mb-1"><i class="fas fa-note-sticky mr-1"></i>원장님 메모</p><p class="text-[14px] text-[#3f3f46]">${PC.esc(slide.note)}</p></div>` : ''}
  </section>`
}

function render(d) {
  const assetMap = {}
  d.assets.forEach((a) => (assetMap[a.id] = a))
  const slides = d.slides.filter((s) => assetMap[s.asset_id])
  const date = new Date(d.created_at + 'Z').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  document.getElementById('app').innerHTML = `
  <!-- 병원 헤더 -->
  <header class="bg-white border-b border-[#e4e4e7]">
    <div class="max-w-2xl mx-auto px-5 py-8 text-center">
      <div class="w-11 h-11 mx-auto rounded-[10px] flex items-center justify-center" style="background:#4f46e5"><i class="fas fa-hand-holding-medical text-white text-[18px]"></i></div>
      <h1 class="mt-3 text-[22px] sm:text-[24px] font-bold text-[#18181b]">${PC.esc(d.clinic.name)}</h1>
      <p class="mt-2 text-[15px] font-medium text-[#3f3f46]">${d.patient_label ? PC.esc(d.patient_label) + ', ' : ''}오늘 설명드린 자료입니다</p>
      <p class="mt-1 text-[12px] text-[#a1a1aa]">${date} 상담</p>
    </div>
  </header>

  <main class="max-w-2xl mx-auto px-4 py-6 space-y-4">
    ${slides.length ? slides.map((s) => slideCard(s, assetMap[s.asset_id])).join('') : '<p class="text-center text-[#a1a1aa] py-10 text-[14px]">표시할 자료가 없습니다</p>'}

    ${d.cautions.length ? `
    <section class="bg-white rounded-[10px] border border-[#e4e4e7] p-5 sm:p-6">
      <h2 class="text-[17px] font-bold text-[#18181b] flex items-center gap-2"><i class="fas fa-triangle-exclamation text-amber-500"></i>꼭 지켜주세요</h2>
      <div class="mt-3.5 space-y-2.5">
        ${d.cautions.map((cu) => `
        <div class="p-3.5 rounded-lg bg-amber-50 border border-amber-200">
          <p class="font-bold text-[14px] text-[#18181b]">${PC.esc(cu.title)}</p>
          ${cu.description ? `<p class="mt-1 text-[13px] text-[#52525b] leading-relaxed">${PC.esc(cu.description)}</p>` : ''}
        </div>`).join('')}
      </div>
    </section>` : ''}

    ${d.schedule_note ? `
    <section class="bg-white rounded-[10px] border border-[#e4e4e7] p-5 sm:p-6">
      <h2 class="text-[17px] font-bold text-[#18181b]"><i class="far fa-calendar-check text-[#4f46e5] mr-2"></i>치료 일정</h2>
      <p class="mt-2.5 text-[14px] text-[#52525b] leading-relaxed">${PC.esc(d.schedule_note)}</p>
    </section>` : ''}

    <!-- 병원 정보 -->
    <section class="rounded-[10px] overflow-hidden border border-[#e4e4e7]" style="background:#18181b">
      <div class="p-6 sm:p-7 text-center">
        <p class="font-bold text-[18px] text-white">${PC.esc(d.clinic.name)}</p>
        ${d.clinic.address ? `<p class="mt-2 text-[#a1a1aa] text-[13px]"><i class="fas fa-location-dot mr-1"></i>${PC.esc(d.clinic.address)}</p>` : ''}
        ${d.clinic.phone ? `<a href="tel:${d.clinic.phone}" class="mt-4 inline-flex items-center gap-2 px-7 py-3 rounded-[8px] font-bold text-[15px] text-white" style="background:#4f46e5"><i class="fas fa-phone"></i>${PC.esc(d.clinic.phone)}</a>` : ''}
        ${d.clinic.emergency ? `<p class="mt-4 text-[#71717a] text-[12px] leading-relaxed max-w-md mx-auto">${PC.esc(d.clinic.emergency)}</p>` : ''}
      </div>
    </section>

    <div class="flex gap-2">
      <button onclick="shareLink()" class="btn-kakao flex-1 py-3 rounded-[8px] font-bold text-[14px]"><i class="fas fa-comment mr-2"></i>카카오톡 공유</button>
      <button onclick="copyLink()" class="flex-1 py-3 rounded-[8px] bg-white border border-[#e4e4e7] text-[#18181b] font-bold text-[14px] hover:bg-[#fafafa] transition"><i class="fas fa-link mr-2"></i>링크 복사</button>
    </div>
    <p class="text-center text-[11px] text-[#c8c8cd] pt-2 pb-6">본 자료는 이해를 돕기 위한 설명자료입니다. 실제 치료는 진단에 따라 달라질 수 있습니다.</p>
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
