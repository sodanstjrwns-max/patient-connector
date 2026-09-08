const cats = [
  ["all", "전체 자료"],
  ["process", "치료 과정"],
  ["progression", "질환 진행"],
  ["caution", "주의사항"],
  ["cost", "비용 안내"],
  ["faq", "자주 묻는 질문"],
  ["clinic", "우리 병원"],
];
const state = {
  specialty: "치과",
  locked: false,
  treatments: [],
  specialties: [],
  treatment: "all",
  category: "all",
  q: "",
  sort: "recommended",
  type: "all",
  assets: [],
  favorites: new URLSearchParams(location.search).get("view") === "favorites",
  layout: "grid",
  request: 0,
};
async function init() {
  try {
    await PC.loadMe();
    state.specialty = PC.user?.clinic_specialty || "치과";
    state.locked = !!PC.user?.clinic_specialty;
    await treatments();
    render();
    await loadAssets();
    if (PC.user?.clinic_id) loadMetrics();
  } catch (e) {
    document.getElementById("app").innerHTML = PC.empty(
      "라이브러리를 불러오지 못했습니다.",
      "잠시 후 페이지를 새로고침해 주세요.",
      "fa-wifi",
    );
    PC.error(e);
  }
}
async function treatments() {
  const { data } = await axios.get("/api/treatments", {
    params: {
      specialty: state.specialty === "기타" ? undefined : state.specialty,
    },
  });
  state.treatments = data.treatments;
  state.specialties = data.specialties;
}
function render() {
  const u = PC.user,
    active = state.favorites ? "favorites" : "home";
  document.getElementById("app").innerHTML = PC.shell(
    active,
    `<main id="main-content" class="page fade-in">
 ${PC.heading(state.favorites ? "YOUR COLLECTION" : "THE CARE WORKSPACE", state.favorites ? "자주 쓰는 설명, 한곳에." : "설명은 더 쉽게, 신뢰는 더 깊게.", state.favorites ? "즐겨찾기한 자료로 상담을 빠르게 시작하세요." : `${u?.clinic_name ? PC.esc(u.clinic_name) + "의 " : ""}좋은 진료가 환자에게 온전히 전해지도록.`, u?.clinic_id ? '<a href="/prepare" data-prepare-link class="btn-primary"><i class="fas fa-list-check"></i> 오늘 상담 준비</a>' : '<a href="/login" class="btn-ghost desktop-only">우리 병원 시작하기 <i class="fas fa-arrow-right"></i></a>')}
 ${!state.favorites ? `<section class="hero-grid" aria-label="상담 안내"><article class="library-hero"><div class="hero-copy"><span class="eyebrow">A LITTLE CLARITY. A LOT OF TRUST.</span><h2>환자의 이해가,<br><em>좋은 진료의 시작이니까.</em></h2><p>보고, 함께 그리고, 다시 읽을 수 있도록.<br>상담의 순간부터 진료 후까지 연결하세요.</p><button class="btn btn-light" onclick="document.getElementById('library-section').scrollIntoView({behavior:'smooth'})">설명자료 살펴보기 <i class="fas fa-arrow-right" style="font-size:9px"></i></button></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><span class="hero-star"><svg width="28" height="28" viewBox="0 0 28 28"><path d="M14 0v28M0 14h28M4 4l20 20M4 24L24 4" stroke="currentColor" stroke-width="2"/></svg></span><div class="art-note"><span class="eyebrow">YOUR TREATMENT GUIDE</span><svg viewBox="0 0 100 100"><path d="M25 33C20 10 38 10 50 18C62 10 80 10 75 33C71 51 65 61 63 78C60 91 54 87 54 73C54 56 46 56 46 73C46 87 40 91 37 78C35 61 29 51 25 33Z" fill="#dce6d1" stroke="#879b71" stroke-width="2"/><path d="M33 58Q50 44 71 51" fill="none" stroke="#b48c70" stroke-width="2" stroke-dasharray="3 3"/></svg><hr><hr style="width:65%"></div><div class="art-bubble"><b><i class="fas fa-check-circle"></i> 이제 이해됐어요.</b>나를 위한 오늘의 상담 안내</div></div></article><aside class="quick-guide"><span class="eyebrow subtle">HOW IT WORKS</span><h3>좋은 상담, 세 번의 연결.</h3><div class="guide-list"><p class="guide-step"><span>01</span>진료에 맞는 자료 선택</p><p class="guide-step"><span>02</span>함께 보며 설명하고 판서</p><p class="guide-step"><span>03</span>환자에게 상담 안내 전송</p></div><p class="guide-bottom"><i class="fas fa-lock"></i> &nbsp;우리 병원 자료는 안전하게, 설명은 편하게.</p></aside></section>` : ""}
 ${u?.clinic_id ? '<section class="metrics" id="workspace-metrics" aria-label="병원 현황"></section>' : ""}
 <section id="recent-drafts"></section><section id="library-section"><header class="section-heading"><div class="row"><h2>${state.favorites ? "즐겨찾기 라이브러리" : "설명자료 라이브러리"}</h2><span class="badge badge-accent">${PC.esc(state.specialty)}</span></div><p class="desktop-only">우리 병원에 맞는 설명을 찾아보세요</p></header>
 <div class="filter-panel"><div class="search-row"><label class="search-box"><i class="fas fa-magnifying-glass"></i><input id="search-input" class="input" type="search" placeholder="어떤 설명이 필요하세요? 제목, 치료, 태그 검색" aria-label="설명자료 검색" value="${PC.esc(state.q)}" oninput="onSearch(this.value)"></label>${!state.locked ? `<select class="input" aria-label="진료과" onchange="setSpecialty(this.value)">${state.specialties.map((s) => `<option ${s === state.specialty ? "selected" : ""}>${PC.esc(s)}</option>`).join("")}</select>` : ""}<select class="input" aria-label="자료 형식" onchange="setType(this.value)"><option value="all">모든 형식</option>${["image", "video", "steps", "progression", "cost", "faq", "compare"].map((t) => `<option value="${t}" ${state.type === t ? "selected" : ""}>${PC.typeInfo(t)[0]}</option>`).join("")}</select></div><div class="filter-chips" aria-label="자료 분류">${cats.map(([k, l]) => `<button class="chip ${state.category === k ? "on" : ""}" onclick="setCategory('${k}')" aria-pressed="${state.category === k}">${l}</button>`).join("")}</div></div>
 <nav class="treatment-tabs" aria-label="치료 종류"><button class="tab ${state.treatment === "all" ? "on" : ""}" onclick="setTreatment('all')">전체 진료</button>${state.treatments.map((t) => `<button class="tab ${String(state.treatment) === String(t.id) ? "on" : ""}" onclick="setTreatment('${t.id}')">${PC.esc(t.name)}</button>`).join("")}</nav>
 <div class="result-bar"><span id="result-count" aria-live="polite">자료를 불러오는 중입니다</span><div class="row"><select aria-label="정렬" style="border:0;background:transparent;font-size:11px" onchange="setSort(this.value)"><option value="recommended" ${state.sort === "recommended" ? "selected" : ""}>추천순</option><option value="new" ${state.sort === "new" ? "selected" : ""}>최신순</option><option value="popular" ${state.sort === "popular" ? "selected" : ""}>많이 사용한 순</option></select><div class="view-toggle"><button aria-label="카드 보기" class="${state.layout === "grid" ? "on" : ""}" onclick="setLayout('grid')"><i class="fas fa-border-all"></i></button><button aria-label="목록 보기" class="${state.layout === "list" ? "on" : ""}" onclick="setLayout('list')"><i class="fas fa-list"></i></button></div></div></div>
 <div id="library-grid" class="library-${state.layout}">${skeletons()}</div></section>${PC.footer()}</main>`,
  );
}
function skeletons() {
  return Array(6).fill('<div class="skeleton skeleton-card"></div>').join("");
}
async function loadAssets() {
  const seq = ++state.request;
  try {
    const { data } = await axios.get("/api/assets", {
      params: {
        specialty: state.specialty === "기타" ? undefined : state.specialty,
        treatment: state.treatment,
        category: state.category,
        q: state.q,
        sort: state.sort,
        type: state.type,
        favorite: state.favorites ? "1" : undefined,
      },
    });
    if (seq !== state.request) return;
    state.assets = data.assets;
    grid();
  } catch (e) {
    if (seq !== state.request) return;
    document.getElementById("library-grid").innerHTML = PC.empty(
      "자료를 불러오지 못했어요.",
      "검색 조건을 변경하거나 새로고침해 주세요.",
    );
    PC.error(e);
  }
}
function grid() {
  document.getElementById("result-count").innerHTML =
    `<b style="color:var(--accent)">${state.assets.length}</b>개의 설명자료${state.q ? " · “" + PC.esc(state.q) + "”" : ""}`;
  document.getElementById("library-grid").className = "library-" + state.layout;
  document.getElementById("library-grid").innerHTML = state.assets.length
    ? state.assets.map((a) => PC.assetCard(a)).join("")
    : PC.empty(
        state.favorites
          ? "아직 즐겨찾기한 자료가 없어요."
          : "검색 결과가 없습니다.",
        state.favorites
          ? "자료 카드의 북마크를 눌러 나만의 라이브러리를 만들어 보세요."
          : "다른 검색어나 분류를 선택해 보세요.",
      );
}
async function loadMetrics() {
  PC.updateDraftLink();
  axios
    .get("/api/sessions")
    .then(({ data }) => {
      const el = document.getElementById("recent-drafts");
      if (el)
        el.innerHTML = data.sessions.length
          ? `<div class="section-heading"><h2>최근 상담 이어하기</h2><a class="btn-link" href="/prepare">모두 보기</a></div><div class="recent-grid">${data.sessions
              .slice(0, 3)
              .map(
                (s) =>
                  `<a class="recent-consult panel" href="/prepare?session=${s.id}"><span><b>${PC.esc(s.patient_label || "표시명 없는 초안")}</b><small>${s.slide_count || 0}장 · ${PC.date(s.updated_at)}</small></span><span class="badge badge-warn">${s.status === "draft" ? "초안" : "저장됨"}</span></a>`,
              )
              .join("")}</div>`
          : "";
    })
    .catch(() => {});
  const { data } = await axios.get("/api/dashboard");
  const box = document.getElementById("workspace-metrics");
  if (box)
    box.innerHTML = [
      ["우리 병원 자료", data.assets, "fa-folder-open"],
      ["저장한 상담", data.sessions, "fa-comments"],
      ["열람된 상담", data.viewed, "fa-envelope-open-text"],
      ["즐겨찾는 자료", data.favorites, "fa-bookmark"],
    ]
      .map(
        ([l, n, i]) =>
          `<article class="metric"><div><p>${l}</p><strong>${n}<span style="font-size:11px;color:var(--ink-3);font-weight:400;margin-left:6px">건</span></strong></div><i class="fas ${i}"></i></article>`,
      )
      .join("");
}
window.setCategory = (k) => {
  state.category = k;
  render();
  loadAssets();
  if (PC.user?.clinic_id) loadMetrics();
};
window.setTreatment = (k) => {
  state.treatment = k;
  render();
  loadAssets();
  if (PC.user?.clinic_id) loadMetrics();
};
window.setSpecialty = async (sp) => {
  state.specialty = sp;
  state.treatment = "all";
  await treatments();
  render();
  loadAssets();
};
window.setType = (t) => {
  state.type = t;
  loadAssets();
};
window.setSort = (s) => {
  state.sort = s;
  loadAssets();
};
window.setLayout = (l) => {
  state.layout = l;
  grid();
  document
    .querySelectorAll(".view-toggle button")
    .forEach((b, i) => b.classList.toggle("on", (l === "grid" ? 0 : 1) === i));
};
let timer;
window.onSearch = (q) => {
  state.q = q;
  clearTimeout(timer);
  timer = setTimeout(loadAssets, 250);
};
window.toggleFavorite = (id) => {
  const a = state.assets.find((a) => a.id === id);
  if (a)
    PC.favorite(id, !!a.favorite, (f) => {
      a.favorite = f;
      if (state.favorites && !f)
        state.assets = state.assets.filter((x) => x.id !== id);
      grid();
      if (PC.user?.clinic_id) loadMetrics();
    });
};
init();
