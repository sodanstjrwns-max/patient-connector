// Consultation Studio — stable 1200x800 annotation coordinates, per-step state.
const S = {
  assetId: Number(location.pathname.split("/").pop()),
  sub: 0,
  assets: new Map(),
  related: [],
  staffGuides: new Map(),
  slides: new Map(),
  session: {
    id: null,
    version: 1,
    client_key: crypto.randomUUID(),
    status: "draft",
    patient_label: "",
    schedule_note: "",
    internal_note: "",
  },
  saver: null,
  saveState: "saved",
  tool: "pen",
  color: "#d95f4c",
  size: 5,
  zoom: 1,
  panX: 0,
  panY: 0,
  panel: innerWidth >= 1024,
  dirty: false,
  busy: false,
  saving: false,
  history: new Map(),
  future: new Map(),
  cautions: [],
};
const keyOf = (id = S.assetId, sub = S.sub) => `${id}:${sub}`;
const asset = () => S.assets.get(S.assetId);
const slide = () => S.slides.get(keyOf());
const itemsOf = (a) =>
  a.payload?.steps ||
  a.payload?.stages ||
  ((["image", "video"].includes(a.type) ? a.media_urls : []) || []).map(
    (image, i) => ({ image, title: `자료 ${i + 1}` }),
  );
const drawable = () =>
  ["image", "steps", "progression", "compare"].includes(asset()?.type);
let canvas,
  ctx,
  stroke = null,
  restoreVersion = 0,
  resizeObserver;
