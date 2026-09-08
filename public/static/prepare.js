const qp = new URLSearchParams(location.search),
  P = {
    tab: qp.get("tab") || "prepare",
    session: null,
    sets: [],
    feedback: [],
    recent: [],
    saver: null,
    drag: null,
  };
const emptyDraft = () => ({
  id: null,
  version: 1,
  client_key: crypto.randomUUID(),
  status: "draft",
  patient_label: "",
  internal_note: "",
  schedule_note: "",
  slides: [],
});
async function init() {
  try {
    await PC.loadMe();
    if (!PC.user?.clinic_id) {
      location.href = "/login";
      return;
    }
    const [sets, recent, feedback] = await Promise.all([
      axios.get("/api/sets"),
      axios.get("/api/sessions"),
      axios.get("/api/feedback"),
    ]);
    P.sets = sets.data.sets;
    P.recent = recent.data.sessions;
    P.feedback = feedback.data.feedback;
    const id = Number(qp.get("session")) || PC.currentDraft();
    if (id) {
      try {
        P.session = (await axios.get("/api/sessions/" + id)).data.session;
        PC.rememberDraft(id);
      } catch (e) {
        if (e.response?.status !== 404) throw e;
        PC.rememberDraft(null);
      }
    }
    P.session ||= emptyDraft();
    for (const s of P.session.slides) {
      if (!s.asset) {
        try {
          s.asset = (await axios.get("/api/assets/" + s.asset_id)).data.asset;
        } catch {
          s.asset = {
            id: s.asset_id,
            title: "원본 자료를 찾을 수 없습니다",
            type: "image",
            payload: {},
            media_urls: [],
          };
        }
      }
    }
    installSaver();
    render();
    if (qp.has("review")) previewDelivery();
  } catch (e) {
    PC.error(e);
    document.getElementById("app").innerHTML = PC.empty(
      "작업 공간을 열지 못했습니다.",
      "연결을 확인하고 새로고침해 주세요.",
    );
  }
}
function installSaver() {
  P.saver?.dispose();
  P.saver = new PC.DraftSaver({
    read: () => ({
      ...P.session,
      slides: P.session.slides.map((s) => ({ ...s, asset: undefined })),
    }),
    onSaved: (data) => {
      P.session.id = data.id;
      P.session.version = data.version;
      PC.rememberDraft(data.id);
      P.session.slides.forEach((s) => {
        const saved = data.slides.find(
          (x) => x.asset_id === s.asset_id && x.sub_index === s.sub_index,
        );
        if (saved) s.asset = saved.asset;
      });
      if (P.tab === "prepare")
        history.replaceState(null, "", "/prepare?session=" + data.id);
    },
    onState: saveState,
    onConflict: () =>
      PC.toast(
        "다른 화면의 변경과 충돌했습니다. 현재 입력은 유지됩니다.",
        "err",
      ),
  });
}
function saveState(state) {
  const labels = {
    dirty: "변경사항 저장 대기",
    saving: "서버에 저장 중…",
    saved: "서버에 저장 완료",
    offline: "연결 끊김 · 화면을 닫지 마세요",
    error: "저장 실패 · 다시 시도해 주세요",
    conflict: "다른 화면에서 변경됨 · 현재 입력 유지",
  };
  const el = document.getElementById("draft-save-state");
  if (el) {
    el.textContent = labels[state];
    el.dataset.state = state;
  }
  document
    .getElementById("draft-recovery")
    ?.classList.toggle(
      "hidden",
      !["error", "offline", "conflict"].includes(state),
    );
}
function change() {
  P.saver.mark();
}
window.setPrepTab = async (tab) => {
  try {
    await P.saver.flush();
    P.tab = tab;
    history.replaceState(
      null,
      "",
      "/prepare?tab=" + tab + (P.session.id ? "&session=" + P.session.id : ""),
    );
    render();
  } catch (e) {
    PC.error(e);
  }
};
function render() {
  const tab = P.tab;
  document.getElementById("app").innerHTML = PC.shell(
    tab === "followup" ? "followup" : "prepare",
    `<main id="main-content" class="page fade-in">${PC.heading("CONSULTATION FLOW", tab === "followup" ? "상담 이후의 질문도 놓치지 않게." : tab === "sets" ? "우리 병원의 좋은 설명을, 반복 가능하게." : "오늘의 상담을 준비하세요.", tab === "followup" ? "환자의 이해 확인과 추가 질문을 확인하고 처리합니다." : "자료를 담고 순서를 정리한 뒤, 함께 보고 전달합니다.", `<button class="btn-ghost" onclick="newPatient()"><i class="fas fa-plus"></i>새 환자 상담</button>`)}<nav class="tab-bar"><button class="tab ${tab === "prepare" ? "on" : ""}" onclick="setPrepTab('prepare')">01 상담 준비</button><button class="tab ${tab === "sets" ? "on" : ""}" onclick="setPrepTab('sets')">병원 상담 세트</button><button class="tab ${tab === "followup" ? "on" : ""}" onclick="setPrepTab('followup')">후속 확인 <span class="badge badge-accent">${P.feedback.filter((f) => f.status === "open").length}</span></button></nav><div id="prep-body"></div>${PC.footer()}</main>`,
  );
  if (tab === "sets") renderSets();
  else if (tab === "followup") renderFeedback();
  else renderPrepare();
}
function renderPrepare() {
  const s = P.session;
  document.getElementById("prep-body").innerHTML =
    `<div class="flow-steps"><b>01 준비</b><span>자료 선택·순서 정리</span><i class="fas fa-arrow-right"></i><span>02 함께 설명</span><i class="fas fa-arrow-right"></i><span>03 전달 확인</span></div><div class="prep-grid"><section><div class="row spread wrap" style="margin:22px 0 14px"><h2 class="section-title">오늘 상담에 담은 자료 <span class="badge badge-accent">${s.slides.length}장</span></h2><div class="row"><a class="btn-ghost btn-sm" href="/">자료 추가</a><button class="btn-ghost btn-sm" onclick="saveAsSet()">세트로 저장</button></div></div><div id="selected-materials">${selectionHTML()}</div>${s.slides.length ? '<p class="help-note" style="margin-top:12px">끌어서 순서를 바꾸거나 위·아래 버튼을 사용하세요. 체크된 자료만 환자에게 전달됩니다.</p>' : ""}<div class="row wrap" style="margin-top:20px"><button class="btn-primary btn-lg" id="start-consult" onclick="startConsult()" ${!s.slides.length ? "disabled" : ""}>함께 설명하기 <i class="fas fa-arrow-right"></i></button><button class="btn-ghost" onclick="previewDelivery()" ${!s.slides.length ? "disabled" : ""}>전송 전 미리보기</button></div></section><aside class="stack"><section class="panel"><h2 class="panel-heading">상담 기본 정보</h2><div class="stack" style="margin-top:18px"><label class="field">환자 표시명<input id="prep-patient-label" class="input" maxlength="100" value="${PC.esc(s.patient_label)}" placeholder="예: 김○○님" oninput="P.session.patient_label=this.value;change()"></label><label class="field">환자에게 전달할 다음 안내<textarea id="prep-schedule" class="input" maxlength="2000" rows="3" oninput="P.session.schedule_note=this.value;change()">${PC.esc(s.schedule_note)}</textarea></label><label class="field internal-label"><i class="fas fa-lock"></i>병원 내부 메모<textarea id="prep-internal-note" class="input" maxlength="4000" rows="3" oninput="P.session.internal_note=this.value;change()">${PC.esc(s.internal_note)}</textarea><small>이 메모는 환자 안내장에 포함되지 않습니다.</small></label></div><div class="save-line"><span id="draft-save-state">${s.id ? "서버에 저장된 상담" : "변경하면 초안이 자동 저장됩니다"}</span><button class="btn-link" onclick="retrySave()">지금 저장</button></div><div id="draft-recovery" class="hidden notice"><div>현재 입력은 화면에 유지됩니다.<div class="row wrap"><button class="btn-link" onclick="reloadDraft()">서버 내용 다시 불러오기</button><button class="btn-link" onclick="forkDraft()">별도 상담으로 저장</button></div></div></div></section><section class="panel"><h2 class="panel-heading">최근 상담 이어하기</h2>${
      P.recent
        .slice(0, 5)
        .map(
          (r) =>
            `<a class="recent-consult" href="/prepare?session=${r.id}"><span><b>${PC.esc(r.patient_label || "표시명 없는 상담")}</b><small>${PC.date(r.updated_at)} · ${r.slide_count || 0}장</small></span><span class="badge ${r.status === "draft" ? "badge-warn" : "badge-neutral"}">${r.status === "draft" ? "초안" : "저장됨"}</span></a>`,
        )
        .join("") || '<p class="help-note">첫 상담을 만들어 보세요.</p>'
    }</section></aside></div>`;
  bindDrag();
}
function selectionHTML() {
  return P.session.slides.length
    ? P.session.slides
        .map(
          (s, i) =>
            `<article class="selected-row" draggable="true" data-index="${i}"><span class="drag-handle" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span><span class="selection-number">${String(i + 1).padStart(2, "0")}</span><div class="grow"><b>${PC.esc(s.asset?.title || "자료")}</b><small>${PC.esc((s.asset?.payload?.steps || s.asset?.payload?.stages || [])[s.sub_index]?.title || "")} ${s.asset?.type === "compare" ? "· 원내 전용" : ""}</small>${s.asset ? PC.reviewBadge(s.asset) : ""}</div><label class="share-check"><input type="checkbox" ${s.include_in_share !== false && s.asset?.type !== "compare" ? "checked" : ""} ${s.asset?.type === "compare" ? "disabled" : ""} onchange="P.session.slides[${i}].include_in_share=this.checked;change()" aria-label="${PC.esc(s.asset?.title)} 환자 전송 포함">전송</label><div class="inline-actions"><button class="icon-btn" aria-label="위로 이동" onclick="moveItem(${i},-1)" ${i === 0 ? "disabled" : ""}><i class="fas fa-arrow-up"></i></button><button class="icon-btn" aria-label="아래로 이동" onclick="moveItem(${i},1)" ${i === P.session.slides.length - 1 ? "disabled" : ""}><i class="fas fa-arrow-down"></i></button><button class="icon-btn" aria-label="상담에서 빼기" onclick="removeItem(${i})"><i class="fas fa-xmark"></i></button></div></article>`,
        )
        .join("")
    : PC.empty(
        "오늘 설명할 자료를 담아보세요.",
        "라이브러리의 ‘상담에 담기’를 누르거나 병원 상담 세트를 사용하세요.",
        "fa-layer-group",
      );
}
function refreshSelection() {
  renderPrepare();
}
function bindDrag() {
  document.querySelectorAll(".selected-row").forEach((el) => {
    el.ondragstart = () => {
      P.drag = Number(el.dataset.index);
    };
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => {
      e.preventDefault();
      const target = Number(el.dataset.index);
      if (P.drag === null) return;
      const [item] = P.session.slides.splice(P.drag, 1);
      P.session.slides.splice(target, 0, item);
      P.drag = null;
      change();
      refreshSelection();
    };
  });
}
window.moveItem = (i, d) => {
  const target = i + d;
  if (target < 0 || target >= P.session.slides.length) return;
  const [s] = P.session.slides.splice(i, 1);
  P.session.slides.splice(target, 0, s);
  change();
  refreshSelection();
};
window.removeItem = (i) => {
  P.session.slides.splice(i, 1);
  change();
  refreshSelection();
};
window.retrySave = () => PC.run(() => P.saver.flush());
window.reloadDraft = () =>
  PC.confirm(
    "서버 내용으로 다시 열까요?",
    "이 화면의 저장되지 않은 입력은 사라집니다.",
    () => location.reload(),
    "다시 열기",
  );
