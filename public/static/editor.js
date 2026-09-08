// Shared structured asset editor for clinic and operator workspaces.
window.Editor = {
  data: null,
  treatments: [],
  onSaved: null,
  public: false,
  pending: 0,
  async open(
    asset = null,
    treatments = [],
    onSaved = () => {},
    isPublic = false,
  ) {
    this.data = asset
      ? structuredClone(asset)
      : {
          title: "",
          description: "",
          type: "image",
          category: "process",
          treatment_id: "",
          reviewer_name: PC.user?.name || "",
          media_urls: [],
          tags: [],
          payload: {},
          sort_order: 0,
        };
    this.public = isPublic;
    this.treatments = treatments;
    this.onSaved = onSaved;
    this.pending = 0;
    this.render();
  },
  render() {
    const a = this.data,
      p = a.payload || {};
    PC.modal(
      a.id ? "설명자료 편집" : "새 설명자료 만들기",
      `
    <form id="asset-form" class="stack" onsubmit="Editor.save(event)"><div class="form-grid"><label class="field span-2">자료 제목<input class="input" name="title" required maxlength="180" value="${PC.esc(a.title)}" placeholder="환자가 이해하기 쉬운 제목을 입력해 주세요"></label><label class="field">자료 형식<select name="type" class="input" onchange="Editor.changeType(this.value)">${["image", "video", "steps", "progression", "cost", "faq", "compare"].map((t) => `<option value="${t}" ${a.type === t ? "selected" : ""}>${PC.typeInfo(t)[0]}</option>`).join("")}</select></label><label class="field">진료 항목<select name="treatment_id" class="input"><option value="">공통 자료</option>${this.treatments.map((t) => `<option value="${t.id}" ${String(a.treatment_id) === String(t.id) ? "selected" : ""}>${PC.esc(t.name)}</option>`).join("")}</select></label><label class="field">자료 분류<select name="category" class="input">${[
      ["process", "치료 과정"],
      ["progression", "질환 진행"],
      ["caution", "주의사항"],
      ["cost", "비용 안내"],
      ["faq", "자주 묻는 질문"],
      ["compare", "비포·애프터"],
      ["clinic", "병원 안내"],
    ]
      .map(
        ([v, l]) =>
          `<option value="${v}" ${a.category === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field">감수 원장<input name="reviewer_name" class="input" required maxlength="100" value="${PC.esc(a.reviewer_name)}"></label><label class="field span-2">설명<textarea name="description" class="input" rows="3" maxlength="5000">${PC.esc(a.description)}</textarea></label></div>
    <section>${this.payloadForm()}</section>
    <div class="form-grid"><label class="field">태그 <small>쉼표로 구분</small><input class="input" name="tags" value="${PC.esc(a.tags?.join(", "))}" maxlength="1000" placeholder="임플란트, 관리"></label><label class="field">노출 순서 <small>작은 숫자가 먼저 표시됩니다</small><input class="input" name="sort_order" type="number" min="-999" max="9999" value="${Number(a.sort_order) || 0}"></label></div><p class="notice ${this.public ? "" : "green"}"><i class="fas ${this.public ? "fa-globe" : "fa-lock"}"></i>${this.public ? "공개 라이브러리에 등록됩니다. 환자 식별정보와 저작권을 확인해 주세요." : "우리 병원 계정에서만 사용할 수 있습니다. 실제 환자 사진은 사용 동의를 확인해 주세요."}</p><p id="editor-error" class="error-message hidden" role="alert"></p></form>`,
      `<button type="button" class="btn-ghost" onclick="PC.closeModal()">취소</button><button class="btn-primary" id="editor-save" type="submit" form="asset-form"><i class="fas fa-check"></i>자료 저장</button>`,
    );
    const drop = document.getElementById("asset-drop");
    if (drop) {
      drop.ondragover = (e) => {
        e.preventDefault();
        drop.classList.add("drag");
      };
      drop.ondragleave = () => drop.classList.remove("drag");
      drop.ondrop = (e) => {
        e.preventDefault();
        drop.classList.remove("drag");
        this.upload(e.dataTransfer.files);
      };
    }
  },
  payloadForm() {
    const a = this.data,
      p = a.payload || {};
    if (a.type === "faq")
      return `<div class="stack"><label class="field">환자의 질문<input class="input" data-payload="question" required maxlength="300" value="${PC.esc(p.question || "")}"></label><label class="field">답변<textarea class="input" data-payload="answer" rows="5" required maxlength="5000">${PC.esc(p.answer || "")}</textarea></label></div>`;
    if (a.type === "cost") {
      if (!p.rows?.length)
        p.rows = [{ item: "", price: "", insurance: "비급여", note: "" }];
      return `<div class="row spread"><b>수가 항목</b><button type="button" class="btn-ghost btn-sm" onclick="Editor.addRow()"><i class="fas fa-plus"></i>항목 추가</button></div>${p.rows
        .map(
          (r, i) =>
            `<div class="editor-row" data-row="${i}"><div class="row spread" style="margin-bottom:10px"><span class="small muted">항목 ${i + 1}</span><button type="button" class="icon-btn" aria-label="항목 삭제" onclick="Editor.removeRow(${i})"><i class="fas fa-xmark"></i></button></div><div class="form-grid">${[
              ["item", "항목명"],
              ["price", "비용 (예: 100,000원)"],
              ["insurance", "급여 / 비급여"],
              ["note", "비고"],
            ]
              .map(
                ([k, l]) =>
                  `<label class="field">${l}<input class="input" data-key="${k}" ${["item", "price"].includes(k) ? "required" : ""} maxlength="150" value="${PC.esc(r[k] || "")}"></label>`,
              )
              .join("")}</div></div>`,
        )
        .join(
          "",
        )}<label class="field" style="margin-top:15px">비용 안내 문구<textarea class="input" data-payload="note" maxlength="1000">${PC.esc(p.note || "")}</textarea></label>`;
    }
    if (["steps", "progression"].includes(a.type)) {
      const k = a.type === "steps" ? "steps" : "stages";
      if (!p[k]?.length) p[k] = [{ title: "", desc: "", image: "", label: "" }];
      return `<div class="row spread"><b>단계별 설명</b><button type="button" class="btn-ghost btn-sm" onclick="Editor.addRow()"><i class="fas fa-plus"></i>단계 추가</button></div>${p[k].map((r, i) => `<div class="editor-row" data-row="${i}"><div class="row spread" style="margin-bottom:10px"><span class="badge badge-accent">STEP ${String(i + 1).padStart(2, "0")}</span><button type="button" class="icon-btn" aria-label="단계 삭제" onclick="Editor.removeRow(${i})"><i class="fas fa-xmark"></i></button></div><div class="stack" style="gap:11px"><input class="input" data-key="title" required maxlength="150" placeholder="단계 제목" aria-label="단계 제목" value="${PC.esc(r.title)}"><textarea class="input" data-key="desc" maxlength="1500" placeholder="설명" aria-label="단계 설명">${PC.esc(r.desc)}</textarea><div class="row"><input class="input" data-key="image" placeholder="이미지 URL 또는 오른쪽에서 업로드" aria-label="단계 이미지 URL" value="${PC.esc(r.image)}"><label class="btn-ghost btn-sm">업로드<input hidden type="file" accept="image/png,image/jpeg,image/webp" onchange="Editor.uploadStage(this.files[0],${i})"></label></div>${r.image ? `<img src="${PC.url(r.image)}" style="height:70px;object-fit:contain;align-self:start" alt="단계 미리보기">` : ""}</div></div>`).join("")}`;
    }
    return `<label id="asset-drop" class="upload-drop"><input hidden id="asset-files" type="file" ${a.type === "video" ? 'accept="video/mp4,video/webm"' : 'accept="image/png,image/jpeg,image/webp"'} multiple onchange="Editor.upload(this.files)"><i class="fas fa-cloud-arrow-up"></i><b>파일을 끌어놓거나 클릭해 업로드</b><p style="font-size:10px;margin-top:5px">${a.type === "video" ? "MP4 · WebM" : "JPG · PNG · WebP"} · 파일당 10MB · 최대 12개</p></label><div id="upload-preview" class="upload-preview">${(a.media_urls || []).map((url, i) => `<figure>${a.type === "video" ? `<video src="${PC.url(url)}" muted></video>` : `<img src="${PC.url(url)}" alt="업로드 ${i + 1}">`}<button type="button" aria-label="파일 제거" onclick="Editor.removeFile(${i})"><i class="fas fa-xmark"></i></button></figure>`).join("")}</div>${a.type === "compare" ? '<p class="help-note" style="margin-top:10px">첫 번째 사진은 Before, 두 번째는 After입니다. 환자 공유 링크에서는 제외됩니다.</p>' : ""}`;
  },
  sync() {
    const f = document.getElementById("asset-form");
    if (!f) return;
    for (const [k, v] of new FormData(f)) {
      if (k === "tags")
        this.data.tags = String(v)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      else this.data[k] = v;
    }
    const p = this.data.payload || (this.data.payload = {});
    f.querySelectorAll("[data-payload]").forEach(
      (el) => (p[el.dataset.payload] = el.value),
    );
    const key = { cost: "rows", steps: "steps", progression: "stages" }[
      this.data.type
    ];
    if (key)
      p[key] = [...f.querySelectorAll("[data-row]")].map((row) =>
        Object.fromEntries(
          [...row.querySelectorAll("[data-key]")].map((el) => [
            el.dataset.key,
            el.value,
          ]),
        ),
      );
    if (this.data.type === "compare") {
      p.before = this.data.media_urls[0] || "";
      p.after = this.data.media_urls[1] || "";
    }
  },
  changeType(type) {
    this.sync();
    this.data.type = type;
    this.data.payload = {};
    this.render();
  },
  addRow() {
    this.sync();
    const k = { cost: "rows", steps: "steps", progression: "stages" }[
      this.data.type
    ];
    if (this.data.payload[k].length >= (k === "rows" ? 30 : 12))
      return PC.toast("최대 항목 수에 도달했습니다.", "err");
    this.data.payload[k].push({});
    this.render();
  },
  removeRow(i) {
    this.sync();
    const k = { cost: "rows", steps: "steps", progression: "stages" }[
      this.data.type
    ];
    if (this.data.payload[k].length === 1)
      return PC.toast("최소 한 항목이 필요합니다.");
    this.data.payload[k].splice(i, 1);
    this.render();
  },
  removeFile(i) {
    this.sync();
    this.data.media_urls.splice(i, 1);
    this.render();
  },
  async upload(files) {
    this.sync();
    const list = [...files];
    if (this.pending) return;
    if (this.data.media_urls.length + list.length > 12)
      return PC.toast("파일은 최대 12개입니다.", "err");
    this.pending++;
    const btn = document.getElementById("editor-save");
    btn.disabled = true;
    btn.textContent = "업로드 중…";
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await axios.post("/api/upload", fd);
        this.data.media_urls.push(data.url);
      }
      this.sync();
      this.render();
    } catch (e) {
      PC.error(e);
    } finally {
      this.pending = 0;
      const b = document.getElementById("editor-save");
      if (b) {
        b.disabled = false;
        b.textContent = "자료 저장";
      }
    }
  },
  async uploadStage(file, i) {
    if (!file || this.pending) return;
    this.sync();
    this.pending++;
    document.getElementById("editor-save").disabled = true;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await axios.post("/api/upload", fd);
      this.sync();
      const k = this.data.type === "steps" ? "steps" : "stages";
      this.data.payload[k][i].image = data.url;
      this.render();
    } catch (e) {
      PC.error(e);
    } finally {
      this.pending = 0;
      const b = document.getElementById("editor-save");
      if (b) b.disabled = false;
    }
  },
  async save(e) {
    e.preventDefault();
    if (this.pending) return;
    this.sync();
    const a = this.data,
      btn = document.getElementById("editor-save"),
      error = document.getElementById("editor-error");
    error.classList.add("hidden");
    btn.disabled = true;
    try {
      if (["image", "video"].includes(a.type) && !a.media_urls.length)
        throw new Error("파일을 먼저 업로드해 주세요.");
      await axios[a.id ? "put" : "post"](
        a.id ? `/api/assets/${a.id}` : "/api/assets",
        { ...a, is_public: this.public },
      );
      PC.closeModal();
      PC.toast("설명자료가 저장되었습니다.");
      await this.onSaved();
    } catch (err) {
      error.textContent = err.response?.data?.error || err.message;
      error.classList.remove("hidden");
      btn.disabled = false;
    }
  },
};
