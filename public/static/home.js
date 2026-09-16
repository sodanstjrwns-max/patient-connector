const cats = [
  ["all", "전체 자료", "fa-grid-2"],
  ["process", "치료 과정", "fa-route"],
  ["progression", "질환 이해", "fa-layer-group"],
  ["caution", "주의사항", "fa-shield-heart"],
  ["cost", "비용 안내", "fa-receipt"],
  ["faq", "자주 묻는 질문", "fa-comment-dots"],
  ["clinic", "우리 병원", "fa-house-medical"],
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
    PC.loadMaterialSelection();
    state.specialty = PC.user?.clinic_specialty || "치과";
    state.locked = !!PC.user?.clinic_specialty;
    await treatments();
    render();
    await loadAssets();
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
  document.getElementById("app").innerHTML = PC.shell(
    state.favorites ? "favorites" : "home",
    `<main id="main-content" class="page library-page fade-in">
    <header class="library-heading"><div><span class="section-kicker"><span></span> THE EXPLANATION LIBRARY</span><h1>${state.favorites ? "자주 쓰는 설명을, 한곳에." : "더 쉽게 설명하고,<br><span>더 오래 이해하도록.</span>"}</h1><p>필요한 자료를 찾아 함께 보세요.<br class="mobile-only"> 전달이 필요할 때만, 카카오톡으로 공유하세요.</p></div><aside class="library-manifesto" aria-label="사용 순서"><span class="manifesto-icon"><i class="fas fa-arrow-up-right-from-square"></i></span><b>찾고. 보여주고. 보내고.</b><p>환자 등록 없이<br>설명에만 집중하는 공간.</p><span class="manifesto-line"></span><small>PATIENT CONNECT / LIBRARY</small></aside></header>
    <section id="library-section" aria-label="설명자료 라이브러리"><div class="library-search-band"><label class="search-box"><i class="fas fa-magnifying-glass"></i><input id="search-input" class="input" type="search" autocomplete="off" placeholder="어떤 설명이 필요하세요?" aria-label="설명자료 검색" value="${PC.esc(state.q)}" oninput="onSearch(this.value)"><kbd aria-hidden="true">/</kbd></label>${!state.locked ? `<select class="input specialty-select" aria-label="진료과" onchange="setSpecialty(this.value)">${state.specialties.map((s) => `<option ${s === state.specialty ? "selected" : ""}>${PC.esc(s)}</option>`).join("")}</select>` : `<span class="specialty-tag"><i class="fas fa-stethoscope"></i>${PC.esc(state.specialty)} 라이브러리</span>`}</div>
    <nav class="category-shelf" aria-label="자료 분류">${cats.map(([k, l, icon]) => `<button class="category-tile ${state.category === k ? "on" : ""}" onclick="setCategory('${k}')" aria-pressed="${state.category === k}"><i class="fas ${k === "all" ? "fa-border-all" : icon}"></i><span>${l}</span></button>`).join("")}</nav>
    <nav class="treatment-tabs" aria-label="치료 종류"><button class="tab ${state.treatment === "all" ? "on" : ""}" onclick="setTreatment('all')">전체 진료</button>${state.treatments.map((t) => `<button class="tab ${String(state.treatment) === String(t.id) ? "on" : ""}" onclick="setTreatment('${t.id}')">${PC.esc(t.name)}</button>`).join("")}</nav>
    <div class="result-bar"><div><h2>${state.favorites ? "즐겨찾는 자료" : cats.find((c) => c[0] === state.category)[1]}</h2><span id="result-count" aria-live="polite">자료를 불러오는 중입니다</span></div><div class="library-controls"><select class="input" aria-label="자료 형식" onchange="setType(this.value)"><option value="all">모든 형식</option>${["image", "video", "steps", "progression", "cost", "faq", "compare"].map((t) => `<option value="${t}" ${state.type === t ? "selected" : ""}>${PC.typeInfo(t)[0]}</option>`).join("")}</select><select class="input" aria-label="정렬" onchange="setSort(this.value)"><option value="recommended" ${state.sort === "recommended" ? "selected" : ""}>추천순</option><option value="new" ${state.sort === "new" ? "selected" : ""}>최신순</option><option value="popular" ${state.sort === "popular" ? "selected" : ""}>사용순</option></select><div class="view-toggle"><button aria-label="카드 보기" class="${state.layout === "grid" ? "on" : ""}" onclick="setLayout('grid')"><i class="fas fa-border-all"></i></button><button aria-label="목록 보기" class="${state.layout === "list" ? "on" : ""}" onclick="setLayout('list')"><i class="fas fa-list"></i></button></div></div></div>
    <div id="library-grid" class="library-${state.layout}" aria-busy="true">${skeletons()}</div></section><aside class="library-tip"><i class="far fa-lightbulb"></i><p><b>먼저 보여주세요. 전송은 그다음에.</b> 자료를 누르면 설명 화면이 열립니다. 보낼 자료는 ‘전송 담기’로 모아 주세요.</p></aside>${PC.footer()}</main><section id="material-tray" aria-label="선택한 전송 자료"></section>`,
  );
  PC.renderMaterialTray();
}
function skeletons() {
  return Array(6).fill('<div class="skeleton skeleton-card"></div>').join("");
}
async function loadAssets() {
  const seq = ++state.request;
  document.getElementById("library-grid")?.setAttribute("aria-busy", "true");
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
  } finally {
    if (seq === state.request)
      document
        .getElementById("library-grid")
        ?.setAttribute("aria-busy", "false");
  }
}
function grid() {
  document.getElementById("result-count").innerHTML =
    `<b>${state.assets.length}</b>개의 설명자료${state.q ? " · “" + PC.esc(state.q) + "”" : ""}`;
  const el = document.getElementById("library-grid");
  el.className = "library-" + state.layout;
  el.innerHTML = state.assets.length
    ? state.assets.map((a) => PC.assetCard(a)).join("")
    : PC.empty(
        state.favorites
          ? "아직 즐겨찾기한 자료가 없어요."
          : "검색 결과가 없습니다.",
        state.favorites
          ? "자료 카드의 북마크를 눌러보세요."
          : "다른 검색어나 분류를 선택해 보세요.",
      );
}
window.setCategory = (k) => {
  state.category = k;
  render();
  loadAssets();
};
window.setTreatment = (k) => {
  state.treatment = k;
  render();
  loadAssets();
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
    });
};
addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !e.ctrlKey &&
    !e.metaKey &&
    !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
    !document.getElementById("pc-modal")
  ) {
    e.preventDefault();
    document.getElementById("search-input")?.focus();
  }
});
init();