window.forkDraft = () =>
  PC.run(async () => {
    if (P.saver.sending) await P.saver.sending;
    for (const s of P.session.slides) {
      if (s.drawing_url) {
        const r = await fetch(s.drawing_url);
        if (!r.ok) throw new Error("판서를 불러오지 못했습니다.");
        const blob = await r.blob();
        s.drawing_png = await new Promise((resolve) => {
          const f = new FileReader();
          f.onload = () => resolve(f.result);
          f.readAsDataURL(blob);
        });
        s.drawing_url = null;
      }
    }
    P.session = {
      ...P.session,
      id: null,
      version: 1,
      client_key: crypto.randomUUID(),
      status: "draft",
    };
    installSaver();
    change();
    await P.saver.flush();
    render();
    PC.toast("별도 초안으로 보관했습니다.");
  });
window.newPatient = () =>
  PC.confirm(
    "새 환자 상담을 시작할까요?",
    "현재 상담을 먼저 서버에 저장한 뒤, 표시명·메모·자료를 모두 비웁니다.",
    async () => {
      await P.saver.flush();
      PC.rememberDraft(null);
      location.href = "/prepare?new=1";
    },
    "새 상담 시작",
  );
window.startConsult = () =>
  PC.run(async () => {
    const id = await P.saver.flush();
    if (!P.session.slides.length) return;
    const first = P.session.slides[0];
    location.href = `/consult/${first.asset_id}?session=${id || P.session.id}`;
  });
