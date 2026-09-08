// Private patient handout. Token-scoped files are never cached by the service worker.
const token = location.pathname.split("/").pop();
let viewData = null;
async function init() {
  try {
    const { data } = await axios.get(`/api/share/${encodeURIComponent(token)}`);
    viewData = data;
    render(data);
    const mark = () => {
      const doc = document.documentElement,
        max = doc.scrollHeight - innerHeight;
      document.getElementById("reading-progress").style.width =
        (max > 0 ? Math.min(100, (scrollY / max) * 100) : 100) + "%";
    };
    addEventListener("scroll", mark, { passive: true });
    mark();
    let visitor;
    try {
      visitor = sessionStorage.getItem("pc_visitor");
      if (!visitor) {
        visitor = crypto.randomUUID();
        sessionStorage.setItem("pc_visitor", visitor);
      }
    } catch {
      visitor = crypto.randomUUID();
    }
    // Analytics failure must never interrupt reading. The owning clinic's preview is ignored server-side.
    axios.post(`/api/share/${token}/view`, { visitor }).catch(() => {});
  } catch (e) {
    document.getElementById("app").innerHTML =
      `<main id="main-content" class="patient-main" style="padding-top:100px">${PC.empty("상담 안내를 열 수 없습니다.", e.response?.status === 404 ? "공유 기간이 지났거나 병원에서 공유를 종료했습니다. 병원에 새 링크를 요청해 주세요." : "일시적인 연결 문제입니다. 잠시 후 다시 시도해 주세요.", "fa-link-slash")}</main>`;
  }
}
function slideCard(s, index) {
  const a = s.asset,
    p = a.payload || {},
    items = p.steps || p.stages || [],
    it = items[s.sub_index] || {},
    img = it.image || a.media_urls?.[s.sub_index] || PC.thumbOf(a);
  let media = "";
  if (a.type === "video")
    media = `<div class="patient-media"><video src="${PC.url(a.media_urls?.[s.sub_index] || a.media_urls?.[0])}" controls playsinline preload="metadata" style="height:100%;width:100%;object-fit:contain"></video></div>`;
  else if (a.type === "cost")
    media = `<div class="stage-document"><table><tbody>${(p.rows || []).map((r) => `<tr><td>${PC.esc(r.item)}${r.note ? `<small style="display:block;font-size:10px;color:var(--ink-3)">${PC.esc(r.note)}</small>` : ""}</td><td>${PC.esc(r.price)}</td><td><span class="badge badge-neutral">${PC.esc(r.insurance)}</span></td></tr>`).join("")}</tbody></table><p class="cost-note">${PC.esc(p.note || "정확한 치료 비용은 진단 후 병원에서 안내드립니다.")}</p></div>`;
  else if (a.type === "faq")
    media = `<div class="stage-document"><p style="font-weight:650;margin-bottom:12px;color:var(--accent)">Q. ${PC.esc(p.question || a.title)}</p><p>${PC.esc(p.answer || "")}</p></div>`;
  else
    media = `<div class="patient-media"><img src="${PC.url(img)}" alt="${PC.esc(it.title || a.title)}" loading="lazy">${s.drawing_url || s.drawing_png ? `<img class="drawing-overlay" src="${PC.url(s.drawing_url || s.drawing_png)}" alt="상담 중 의료진이 그린 설명" loading="lazy">` : ""}</div>`;
  return `<article class="patient-card" id="guide-${index + 1}"><header class="patient-card-head"><div class="row spread">${PC.typeBadge(a.type)}<span class="eyebrow subtle">GUIDE ${String(index + 1).padStart(2, "0")}</span></div><h2>${PC.esc(a.title)}${items.length > 1 ? `<span style="display:block;font-size:14px;margin-top:5px;color:var(--accent)">${String(s.sub_index + 1).padStart(2, "0")}. ${PC.esc(it.title || "")}</span>` : ""}</h2><p>${PC.esc(it.desc || a.description || "")}</p></header>${media}${s.note ? `<aside class="patient-note"><b><i class="far fa-comment-dots"></i> &nbsp;상담 중 전해드린 메모</b>${PC.esc(s.note)}</aside>` : ""}<footer class="patient-card-foot"><span><i class="fas fa-user-doctor"></i> &nbsp;${PC.esc(a.reviewer_name || "작성자 미지정")} · ${PC.reviewBadge(a)}</span>${s.drawing_url || s.drawing_png ? '<span><i class="fas fa-pen"></i> 상담 판서 포함</span>' : "<span>진료 이해를 돕는 설명자료</span>"}</footer></article>`;
}
function render(d) {
  const phone = (d.clinic.phone || "").replace(/[^0-9+]/g, "");
  document.getElementById("app").innerHTML =
    `<div class="reading-progress" id="reading-progress"></div><header class="patient-top"><div class="patient-brand">${PC.mark()}<span>${PC.esc(d.clinic.name)}</span></div><span class="eyebrow subtle" style="font-size:8px">YOUR PERSONAL CARE GUIDE</span></header><main class="patient-main fade-in" id="main-content"><section class="patient-intro"><span class="eyebrow" style="color:var(--accent)">A NOTE FROM YOUR CLINIC</span><h1>${d.patient_label ? PC.esc(d.patient_label) + ",<br>" : ""}오늘의 설명을<br>천천히 다시 살펴보세요.</h1><p>상담하며 함께 본 자료와 꼭 기억하실 내용을 담았습니다.<br>궁금한 점이 생기면 언제든 병원에 문의해 주세요.</p><div class="intro-meta"><span><i class="far fa-calendar"></i> ${PC.date(d.created_at, true)} 상담</span><span>${d.slides.length}개의 설명</span><span>${PC.date(d.expires_at)}까지 열람 가능</span></div></section><div class="patient-content">${d.slides.map(slideCard).join("") || PC.empty("표시할 설명자료가 없습니다.", "병원에 문의해 주세요.")}${d.cautions.length ? `<aside class="patient-cautions"><h2><i class="fas fa-leaf"></i> &nbsp;함께 기억해 주세요.</h2><ul>${d.cautions.map((c) => `<li><b>${PC.esc(c.title)}</b>${c.description ? `<p>${PC.esc(c.description)}</p>` : ""}</li>`).join("")}</ul></aside>` : ""}${feedbackForm()}${d.schedule_note ? `<section class="patient-card"><div class="patient-card-head"><span class="eyebrow" style="color:var(--accent)">WHAT COMES NEXT</span><h2>다음 진료를 위한 안내</h2><p>${PC.esc(d.schedule_note)}</p></div></section>` : ""}<section class="patient-contact"><span class="eyebrow" style="font-size:9px;color:#a6bc97">WE ARE HERE FOR YOU</span><h2 style="margin-top:10px">${PC.esc(d.clinic.name)}</h2>${d.clinic.address ? `<p>${PC.esc(d.clinic.address)}</p>` : ""}${phone ? `<a class="btn" href="tel:${PC.esc(phone)}"><i class="fas fa-phone"></i>${PC.esc(d.clinic.phone)}</a>` : ""}${d.clinic.emergency_info ? `<p>${PC.esc(d.clinic.emergency_info)}</p>` : ""}</section></div><div class="patient-actions no-print"><button class="btn-ghost" onclick="PC.copy(location.href)"><i class="fas fa-link"></i>링크 복사</button><button class="btn-ghost" onclick="PC.share(location.href)"><i class="fas fa-share-nodes"></i>기기로 공유</button></div><p class="patient-disclaimer">이 안내는 상담 내용을 이해하는 데 도움을 드리기 위한 자료입니다.<br>개인의 진단에 따라 실제 치료 계획이 달라질 수 있습니다.<br>개인 상담 정보가 포함되어 있으므로 다른 사람에게 공유할 때 주의해 주세요.</p>${PC.footer()}</main>`;
}
init();