function touch() {
  S.dirty = true;
  S.saver?.mark();
  status();
}
function status() {
  const el = document.getElementById("save-status");
  if (el)
    el.innerHTML = `<span class="save-dot ${!S.dirty ? "saved" : ""}"></span>${{ saving: "서버 저장 중…", offline: "연결 끊김 · 화면을 닫지 마세요", conflict: "다른 화면에서 변경됨", error: "저장 실패 · 다시 저장", dirty: "자동저장 대기" }[S.saveState] || (S.dirty ? "자동저장 대기" : "서버 저장 완료")}`;
  const count = document.getElementById("slide-count");
  if (count)
    count.textContent = `오늘 상담에 담은 자료 ${[...S.slides.values()].filter((s) => s._selected).length}장`;
}
async function init() {
  try {
    await PC.loadMe();
    const sessionId = new URLSearchParams(location.search).get("session");
    if (sessionId) {
      const { data } = await axios.get(`/api/sessions/${sessionId}`);
      S.session = { ...data.session };
      delete S.session.slides;
      for (const s of data.session.slides) {
        const sub = Number(s.sub_index) || 0;
        let a = s.asset;
        if (!a) {
          try {
            a = (await axios.get(`/api/assets/${s.asset_id}`)).data.asset;
          } catch {
            continue;
          }
        }
        S.assets.set(a.id, a);
        S.slides.set(keyOf(a.id, sub), {
          ...s,
          _selected: true,
          asset: a,
          sub_index: sub,
        });
      }
      const orderedFirst = [...S.slides.values()].find(
        (s) => s.asset_id === S.assetId,
      );
      if (orderedFirst) S.sub = orderedFirst.sub_index;
      if (!S.assets.has(S.assetId)) {
        const first = S.slides.values().next().value;
        if (first) {
          S.assetId = first.asset_id;
          S.sub = first.sub_index;
        }
      }
    }
    if (!S.assets.has(S.assetId))
      S.assets.set(
        S.assetId,
        (await axios.get(`/api/assets/${S.assetId}`)).data.asset,
      );
    if (!asset()) throw new Error("상담에 연결된 자료가 없습니다.");
    S.saver = new PC.DraftSaver({
      read: () => ({
        ...S.session,
        slides: [...S.slides.values()]
          .filter((s) => s._selected)
          .map((s) => ({
            asset_id: s.asset_id,
            sub_index: s.sub_index,
            note: s.note || "",
            internal_note: s.internal_note || "",
            include_in_share: s.include_in_share !== false,
            drawing_png: s.drawing_png || null,
            drawing_url: s.drawing_png ? null : s.drawing_url || null,
            aspect: 1.5,
          })),
      }),
      onState: (state) => {
        S.saveState = state;
        S.dirty = state !== "saved";
        status();
      },
      onSaved: (data, sent) => {
        S.session.id = data.id;
        S.session.version = data.version;
        PC.rememberDraft(data.id);
        for (const saved of data.slides) {
          const current = S.slides.get(keyOf(saved.asset_id, saved.sub_index)),
            source = sent.slides.find(
              (x) =>
                x.asset_id === saved.asset_id &&
                x.sub_index === saved.sub_index,
            );
          if (current && current.drawing_png === source?.drawing_png) {
            current.drawing_url = saved.drawing_url;
            current.drawing_png = null;
          }
          if (current) current.asset = saved.asset;
        }
        history.replaceState(
          null,
          "",
          `/consult/${S.assetId}?session=${data.id}`,
        );
      },
      onConflict: () =>
        PC.modal(
          "다른 화면에서 상담이 수정되었습니다.",
          '<p class="help-note">현재 입력은 화면에 남아 있습니다. 내용을 확인하고 새로 불러오세요. 이 화면을 닫으면 저장되지 않은 변경은 사라집니다.</p>',
          '<button class="btn-ghost" onclick="PC.closeModal()">현재 입력 유지</button><button class="btn-primary" onclick="location.reload()">서버 내용 다시 열기</button>',
          true,
        ),
    });
    render();
    await showSlide();
    await loadRelated();
    loadCautions();
    axios.post(`/api/assets/${S.assetId}/use`, {}).catch(() => {});
  } catch (e) {
    document.getElementById("app").innerHTML =
      `<main class="page" style="padding-top:100px;text-align:center;color:var(--ink)">${PC.empty("상담 화면을 열 수 없습니다.", e.response?.data?.error || e.message, "fa-lock")}<a href="/" class="btn-primary" style="margin-top:20px">라이브러리로 돌아가기</a></main>`;
    document.body.classList.remove("cinema");
  }
}
function render() {
  document.getElementById("app").innerHTML =
    `<main id="main-content" class="studio"><div id="studio-shell" style="display:contents"><header class="studio-header"><a class="icon-btn" href="/" title="라이브러리로 돌아가기" aria-label="라이브러리로 돌아가기"><i class="fas fa-arrow-left"></i></a><span class="header-brand">${PC.mark()}</span><nav class="studio-flow desktop-only"><button onclick="goPrepare()">01 준비</button><b>02 진행</b><button onclick="sendToPatient()">03 전달</button></nav><div class="grow"><h1 id="studio-title"></h1><p>${PC.esc(PC.user?.clinic_name || "Patient Connect")} &nbsp;·&nbsp; <span id="save-status"></span></p></div>${PC.user?.clinic_id ? '<button class="btn-ghost" id="save-button" onclick="saveSession()"><i class="far fa-floppy-disk"></i><span class="desktop-only">상담 </span>저장</button><button class="btn-primary" id="send-button" onclick="sendToPatient()"><i class="far fa-paper-plane"></i><span class="desktop-only">환자에게 </span>전송</button>' : '<a href="/login" class="btn-primary">로그인 후 저장</a>'}<button class="icon-btn" onclick="newStudioPatient()" title="새 환자 상담" aria-label="새 환자 상담"><i class="fas fa-user-plus"></i></button><button class="icon-btn desktop-only" onclick="toggleFullscreen()" title="전체화면" aria-label="전체화면"><i class="fas fa-expand"></i></button><button class="icon-btn" onclick="togglePanel()" title="설명·메모 패널" aria-label="설명 및 메모 패널"><i class="fas fa-table-columns"></i></button></header><div class="studio-body"><section class="stage-workspace" aria-label="상담 자료"><div class="stage-topline"><span id="stage-label"></span><div id="page-controls" class="studio-page-controls"></div></div><div class="stage-viewport" id="stage-viewport"><div class="stage-frame" id="stage-frame"><div class="stage-plane" id="stage-plane"><div class="stage-content" id="stage-content"></div><canvas class="stage-canvas" id="draw-canvas" width="1200" height="800" aria-label="상담 판서 영역"></canvas></div></div></div><nav class="studio-tools" id="studio-tools" aria-label="판서 도구"></nav><nav class="studio-filmstrip" id="filmstrip" aria-label="다른 설명자료"></nav></section><aside id="studio-panel" class="studio-panel ${S.panel ? "" : "hidden"}" aria-label="설명과 상담 메모"></aside></div></div></main>`;
  canvas = document.getElementById("draw-canvas");
  ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  canvas.addEventListener("pointerdown", drawStart);
  canvas.addEventListener("pointermove", drawMove);
  canvas.addEventListener("pointerup", drawEnd);
  canvas.addEventListener("pointercancel", drawEnd);
  const frame = document.getElementById("stage-frame");
  frame.addEventListener("pointerdown", panStart);
  frame.addEventListener("pointermove", panMove);
  frame.addEventListener("pointerup", panEnd);
  frame.addEventListener("pointercancel", panEnd);
  resizeObserver = new ResizeObserver(fitFrame);
  resizeObserver.observe(document.getElementById("stage-viewport"));
  fitFrame();
  renderTools();
}
function fitFrame() {
  const viewport = document.getElementById("stage-viewport"),
    frame = document.getElementById("stage-frame");
  if (!viewport || !frame) return;
  const css = getComputedStyle(viewport),
    w =
      viewport.clientWidth -
      parseFloat(css.paddingLeft) -
      parseFloat(css.paddingRight),
    h =
      viewport.clientHeight -
      parseFloat(css.paddingTop) -
      parseFloat(css.paddingBottom);
  frame.style.width = Math.max(1, Math.min(w, h * 1.5, 1100)) + "px";
}
function slideImage(a, index) {
  const items = itemsOf(a);
  return items[index]?.image || a.media_urls?.[index] || PC.thumbOf(a);
}
async function showSlide() {
  S.busy = true;
  if (!slide()) {
    if (S.slides.size >= 40) {
      S.busy = false;
      throw new Error("한 상담에는 최대 40장을 담을 수 있습니다.");
    }
    S.slides.set(keyOf(), {
      asset_id: S.assetId,
      sub_index: S.sub,
      asset: asset(),
      note: "",
      drawing_url: null,
      aspect: 1.5,
      _selected: false,
      include_in_share: false,
      internal_note: "",
    });
  }
  const a = asset(),
    p = a.payload || {},
    items = itemsOf(a),
    it = items[S.sub] || {};
  S.zoom = 1;
  S.panX = 0;
  S.panY = 0;
  applyZoom();
  document.getElementById("studio-title").textContent = a.title;
  document.title = a.title + " · 상담 스튜디오";
  document.getElementById("stage-label").innerHTML =
    `${PC.typeBadge(a.type)} <span style="margin-left:8px">${PC.esc(it.title || "설명자료")}</span><button id="add-current-slide" class="btn-ghost btn-sm" style="margin-left:10px" onclick="addCurrentSlide()">${slide()._selected ? "상담에 담김" : "이 단계 상담에 담기"}</button>`;
  document.getElementById("page-controls").innerHTML =
    items.length > 1
      ? `<button onclick="subMove(-1)" aria-label="이전 단계" ${S.sub === 0 ? "disabled" : ""}><i class="fas fa-chevron-left"></i></button><span>${S.sub + 1} / ${items.length}</span><button onclick="subMove(1)" aria-label="다음 단계" ${S.sub === items.length - 1 ? "disabled" : ""}><i class="fas fa-chevron-right"></i></button>`
      : "";
  let content = "";
  if (a.type === "cost" || a.type === "faq") content = documentHTML(a);
  else if (a.type === "video")
    content = `<video src="${PC.url(a.media_urls?.[S.sub])}" controls playsinline preload="metadata"></video>`;
  else if (a.type === "compare")
    content = `<div class="stage-compare" id="stage-compare"><img src="${PC.url(p.before || a.media_urls[0])}" alt="치료 전"><div class="after"><img src="${PC.url(p.after || a.media_urls[1])}" alt="치료 후"></div><div class="divider"></div></div>`;
  else
    content = `<img src="${PC.url(slideImage(a, S.sub))}" alt="${PC.esc(it.title || a.title)}" draggable="false">`;
  document.getElementById("stage-content").innerHTML = content;
  ctx.clearRect(0, 0, 1200, 800);
  try {
    await restore(slide().drawing_png || slide().drawing_url);
  } catch (e) {
    PC.error(new Error("저장된 판서를 불러오지 못했습니다. 다시 열어 주세요."));
    S.busy = false;
    canvas.style.pointerEvents = "none";
    return;
  }
  if (!S.history.has(keyOf()))
    S.history.set(keyOf(), [
      slide().drawing_png || slide().drawing_url || null,
    ]);
  S.busy = false;
  renderPanel();
  renderTools();
  renderFilmstrip();
  status();
  setTool(S.tool);
  const selected = [...S.slides.values()].filter((x) => x._selected),
    order = selected.findIndex(
      (x) => x.asset_id === S.assetId && x.sub_index === S.sub,
    );
  if (selected.length > 1)
    document
      .getElementById("page-controls")
      .insertAdjacentHTML(
        "beforeend",
        `<span style="margin-left:10px">상담 ${order >= 0 ? order + 1 : "—"}/${selected.length}</span><button onclick="moveSelected(-1)" aria-label="이전 상담자료"><i class="fas fa-backward-step"></i></button><button onclick="moveSelected(1)" aria-label="다음 상담자료"><i class="fas fa-forward-step"></i></button>`,
      );
  history.replaceState(
    null,
    "",
    `/consult/${S.assetId}${S.session.id ? "?session=" + S.session.id : ""}`,
  );
}
function documentHTML(a) {
  const p = a.payload || {};
  return `<article class="stage-document"><p class="eyebrow">${a.type === "cost" ? "TREATMENT COST" : "QUESTION & ANSWER"}</p><h2>${PC.esc(a.type === "faq" ? p.question || a.title : a.title)}</h2>${a.type === "cost" ? `<table><tbody>${(p.rows || []).map((r) => `<tr><td>${PC.esc(r.item)}${r.note ? `<small style="display:block;font-size:11px;color:var(--ink-3)">${PC.esc(r.note)}</small>` : ""}</td><td>${PC.esc(r.price)}</td><td><span class="badge badge-neutral">${PC.esc(r.insurance)}</span></td></tr>`).join("")}</tbody></table><p class="cost-note">${PC.esc(p.note || "정확한 치료 계획과 비용은 진단 후 안내드립니다.")}</p>` : `<p>${PC.esc(p.answer || a.description || "")}</p>`}</article>`;
}
async function loadRelated() {
  try {
    const { data } = await axios.get("/api/assets", {
      params: { treatment: asset().treatment_id || "all" },
    });
    S.related = data.assets;
    for (const a of data.assets)
      if (a.staff_note) S.staffGuides.set(a.id, a.staff_note);
    const guide = document.getElementById("staff-guide-text");
    if (guide)
      guide.textContent =
        S.staffGuides.get(S.assetId) ||
        "직원용 보충 설명이 등록되지 않았습니다.";
    for (const a of data.assets) if (!S.assets.has(a.id)) S.assets.set(a.id, a);
    renderFilmstrip();
  } catch (e) {
    PC.error(e);
  }
}
function renderFilmstrip() {
  const list = [
    ...new Map(
      [...S.slides.values()]
        .map((s) => [s.asset_id, S.assets.get(s.asset_id)])
        .concat(S.related.map((a) => [a.id, a])),
    ).values(),
  ].filter(Boolean);
  document.getElementById("filmstrip").innerHTML = list
    .map(
      (a) =>
        `<button class="film-thumb ${a.id === S.assetId ? "active" : ""}" onclick="gotoAsset(${a.id})" title="${PC.esc(a.title)}"><span class="film-image">${a.type === "video" ? '<i class="fas fa-play" style="color:var(--accent)"></i>' : `<img src="${PC.url(PC.thumbOf(a))}" alt="" loading="lazy">`}</span><p>${PC.esc(a.title)}</p></button>`,
    )
    .join("");
}
function renderPanel() {
  const a = asset(),
    items = itemsOf(a);
  document.getElementById("studio-panel").innerHTML =
    `<div class="row spread"><span class="eyebrow" style="color:#96ad88">CONSULTATION NOTES</span><button class="icon-btn mobile-only" style="color:#bcd0b1" onclick="togglePanel()" aria-label="패널 닫기"><i class="fas fa-xmark"></i></button></div><h2 style="margin-top:15px">${PC.esc(a.title)}</h2><p class="description">${PC.esc(a.description)}</p><p style="font-size:10px;color:#94ae83;margin-top:12px"><i class="fas fa-user-doctor"></i> &nbsp;${PC.esc(a.reviewer_name || "작성자 미지정")} · ${PC.reviewBadge(a)}</p>${items.length > 1 ? `<p class="panel-label">단계별 설명</p>${items.map((it, i) => `<button class="stage-step ${i === S.sub ? "active" : ""}" onclick="subGo(${i})"><span class="step-number">${String(i + 1).padStart(2, "0")}</span><span><b>${PC.esc(it.title || "자료 " + (i + 1))}</b><small>${PC.esc(it.desc || "")}</small></span></button>`).join("")}` : ""}
 ${a.type === "compare" ? '<p class="panel-label">전후 비교</p><div class="row"><span class="small">Before</span><input aria-label="전후 비교" class="studio-compare-range" type="range" value="50" oninput="document.getElementById(\'stage-compare\').style.setProperty(\'--split\',this.value+\'%\')"><span class="small">After</span></div><p class="caution-item">비포·애프터는 환자 공유 링크에서 제외됩니다.</p>' : ""}
 <details class="caution-item"><summary>직원용 설명 가이드 · 환자 전송 제외</summary><p id="staff-guide-text" style="white-space:pre-wrap;margin-top:8px">${PC.esc(a.staff_note || S.staffGuides.get(a.id) || "직원용 보충 설명이 등록되지 않았습니다.")}</p></details><div id="studio-cautions">${cautionsHTML()}</div>
 ${PC.user?.clinic_id ? `<p class="panel-label">환자에게 전해질 메모</p><p class="studio-bottom-note">${slide()._selected ? "이 단계가 오늘 상담에 담겨 있습니다." : "먼저 ‘이 단계 상담에 담기’를 눌러주세요."}</p><div class="stack" style="gap:11px"><label class="field">환자 표시명<input class="input" id="patient-label" maxlength="100" placeholder="예: 김○○님" value="${PC.esc(S.session.patient_label)}" oninput="S.session.patient_label=this.value;touch()"></label><label class="field">이 단계의 메모<textarea class="input" id="slide-note" ${slide()._selected ? "" : "disabled"} rows="3" maxlength="2000" placeholder="환자에게 강조할 내용을 적어주세요" oninput="slide().note=this.value;touch()">${PC.esc(slide().note)}</textarea></label><label class="field"><i class="fas fa-lock"></i>이 단계 내부 메모<textarea id="internal-note" class="input" rows="2" maxlength="2000" ${slide()._selected ? "" : "disabled"} oninput="slide().internal_note=this.value;touch()">${PC.esc(slide().internal_note || "")}</textarea><small>환자에게 전송하지 않습니다.</small></label><label class="field">다음 일정 / 안내<textarea class="input" id="schedule-note" rows="2" maxlength="2000" placeholder="다음 내원 시 참고할 안내" oninput="S.session.schedule_note=this.value;touch()">${PC.esc(S.session.schedule_note)}</textarea></label></div><p id="slide-count" class="studio-bottom-note"></p><button class="btn-ghost btn-sm" style="width:100%;background:#ffffff05;color:#afc29f;border-color:#ffffff18" onclick="removeSlide()">현재 단계를 상담에서 빼기</button><p class="studio-bottom-note">표시명과 메모에 불필요한 개인정보를 입력하지 마세요.<br>저장한 상담은 병원 계정에서 다시 열 수 있습니다.</p>` : '<p class="caution-item">로그인하면 상담 저장과 환자 전송을 이용할 수 있습니다.</p>'}`;
  status();
}
function cautionsHTML() {
  return S.cautions.length
    ? `<p class="panel-label">설명할 주의사항</p>${S.cautions.map((c) => `<p class="caution-item">${PC.esc(c.title)}</p>`).join("")}`
    : "";
}
async function loadCautions() {
  const id = asset().treatment_id;
  if (!id) return;
  try {
    const { data } = await axios.get("/api/assets", {
      params: { treatment: id, category: "caution" },
    });
    if (asset().treatment_id !== id) return;
    S.cautions = data.assets;
    const el = document.getElementById("studio-cautions");
    if (el) el.innerHTML = cautionsHTML();
  } catch {}
}
window.gotoAsset = async (id) => {
  if (S.busy || S.saving) return;
  try {
    if (id === S.assetId) return;
    if (S.slides.size >= 40 && !S.slides.has(keyOf(id, 0)))
      throw new Error("한 상담에 최대 40장까지 담을 수 있습니다.");
    if (!S.assets.has(id))
      S.assets.set(id, (await axios.get(`/api/assets/${id}`)).data.asset);
    S.assetId = id;
    S.sub = 0;
    S.cautions = [];
    await showSlide();
    loadCautions();
  } catch (e) {
    PC.error(e);
  }
};
window.subGo = async (i) => {
  if (S.busy || S.saving) return;
  const count = Math.max(1, itemsOf(asset()).length);
  if (i < 0 || i >= count || i === S.sub) return;
  if (S.slides.size >= 40 && !S.slides.has(keyOf(S.assetId, i)))
    return PC.toast("최대 40장까지 담을 수 있습니다.", "err");
  S.sub = i;
  await showSlide();
};
window.subMove = (d) => subGo(S.sub + d);
window.removeSlide = () => {
  if (!slide()._selected) return;
  PC.confirm(
    "이 단계를 오늘 상담에서 뺄까요?",
    "저장 목록과 환자 전송 대상에서 제외됩니다.",
    async () => {
      slide()._selected = false;
      slide().include_in_share = false;
      touch();
      document.getElementById("add-current-slide").textContent =
        "이 단계 상담에 담기";
      renderPanel();
      status();
    },
    "빼기",
  );
};
const tools = [
  ["move", "fa-hand", "이동"],
  ["pen", "fa-pen", "펜"],
  ["highlight", "fa-highlighter", "형광펜"],
  ["arrow", "fa-arrow-right-long", "화살표"],
  ["circle", "fa-circle", "동그라미"],
  ["text", "fa-font", "텍스트"],
  ["eraser", "fa-eraser", "지우개"],
];
function renderTools() {
  const draw = drawable();
  document.getElementById("studio-tools").innerHTML = draw
    ? `<div class="toolgroup">${tools.map(([k, i, l]) => `<button class="icon-btn ${S.tool === k ? "active" : ""}" aria-label="${l}" title="${l}" aria-pressed="${S.tool === k}" onclick="setTool('${k}')"><i class="fas ${i}"></i></button>`).join("")}</div><div class="toolgroup">${[
        ["#d95f4c", "빨강"],
        ["#4287bd", "파랑"],
        ["#e9bc44", "노랑"],
        ["#ffffff", "흰색"],
      ]
        .map(
          ([c, l]) =>
            `<button class="icon-btn ${S.color === c ? "selected" : ""}" onclick="setColor('${c}')" aria-label="${l}" title="${l}"><span class="color-dot" style="background:${c}"></span></button>`,
        )
        .join(
          "",
        )}<span class="tool-divider"></span><button class="icon-btn" onclick="undoDraw()" title="실행취소 (Ctrl+Z)" aria-label="실행취소"><i class="fas fa-rotate-left"></i></button><button class="icon-btn" onclick="redoDraw()" title="다시 실행" aria-label="다시 실행"><i class="fas fa-rotate-right"></i></button><button class="icon-btn" onclick="clearDraw()" title="현재 판서 지우기" aria-label="판서 지우기"><i class="far fa-trash-can"></i></button></div><div class="toolgroup zoom-tools"><button class="icon-btn" onclick="zoomBy(1.25)" aria-label="확대"><i class="fas fa-plus"></i></button><button class="icon-btn" onclick="zoomBy(.8)" aria-label="축소"><i class="fas fa-minus"></i></button><button class="icon-btn" onclick="zoomReset()" aria-label="확대 초기화"><i class="fas fa-compress"></i></button></div>`
    : `<span class="small" style="color:#98ad8c">${asset().type === "video" ? "영상의 재생 버튼으로 설명하세요." : "읽기 모드 · 긴 내용은 자료 안에서 스크롤하세요."} 판서는 이미지 자료에서 사용할 수 있습니다.</span>${asset().type === "cost" ? '<button class="btn-ghost btn-sm" onclick="window.print()"><i class="fas fa-print"></i>수가표 출력</button>' : ""}`;
}
window.setTool = (t) => {
  S.tool = t;
  canvas.style.pointerEvents =
    t === "move" || !drawable() || S.busy ? "none" : "auto";
  renderTools();
};
window.setColor = (c) => {
  S.color = c;
  if (["move", "eraser"].includes(S.tool)) S.tool = "pen";
  setTool(S.tool);
};
function point(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * 1200,
    y: ((e.clientY - r.top) / r.height) * 800,
    pressure: e.pointerType === "pen" ? Math.max(0.3, e.pressure) : 0.5,
  };
}
function drawStart(e) {
  if (!slide()?._selected) {
    PC.toast("먼저 이 단계를 상담에 담아 주세요.");
    return;
  }
  if (S.busy || S.saving || !drawable() || S.tool === "move") return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = point(e);
  if (S.tool === "text") {
    PC.modal(
      "설명 텍스트 추가",
      '<label class="field">짧은 설명<input id="drawing-text" class="input" maxlength="60" placeholder="예: 이 부분을 확인해 주세요"></label>',
      '<button class="btn-ghost" onclick="PC.closeModal()">취소</button><button class="btn-primary" onclick="addDrawingText()">추가</button>',
      true,
    );
    window.addDrawingText = () => {
      const text = document.getElementById("drawing-text").value.trim();
      if (text) {
        ctx.save();
        ctx.font = "600 30px sans-serif";
        ctx.fillStyle = S.color;
        ctx.fillText(text, p.x, p.y);
        ctx.restore();
        commitDrawing();
      }
      PC.closeModal();
    };
    return;
  }
  stroke = {
    start: p,
    last: p,
    background: ["arrow", "circle"].includes(S.tool)
      ? ctx.getImageData(0, 0, 1200, 800)
      : null,
  };
  drawSegment(p, p);
}
function styleStroke() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = S.color;
  ctx.fillStyle = S.color;
  ctx.globalCompositeOperation =
    S.tool === "eraser" ? "destination-out" : "source-over";
  ctx.globalAlpha = S.tool === "highlight" ? 0.25 : 1;
  ctx.lineWidth =
    S.tool === "eraser" ? 35 : S.tool === "highlight" ? 22 : S.size;
}
function drawSegment(a, b) {
  ctx.save();
  styleStroke();
  if (S.tool === "pen") ctx.lineWidth = S.size * (0.6 + b.pressure);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x + 0.01, b.y + 0.01);
  ctx.stroke();
  ctx.restore();
}
function drawMove(e) {
  if (!stroke) return;
  e.preventDefault();
  const p = point(e);
  if (stroke.background) {
    ctx.putImageData(stroke.background, 0, 0);
    ctx.save();
    styleStroke();
    const a = stroke.start;
    ctx.beginPath();
    if (S.tool === "circle")
      ctx.ellipse(
        (a.x + p.x) / 2,
        (a.y + p.y) / 2,
        Math.abs(p.x - a.x) / 2,
        Math.abs(p.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
    else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(p.x, p.y);
      const ang = Math.atan2(p.y - a.y, p.x - a.x);
      ctx.moveTo(
        p.x - 22 * Math.cos(ang - 0.45),
        p.y - 22 * Math.sin(ang - 0.45),
      );
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(
        p.x - 22 * Math.cos(ang + 0.45),
        p.y - 22 * Math.sin(ang + 0.45),
      );
    }
    ctx.stroke();
    ctx.restore();
  } else drawSegment(stroke.last, p);
  stroke.last = p;
}
function drawEnd() {
  if (!stroke) return;
  stroke = null;
  commitDrawing();
}
function commitDrawing() {
  const png = canvas.toDataURL("image/png");
  slide().drawing_png = png;
  slide().drawing_url = null;
  const h = S.history.get(keyOf()) || [null];
  h.push(png);
  if (h.length > 20) h.splice(1, 1);
  S.history.set(keyOf(), h);
  S.future.set(keyOf(), []);
  touch();
}
function restore(url) {
  const version = ++restoreVersion;
  ctx.clearRect(0, 0, 1200, 800);
  if (!url) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (version === restoreVersion) {
        ctx.clearRect(0, 0, 1200, 800);
        ctx.drawImage(img, 0, 0, 1200, 800);
      }
      resolve();
    };
    img.onerror = () => reject(new Error("판서를 불러올 수 없습니다."));
    img.src = url;
  });
}
async function setHistoryDrawing(url) {
  S.busy = true;
  try {
    await restore(url);
    slide().drawing_png = url ? canvas.toDataURL("image/png") : null;
    slide().drawing_url = null;
    touch();
  } catch (e) {
    PC.error(e);
  } finally {
    S.busy = false;
    setTool(S.tool);
  }
}
window.undoDraw = async () => {
  if (S.busy || S.saving) return;
  const h = S.history.get(keyOf()) || [];
  if (h.length < 2) return;
  const f = S.future.get(keyOf()) || [];
  f.push(h.pop());
  S.future.set(keyOf(), f);
  await setHistoryDrawing(h.at(-1));
};
window.redoDraw = async () => {
  if (S.busy || S.saving) return;
  const f = S.future.get(keyOf()) || [];
  if (!f.length) return;
  const url = f.pop();
  S.history.get(keyOf()).push(url);
  await setHistoryDrawing(url);
};
window.clearDraw = () => {
  if (S.busy || S.saving) return;
  PC.confirm(
    "이 단계의 판서를 지울까요?",
    "다른 자료와 단계에 그린 판서는 유지됩니다.",
    async () => {
      ctx.clearRect(0, 0, 1200, 800);
      slide().drawing_png = null;
      slide().drawing_url = null;
      S.history.get(keyOf()).push(null);
      S.future.set(keyOf(), []);
      touch();
    },
    "지우기",
  );
};
function applyZoom() {
  const p = document.getElementById("stage-plane");
  if (p)
    p.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`;
}
window.zoomBy = (f) => {
  S.zoom = Math.min(4, Math.max(1, S.zoom * f));
  if (S.zoom === 1) {
    S.panX = 0;
    S.panY = 0;
  }
  applyZoom();
};
window.zoomReset = () => {
  S.zoom = 1;
  S.panX = 0;
  S.panY = 0;
  applyZoom();
};
const pointers = new Map();
let lastDistance = 0;
function panStart(e) {
  if (S.tool !== "move" || !drawable()) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  e.currentTarget.setPointerCapture(e.pointerId);
}
function panMove(e) {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastDistance) zoomBy(dist / lastDistance);
    lastDistance = dist;
  } else if (S.zoom > 1) {
    S.panX += e.clientX - prev.x;
    S.panY += e.clientY - prev.y;
    applyZoom();
  }
}
function panEnd(e) {
  pointers.delete(e.pointerId);
  lastDistance = 0;
}
window.togglePanel = () => {
  S.panel = !S.panel;
  document.getElementById("studio-panel").classList.toggle("hidden", !S.panel);
};
window.toggleFullscreen = () =>
  PC.run(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else PC.toast("이 브라우저는 전체화면을 지원하지 않습니다.");
  });
window.moveSelected = async (d) => {
  if (S.busy) return;
  const list = [...S.slides.values()].filter((s) => s._selected),
    i = list.findIndex(
      (s) => s.asset_id === S.assetId && s.sub_index === S.sub,
    ),
    next = list[i + d];
  if (!next) return;
  S.assetId = next.asset_id;
  S.sub = next.sub_index;
  await showSlide();
};
window.addCurrentSlide = () => {
  slide()._selected = true;
  slide().include_in_share = true;
  touch();
  document.getElementById("add-current-slide").textContent = "상담에 담김";
  renderPanel();
  status();
};
window.saveSession = async (silent = false) => {
  if (!PC.user?.clinic_id) {
    location.href = "/login";
    return null;
  }
  if (S.busy) return null;
  try {
    await S.saver.flush();
    if (!silent) PC.toast("상담 초안을 서버에 저장했습니다.");
    return S.session.id;
  } catch (e) {
    PC.error(e);
    return null;
  }
};
window.goPrepare = async () => {
  const id = await saveSession(true);
  if (id) location.href = "/prepare?session=" + id;
  else if (!S.dirty) location.href = "/prepare";
};
window.sendToPatient = async () => {
  const id = await saveSession(true);
  if (id) location.href = "/prepare?session=" + id + "&review=1";
  else if (![...S.slides.values()].some((s) => s._selected))
    PC.toast("환자에게 보낼 자료를 먼저 담아 주세요.");
};
window.newStudioPatient = () =>
  PC.confirm(
    "새 환자 상담을 시작할까요?",
    "현재 상담을 서버에 저장하고 환자 표시명·메모·자료를 모두 비웁니다.",
    async () => {
      const id = await saveSession(true);
      if (S.dirty && !id) throw new Error("먼저 현재 상담을 저장해 주세요.");
      PC.rememberDraft(null);
      location.href = "/prepare?new=1";
    },
    "새 상담 시작",
  );
addEventListener("online", () => {
  if (S.dirty) S.saver?.flush().catch(() => {});
});
window.addEventListener("beforeunload", (e) => {
  if (S.dirty && PC.user?.clinic_id) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("keydown", (e) => {
  if (
    S.busy ||
    S.saving ||
    document.getElementById("pc-modal") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveSession();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redoDraw() : undoDraw();
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    subMove(e.key === "ArrowRight" ? 1 : -1);
  }
});
init();
