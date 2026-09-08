const params = new URLSearchParams(location.search);
const state = {
  tab: ["sessions", "settings", "library"].includes(params.get("tab"))
    ? params.get("tab")
    : "mine",
  treatments: [],
  assets: [],
  publicAssets: [],
  sessions: [],
  clinic: null,
  q: "",
  filter: "all",
};
async function init() {
  try {
    await PC.loadMe();
    if (!PC.user?.clinic_id) {
      location.href = "/login";
      return;
    }
    const { data } = await axios.get("/api/treatments");
    state.treatments = data.treatments;
    await load();
    render();
    if (params.get("new")) newAsset();
  } catch (e) {
    PC.error(e);
    document.getElementById("app").innerHTML = PC.empty(
      "작업 공간을 불러오지 못했습니다.",
      "새로고침 후 다시 시도해 주세요.",
    );
  }
}
async function load() {
  const [a, p, s, c] = await Promise.all([
    axios.get("/api/assets?manage=1"),
    axios.get("/api/assets"),
    axios.get("/api/sessions"),
    axios.get("/api/clinic"),
  ]);
  state.assets = a.data.assets;
  state.publicAssets = p.data.assets.filter((a) => a.is_public);
  state.sessions = s.data.sessions;
  state.clinic = c.data.clinic;
}
function render() {
  const tab = state.tab,
    key =
      tab === "sessions"
        ? "sessions"
        : tab === "settings"
          ? "settings"
          : "manage";
  const titles = {
    mine: [
      "YOUR CONTENT",
      "우리 병원만의 설명을 만드세요.",
      "직접 만든 자료와 병원에 맞게 편집한 자료를 관리합니다.",
    ],
    library: [
      "MAKE IT YOURS",
      "좋은 설명을, 우리 병원답게.",
      "공개 자료를 복제한 뒤 내용과 비용을 자유롭게 편집하세요.",
    ],
    sessions: [
      "CONSULTATION HISTORY",
      "상담이 끝나도, 연결은 계속됩니다.",
      "저장한 상담을 이어서 열고, 전송과 열람을 확인하세요.",
    ],
    settings: [
      "CLINIC PROFILE",
      "환자에게 전해지는 우리 병원.",
      "병원 정보와 계정 보안을 관리합니다.",
    ],
  };
  const [k, t, s] = titles[tab];
  document.getElementById("app").innerHTML = PC.shell(
    key,
    `<main id="main-content" class="page fade-in">${PC.heading(k, t, s, tab === "mine" ? '<button class="btn-primary" onclick="newAsset()"><i class="fas fa-plus"></i>새 자료</button>' : "")}<nav class="tab-bar" aria-label="병원 관리">${[
      ["mine", "병원 자료"],
      ["library", "공개 자료 가져오기"],
      ["sessions", "상담 이력"],
      ["settings", "병원 설정"],
    ]
      .map(
        ([v, l]) =>
          `<button class="tab ${tab === v ? "on" : ""}" onclick="setTab('${v}')">${l}</button>`,
      )
      .join("")}</nav><div id="manage-content"></div>${PC.footer()}</main>`,
  );
  renderTab();
}
window.setTab = (tab) => {
  state.tab = tab;
  state.q = "";
  state.filter = "all";
  history.replaceState(
    null,
    "",
    "/manage" + (tab === "mine" ? "" : "?tab=" + tab),
  );
  render();
};
function renderTab() {
  const el = document.getElementById("manage-content");
  if (state.tab === "settings") {
    settings(el);
    return;
  }
  el.innerHTML = `<div class="list-toolbar"><label class="search-box"><i class="fas fa-magnifying-glass"></i><input class="input" type="search" aria-label="${state.tab === "sessions" ? "환자 표시명" : "자료"} 검색" placeholder="${state.tab === "sessions" ? "환자 표시명으로 검색" : "자료 제목으로 검색"}" oninput="filterRows(this.value)" value="${PC.esc(state.q)}"></label>${
    state.tab === "mine"
      ? `<div class="row">${[
          ["all", "전체"],
          ["visible", "표시 중"],
          ["hidden", "숨김"],
        ]
          .map(
            ([v, l]) =>
              `<button class="chip ${state.filter === v ? "on" : ""}" onclick="setFilter('${v}')">${l}</button>`,
          )
          .join("")}</div>`
      : `<span class="help-note">${state.tab === "sessions" ? "열람 수에는 같은 브라우저의 30분 내 반복 열람이 제외됩니다." : "원본 자료는 변경되지 않습니다."}</span>`
  }</div><div id="manage-list"></div>`;
  renderRows();
}
window.filterRows = (q) => {
  state.q = q;
  renderRows();
};
window.setFilter = (f) => {
  state.filter = f;
  renderTab();
};
function renderRows() {
  const el = document.getElementById("manage-list");
  if (state.tab === "sessions") {
    const rows = state.sessions.filter((s) =>
      (s.patient_label || "").includes(state.q),
    );
    el.innerHTML = rows.length
      ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>상담</th><th>저장일</th><th>공유 상태</th><th>환자 열람</th><th>관리</th></tr></thead><tbody>${rows
          .map((s) => {
            const shared =
              s.share_token &&
              !s.share_revoked_at &&
              !PC.expired(s.share_expires_at);
            return `<tr><td><a class="table-title" href="/consult/${s.first_asset_id}?session=${s.id}">${PC.esc(s.patient_label || "표시명 없는 상담")}<small>${s.slide_count || 0}장 · 상담 이어서 열기 <i class="fas fa-arrow-up-right-from-square"></i></small></a></td><td class="subtle">${PC.date(s.updated_at, true)}</td><td><span class="badge ${shared ? "badge-ok" : "badge-neutral"}">${shared ? "공유 중" : s.share_revoked_at ? "공유 종료" : s.share_token ? "기간 만료" : "미전송"}</span>${shared ? `<p class="subtle" style="font-size:10px;margin-top:4px">${PC.date(s.share_expires_at)}까지</p>` : ""}</td><td><b>${s.view_count || 0}회</b><p class="subtle" style="font-size:10px">${s.last_viewed ? PC.datetime(s.last_viewed) : "아직 열람 기록 없음"}</p></td><td><div class="inline-actions"><button class="btn-ghost btn-sm" onclick="shareSession(${s.id})">${shared ? "공유 관리" : "링크 생성"}</button><button class="icon-btn" title="상담 삭제" aria-label="상담 삭제" onclick="deleteSession(${s.id})"><i class="far fa-trash-can"></i></button></div></td></tr>`;
          })
          .join("")}</tbody></table></div>`
      : PC.empty(
          "저장한 상담이 없습니다.",
          "라이브러리에서 자료를 열고 상담을 저장해 보세요.",
          "fa-comments",
        );
    return;
  }
  const source = state.tab === "library" ? state.publicAssets : state.assets,
    rows = source.filter(
      (a) =>
        a.title.includes(state.q) &&
        (state.filter === "all" ||
          (state.filter === "hidden" ? a.is_hidden : !a.is_hidden)),
    );
  if (state.tab === "library") {
    el.innerHTML = rows.length
      ? `<div class="library-grid">${rows.map((a) => `<article class="asset-card"><a class="cover-link" href="/consult/${a.id}">${PC.cover(a)}</a><div class="asset-info">${PC.typeBadge(a.type)}<h3>${PC.esc(a.title)}</h3><p>${PC.esc(a.description)}</p><button class="btn-ghost" style="width:100%;margin-top:15px" onclick="duplicateAsset(${a.id})"><i class="far fa-copy"></i>우리 병원으로 가져오기</button></div></article>`).join("")}</div>`
      : PC.empty("일치하는 자료가 없습니다.", "다른 제목으로 검색해 보세요.");
    return;
  }
  el.innerHTML = rows.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>설명자료</th><th>진료 / 형식</th><th>상태</th><th>감수</th><th>관리</th></tr></thead><tbody>${rows.map((a) => `<tr><td><a class="row table-title" href="/consult/${a.id}"><span class="clinic-avatar"><i class="fas ${PC.typeInfo(a.type)[1]}"></i></span><span>${PC.esc(a.title)}<small>${a.source_asset_id ? "공개 자료에서 가져옴" : "우리 병원에서 만든 자료"}</small></span></a></td><td><p class="small muted">${PC.esc(a.treatment_name || "공통")}</p>${PC.typeBadge(a.type)}</td><td><span class="badge ${a.is_hidden ? "badge-neutral" : "badge-ok"}">${a.is_hidden ? "숨김" : "표시 중"}</span></td><td class="muted">${PC.esc(a.reviewer_name)}</td><td><div class="inline-actions"><button class="btn-ghost btn-sm" onclick="editAsset(${a.id})">편집</button><button class="icon-btn" title="${a.is_hidden ? "다시 표시" : "숨기기"}" aria-label="${a.is_hidden ? "다시 표시" : "숨기기"}" onclick="toggleHide(${a.id})"><i class="far ${a.is_hidden ? "fa-eye" : "fa-eye-slash"}"></i></button><button class="icon-btn" aria-label="자료 삭제" title="삭제" onclick="deleteAsset(${a.id})"><i class="far fa-trash-can"></i></button></div></td></tr>`).join("")}</tbody></table></div>`
    : PC.empty(
        "아직 우리 병원 자료가 없어요.",
        "새 자료를 등록하거나 공개 라이브러리에서 가져와 보세요.",
      );
}
window.newAsset = () => Editor.open(null, state.treatments, refresh);
window.editAsset = (id) =>
  Editor.open(
    state.assets.find((a) => a.id === id),
    state.treatments,
    refresh,
  );
async function refresh() {
  await load();
  render();
}
window.duplicateAsset = (id) =>
  PC.run(async () => {
    const { data } = await axios.post(`/api/assets/${id}/duplicate`, {});
    await load();
    state.tab = "mine";
    render();
    PC.toast("우리 병원 자료로 가져왔습니다.");
    editAsset(data.id);
  });
window.toggleHide = (id) =>
  PC.run(async () => {
    const a = state.assets.find((a) => a.id === id);
    await axios.put(`/api/assets/${id}`, { is_hidden: !a.is_hidden });
    await refresh();
    PC.toast(
      a.is_hidden
        ? "다시 표시합니다."
        : "라이브러리에서 숨겼습니다. 관리 화면에서 다시 표시할 수 있습니다.",
    );
  });
window.deleteAsset = (id) =>
  PC.confirm(
    "자료를 삭제할까요?",
    "라이브러리에서 삭제됩니다. 기존에 저장된 상담의 설명 내용은 보존됩니다.",
    async () => {
      await axios.delete(`/api/assets/${id}`);
      await refresh();
      PC.toast("자료가 삭제되었습니다.");
    },
    "삭제",
  );
window.deleteSession = (id) =>
  PC.confirm(
    "상담을 삭제할까요?",
    "상담 내용과 열람 기록을 삭제합니다. 환자에게 전송한 링크도 더 이상 열리지 않습니다.",
    async () => {
      await axios.delete(`/api/sessions/${id}`);
      await refresh();
      PC.toast("상담이 삭제되었습니다.");
    },
    "상담 삭제",
  );
window.shareSession = (id) => {
  const s = state.sessions.find((s) => s.id === id),
    active =
      s.share_token && !s.share_revoked_at && !PC.expired(s.share_expires_at);
  PC.modal(
    "환자 공유 관리",
    `<div class="stack"><p class="help-note">${PC.esc(s.patient_label || "저장한 상담")} · ${s.slide_count}장<br>링크를 가진 사람이 열람할 수 있으므로 필요한 환자에게만 전달하세요.</p>${active ? `<div class="notice green"><i class="fas fa-link"></i>${PC.date(s.share_expires_at, true)}까지 공유 중입니다.</div><div class="row"><input class="input" readonly value="${PC.esc(location.origin + "/p/" + s.share_token)}" aria-label="공유 링크"><button class="btn-ghost" onclick="PC.copy(location.origin+'/p/${s.share_token}')">복사</button></div><a class="btn-ghost" target="_blank" rel="noopener" href="/p/${s.share_token}">환자 화면 미리보기 <i class="fas fa-arrow-up-right-from-square"></i></a>` : ""}<label class="field">새 링크 유효기간<select id="share-days" class="input"><option value="7">7일</option><option value="30" selected>30일</option><option value="90">90일</option><option value="1">1일</option></select><small>새 링크를 만들면 이전 링크는 즉시 만료됩니다.</small></label></div>`,
    `<button class="btn-ghost" onclick="PC.closeModal()">닫기</button>${active ? `<button class="btn-ghost btn-danger" onclick="revokeShare(${id})">공유 종료</button>` : ""}<button class="btn-primary" id="make-share" onclick="createShare(${id})">${active ? "새 링크 만들기" : "링크 생성"}</button>`,
    true,
  );
};
window.createShare = (id) =>
  PC.run(async () => {
    const btn = document.getElementById("make-share");
    btn.disabled = true;
    try {
      const { data } = await axios.post(`/api/sessions/${id}/share`, {
        days: Number(document.getElementById("share-days").value),
      });
      await load();
      renderRows();
      shareSession(id);
      PC.toast("새 공유 링크가 생성되었습니다.");
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  });
window.revokeShare = (id) =>
  PC.run(async () => {
    await axios.delete(`/api/sessions/${id}/share`);
    await load();
    renderRows();
    PC.closeModal();
    PC.toast("공유 링크를 종료했습니다.");
  });
function settings(el) {
  const c = state.clinic;
  el.innerHTML = `<div class="settings-grid"><section class="panel"><h2 class="panel-heading">병원 프로필</h2><p class="panel-caption">환자에게 전송한 상담 안내에 표시되는 정보입니다.</p><form class="stack" onsubmit="saveClinic(event)"><label class="field">병원 이름<input name="name" class="input" value="${PC.esc(c.name)}" required maxlength="150"></label><div class="form-grid"><label class="field">진료 분야<select name="specialty" class="input">${["치과", "피부·미용", "성형외과", "정형·재활", "안과", "한방", "기타"].map((s) => `<option ${s === c.specialty ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="field">병원 전화번호<input name="phone" class="input" type="tel" value="${PC.esc(c.phone)}" maxlength="30"></label></div><label class="field">병원 주소<input name="address" class="input" value="${PC.esc(c.address)}" maxlength="300"></label><label class="field">응급 / 진료 외 시간 안내<textarea name="emergency_info" class="input" rows="4" maxlength="1000">${PC.esc(c.emergency_info)}</textarea></label><button class="btn-primary">병원 정보 저장</button></form></section><section class="panel"><h2 class="panel-heading">계정 보안</h2><p class="panel-caption">${PC.esc(PC.user.email)}</p><form class="stack" onsubmit="changePassword(event)"><label class="field">현재 비밀번호<input class="input" name="current_password" type="password" required maxlength="128" autocomplete="current-password"></label><label class="field">새 비밀번호<input class="input" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"><small>10자 이상, 다른 서비스와 다른 비밀번호를 권장합니다.</small></label><label class="field">새 비밀번호 확인<input class="input" name="confirm_password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><p class="notice green"><i class="fas fa-shield-halved"></i>변경하면 다른 기기의 로그인 세션이 모두 종료됩니다.</p><button class="btn-ghost">비밀번호 변경</button></form></section></div>`;
}
window.saveClinic = (e) => {
  e.preventDefault();
  PC.run(async () => {
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      await axios.put(
        "/api/clinic",
        Object.fromEntries(new FormData(e.target)),
      );
      await PC.loadMe();
      await refresh();
      PC.toast("병원 정보가 저장되었습니다.");
    } finally {
      btn.disabled = false;
    }
  });
};
window.changePassword = (e) => {
  e.preventDefault();
  PC.run(async () => {
    const b = Object.fromEntries(new FormData(e.target));
    if (b.password !== b.confirm_password)
      throw new Error("새 비밀번호가 서로 다릅니다.");
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      await axios.post("/api/auth/password", b);
      e.target.reset();
      PC.toast("비밀번호가 변경되었습니다.");
    } finally {
      btn.disabled = false;
    }
  });
};
init();