function feedbackForm() {
  return `<section class="patient-card feedback-card"><div class="patient-card-head"><span class="eyebrow">LET US KNOW</span><h2>설명은 충분히 이해되셨나요?</h2><p>추가로 궁금한 점을 병원에 남겨 주세요.<br>이 응답은 치료 동의나 예약 확정이 아닙니다. 긴급한 증상은 병원에 전화로 문의하세요.</p></div><form id="patient-feedback-form" class="stack" style="padding:0 24px 24px" onsubmit="submitFeedback(event)"><label class="field">전달할 내용<select id="feedback-kind" class="input"><option value="understood">내용을 확인했어요</option><option value="question">설명이 더 필요한 부분이 있어요</option><option value="schedule">다음 일정에 관해 문의하고 싶어요</option></select></label><label class="field">추가 메시지 (선택)<textarea id="feedback-message" class="input" rows="3" maxlength="500" placeholder="주민등록번호·연락처 등 불필요한 개인정보는 입력하지 마세요"></textarea></label><button id="feedback-submit" class="btn-primary">병원에 전달하기</button><p id="feedback-status" class="help-note" role="status"></p></form></section>`;
}
window.submitFeedback = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("feedback-submit"),
    status = document.getElementById("feedback-status");
  btn.disabled = true;
  try {
    let visitor;
    try {
      visitor = sessionStorage.getItem("pc_visitor");
      if (!visitor) {
        visitor = crypto.randomUUID();
        sessionStorage.setItem("pc_visitor", visitor);
      }
    } catch {
      visitor = crypto.randomUUID();
    }
    const { data } = await axios.post(`/api/share/${token}/feedback`, {
      visitor,
      kind: document.getElementById("feedback-kind").value,
      message: document.getElementById("feedback-message").value,
    });
    status.textContent = data.message;
    status.style.color = "var(--accent)";
    PC.toast("병원 확인 목록에 전달했습니다.");
  } catch (err) {
    status.textContent =
      err.response?.data?.error || "전달하지 못했습니다. 다시 시도해 주세요.";
  } finally {
    btn.disabled = false;
  }
};