window.previewDelivery = () =>
  PC.run(async () => {
    await P.saver.flush();
    const s = P.session;
    P.previewVersion = s.version;
    if (
      !s.slides.some(
        (x) => x.include_in_share !== false && x.asset?.type !== "compare",
      )
    )
      throw new Error("환자에게 보낼 자료를 선택해 주세요.");
    PC.modal(
      "전송 전 확인",
      PC.patientPreviewHTML(
        (await axios.get(`/api/sessions/${s.id}/preview`)).data,
      ) +
        `<div class="notice green"><i class="fas fa-lock"></i>내부 메모는 서버에서 제외합니다. 열람·확인 응답은 치료 동의가 아닙니다.</div><label class="field" style="margin-top:18px">공유 기간<select id="prepare-share-days" class="input"><option value="7">7일</option><option value="30" selected>30일</option><option value="90">90일</option><option value="1">1일</option></select></label><label class="review-confirm"><input id="delivery-confirm" type="checkbox">환자에게 전달될 자료와 메모를 확인했습니다.</label>`,
      `<button class="btn-ghost" onclick="PC.closeModal()">돌아가기</button><button class="btn-primary" id="publish-prepared" onclick="publishPrepared()">확인 후 링크 생성</button>`,
    );
  });
window.publishPrepared = () =>
  PC.run(async () => {
    if (!document.getElementById("delivery-confirm").checked)
      throw new Error("전달할 내용을 확인해 주세요.");
    const btn = document.getElementById("publish-prepared");
    btn.disabled = true;
    try {
      await P.saver.flush();
      const { data } = await axios.post(`/api/sessions/${P.session.id}/share`, {
        days: Number(document.getElementById("prepare-share-days").value),
        version: P.previewVersion ?? P.session.version,
      });
      PC.rememberDraft(null);
      const url = location.origin + data.url;
      PC.modal(
        "환자 안내장이 준비되었습니다.",
        `<div class="stack"><p class="notice green">선택한 자료와 환자용 메모만 전달됩니다.</p><input class="input" readonly value="${PC.esc(url)}" onclick="this.select()"><a class="btn-ghost" href="${PC.url(data.url)}" target="_blank" rel="noopener">환자 안내장 열기</a><button class="btn-primary" id="copy-prepared-link">링크 복사</button><p class="help-note">이후 초안을 수정해도 이 안내장은 자동으로 바뀌지 않습니다. 다시 확인한 뒤 새 링크를 만들어 주세요.</p></div>`,
        "",
        true,
      );
      document.getElementById("copy-prepared-link").onclick = () =>
        PC.copy(url);
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  });
window.saveAsSet = () => {
  if (!P.session.slides.length) return PC.toast("먼저 자료를 담아주세요.");
  PC.modal(
    "상담 세트로 저장",
    `<form id="save-set-form" class="stack" onsubmit="createSet(event)"><label class="field">세트 이름<input name="title" class="input" required maxlength="150" placeholder="예: 임플란트 첫 상담"></label><label class="field">설명<textarea name="description" class="input" maxlength="500"></textarea></label><p class="notice green">자료와 설명 순서만 저장합니다. 환자 표시명·판서·내부 및 환자 메모는 복사하지 않습니다.</p></form>`,
    `<button class="btn-ghost" onclick="PC.closeModal()">취소</button><button class="btn-primary" form="save-set-form">세트 저장</button>`,
  );
};
window.createSet = (e) => {
  e.preventDefault();
  PC.run(async () => {
    await axios.post("/api/sets", {
      ...Object.fromEntries(new FormData(e.target)),
      items: P.session.slides.map((s) => ({
        asset_id: s.asset_id,
        sub_index: s.sub_index,
      })),
    });
    P.sets = (await axios.get("/api/sets")).data.sets;
    PC.closeModal();
    PC.toast("병원 상담 세트를 만들었습니다.");
  });
};
function renderSets() {
  document.getElementById("prep-body").innerHTML =
    `<div class="notice green"><i class="fas fa-layer-group"></i>상담 세트에는 자료 ID와 순서만 보관합니다. 환자별 내용은 새 상담에서 입력하세요.</div><div class="set-grid" style="margin-top:22px">${P.sets.map((s) => `<article class="panel"><span class="eyebrow subtle">CONSULTATION SET</span><h2 style="font-size:20px;margin:12px 0">${PC.esc(s.title)}</h2><p class="help-note">${PC.esc(s.description)}</p><p class="small muted" style="margin:15px 0">${s.items.length}장 · ${PC.date(s.updated_at)}</p><div class="row wrap"><button class="btn-primary" onclick="useSet(${s.id})">새 상담으로 사용</button><button class="btn-ghost" onclick="editSet(${s.id})">이름 수정</button><button class="icon-btn" onclick="deleteSet(${s.id})" aria-label="세트 삭제"><i class="fas fa-trash-can"></i></button></div></article>`).join("") || PC.empty("아직 병원 상담 세트가 없습니다.", "상담 준비 화면에서 자료를 담고 ‘세트로 저장’을 눌러보세요.")}</div>`;
}
window.useSet = (id) =>
  PC.confirm(
    "이 세트로 새 상담을 만들까요?",
    "진행 중인 상담을 먼저 저장합니다. 이전 환자 정보는 복사하지 않습니다.",
    async () => {
      await P.saver.flush();
      const set = P.sets.find((s) => s.id === id),
        next = emptyDraft();
      for (const item of set.items) {
        const a = (await axios.get("/api/assets/" + item.asset_id)).data.asset;
        next.slides.push({
          ...item,
          asset: a,
          note: "",
          internal_note: "",
          include_in_share: true,
        });
      }
      P.session = next;
      P.tab = "prepare";
      installSaver();
      change();
      await P.saver.flush();
      render();
    },
    "새 상담 만들기",
  );
window.editSet = (id) => {
  const s = P.sets.find((s) => s.id === id);
  PC.modal(
    "세트 이름·설명 수정",
    `<form id="edit-set-form" class="stack"><label class="field">이름<input class="input" name="title" value="${PC.esc(s.title)}" required maxlength="150"></label><label class="field">설명<textarea name="description" class="input" maxlength="500">${PC.esc(s.description)}</textarea></label><p class="help-note">순서는 세트를 새 상담으로 열어 정리한 뒤 새 세트로 저장할 수 있습니다.</p></form>`,
    `<button class="btn-ghost" onclick="PC.closeModal()">취소</button><button class="btn-primary" id="update-set">저장</button>`,
  );
  document.getElementById("update-set").onclick = () =>
    PC.run(async () => {
      const form = document.getElementById("edit-set-form");
      if (!form.reportValidity()) return;
      await axios.put("/api/sets/" + id, {
        ...s,
        ...Object.fromEntries(new FormData(form)),
      });
      P.sets = (await axios.get("/api/sets")).data.sets;
      PC.closeModal();
      renderSets();
    });
};
window.deleteSet = (id) =>
  PC.confirm(
    "이 세트를 삭제할까요?",
    "이미 생성한 환자 상담은 유지됩니다.",
    async () => {
      await axios.delete("/api/sets/" + id);
      P.sets = P.sets.filter((s) => s.id !== id);
      renderSets();
    },
    "삭제",
  );
function renderFeedback() {
  const labels = {
    understood: "내용 확인",
    question: "추가 설명 요청",
    schedule: "일정 문의",
  };
  document.getElementById("prep-body").innerHTML =
    `<div class="notice"><i class="fas fa-circle-info"></i>응답은 환자의 자기 보고이며, 치료 동의·예약 확정이 아닙니다. 긴급 문의 채널이 아닙니다.</div><div class="table-wrap" style="margin-top:22px"><table class="tbl"><thead><tr><th>상담 / 요청</th><th>환자 메시지</th><th>접수</th><th>상태</th><th>처리</th></tr></thead><tbody>${P.feedback.map((f) => `<tr><td><a class="table-title" href="/prepare?session=${f.session_id}">${PC.esc(f.patient_label || "표시명 없는 상담")}<small>${labels[f.kind]}</small></a></td><td style="white-space:pre-wrap;max-width:350px">${PC.esc(f.message || "추가 메시지 없음")}</td><td>${PC.datetime(f.updated_at)}</td><td><span class="badge ${f.status === "open" ? "badge-warn" : "badge-ok"}">${f.status === "open" ? "확인 필요" : "처리 완료"}</span></td><td><button class="btn-ghost btn-sm" onclick="resolveFeedback(${f.id},'${f.status === "open" ? "resolved" : "open"}')">${f.status === "open" ? "처리 완료" : "다시 열기"}</button></td></tr>`).join("") || '<tr><td colspan="5" style="padding:45px;text-align:center">아직 접수된 확인·질문이 없습니다.</td></tr>'}</tbody></table></div>`;
}
window.resolveFeedback = (id, status) =>
  PC.run(async () => {
    await axios.put("/api/feedback/" + id, { status });
    P.feedback = (await axios.get("/api/feedback")).data.feedback;
    render();
  });
addEventListener("beforeunload", (e) => {
  if (P.saver && (P.saver.revision > P.saver.ack || P.saver.pending)) {
    e.preventDefault();
    e.returnValue = "";
  }
});
addEventListener("online", () => {
  if (P.saver?.revision > P.saver?.ack) P.saver.flush().catch(() => {});
});
if (qp.has("new")) {
  PC.loadMe().then(() => {
    PC.rememberDraft(null);
    history.replaceState(null, "", "/prepare");
    init();
  });
} else init();
