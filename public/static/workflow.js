// Only a non-sensitive draft ID is kept in sessionStorage; all notes/content live in D1.
PC.DraftSaver = class {
  constructor(options) {
    Object.assign(this, options);
    this.revision = 0;
    this.ack = 0;
    this.pending = null;
    this.sending = null;
    this.conflicted = false;
    this.last = 0;
    this.failed = false;
  }
  mark() {
    this.revision++;
    this.failed = false;
    this.onState("dirty");
    this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.conflicted) return;
    this.timer = setTimeout(
      () => this.flush().catch(() => {}),
      Math.max(2500, 6500 - (Date.now() - this.last)),
    );
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.conflicted)
      throw new Error("다른 화면의 변경을 먼저 확인해 주세요.");
    if (this.sending) {
      await this.sending;
      return this.ack < this.revision ? this.flush() : this.read().id;
    }
    if (this.ack === this.revision && !this.pending) return this.read().id;
    if (!navigator.onLine) {
      this.onState("offline");
      throw new Error(
        "연결이 끊겼습니다. 화면을 닫지 말고 연결 후 다시 저장해 주세요.",
      );
    }
    if (!this.pending)
      this.pending = {
        revision: this.revision,
        payload: { ...this.read(), write_key: crypto.randomUUID() },
      };
    const job = this.pending;
    this.failed = false;
    this.onState("saving");
    this.sending = (async () => {
      try {
        const { data } = await axios.post("/api/sessions", job.payload);
        this.onSaved(data, job.payload);
        this.ack = job.revision;
        this.pending = null;
        this.last = Date.now();
        this.onState(this.ack === this.revision ? "saved" : "dirty");
        return data.id;
      } catch (e) {
        this.failed = true;
        if (
          e.response?.status >= 400 &&
          e.response?.status < 500 &&
          e.response?.status !== 409
        )
          this.pending = null;
        if (e.response?.status === 409) {
          this.conflicted = true;
          this.onState("conflict");
          this.onConflict?.(e);
        } else this.onState(e.response ? "error" : "offline");
        throw e;
      } finally {
        this.sending = null;
        if (!this.failed && !this.pending && this.ack < this.revision)
          this.schedule();
      }
    })();
    return this.sending;
  }
  dispose() {
    clearTimeout(this.timer);
  }
};
PC.draftKey = () => `pc_draft_${PC.user?.id || 0}`;
PC.currentDraft = () => {
  try {
    return Number(sessionStorage.getItem(PC.draftKey())) || null;
  } catch {
    return null;
  }
};
PC.rememberDraft = (id) => {
  try {
    if (id) sessionStorage.setItem(PC.draftKey(), String(id));
    else sessionStorage.removeItem(PC.draftKey());
  } catch {}
};
PC.reviewBadge = (a) =>
  `<span class="badge ${a.review_status === "reviewed" ? "badge-ok" : a.review_status === "draft" ? "badge-warn" : "badge-neutral"}">${a.review_status === "reviewed" ? "검토 확인" : a.review_status === "draft" ? "검토 전 초안" : "검토 미확인"}</span>`;
PC.addToConsult = async (id) => {
  if (!PC.user?.clinic_id) {
    PC.toast("병원 로그인 후 상담에 담을 수 있습니다.");
    return;
  }
  if (PC.adding) return;
  PC.adding = true;
  try {
    const { data } = await axios.get(`/api/assets/${id}`),
      a = data.asset;
    let session = {
      id: null,
      client_key: crypto.randomUUID(),
      version: 1,
      status: "draft",
      slides: [],
      patient_label: "",
      schedule_note: "",
      internal_note: "",
    };
    const current = PC.currentDraft();
    if (current) {
      try {
        session = (await axios.get("/api/sessions/" + current)).data.session;
      } catch (e) {
        if (e.response?.status !== 404) throw e;
        PC.rememberDraft(null);
      }
    }
    const n = Math.max(
      1,
      (
        a.payload.steps ||
        a.payload.stages ||
        (["image", "video"].includes(a.type) ? a.media_urls : []) ||
        []
      ).length,
    );
    for (let i = 0; i < n; i++)
      if (!session.slides.some((s) => s.asset_id === a.id && s.sub_index === i))
        session.slides.push({
          asset_id: a.id,
          sub_index: i,
          note: "",
          internal_note: "",
          include_in_share: true,
        });
    if (session.slides.length > 40)
      throw new Error("한 상담에는 최대 40장까지 담을 수 있습니다.");
    const saved = await axios.post("/api/sessions", {
      ...session,
      write_key: crypto.randomUUID(),
    });
    PC.rememberDraft(saved.data.id);
    PC.toast("오늘 상담에 담았습니다. 준비 화면에서 순서를 정리하세요.");
    PC.updateDraftLink();
  } catch (e) {
    PC.error(e);
  } finally {
    PC.adding = false;
  }
};
PC.updateDraftLink = () => {
  document
    .querySelectorAll("[data-prepare-link]")
    .forEach(
      (a) =>
        (a.href =
          "/prepare" +
          (PC.currentDraft() ? "?session=" + PC.currentDraft() : "")),
    );
};
PC.openPreparation = () =>
  (location.href =
    "/prepare" + (PC.currentDraft() ? "?session=" + PC.currentDraft() : ""));
PC.patientPreviewHTML = (d) =>
  `<div class="review-intro"><span class="eyebrow">PATIENT VIEW</span><h3>${PC.esc(d.patient_label || "환자 표시명 없음")}</h3><p>아래 내용만 전달됩니다. 내부 메모는 포함되지 않습니다.</p></div>${d.slides
    .filter((s) => s.include_in_share !== false && s.asset?.type !== "compare")
    .map(
      (s, i) =>
        `<article class="review-card"><span class="badge badge-accent">${i + 1}</span><div><b>${PC.esc(s.asset.title)}</b><p class="small muted">${PC.esc((s.asset.payload?.steps || s.asset.payload?.stages || [])[s.sub_index]?.title || "")}</p>${PC.previewMedia(s)}${s.note ? `<p class="patient-note" style="margin:10px 0">${PC.esc(s.note)}</p>` : ""}${PC.reviewBadge(s.asset)}</div></article>`,
    )
    .join(
      "",
    )}${(d.cautions || []).length ? `<section class="patient-cautions"><h3>자동으로 첨부되는 주의사항</h3>${d.cautions.map((c) => `<p><b>${PC.esc(c.title)}</b><br>${PC.esc(c.description)}</p>`).join("")}</section>` : ""}${d.schedule_note ? `<section class="patient-note"><b>다음 일정 / 안내</b>${PC.esc(d.schedule_note)}</section>` : ""}`;

PC.previewMedia = (s) => {
  const a = s.asset,
    p = a.payload || {},
    it = (p.steps || p.stages || [])[s.sub_index] || {};
  if (a.type === "faq")
    return `<div class="patient-note" style="margin:12px 0"><b>${PC.esc(p.question)}</b>${PC.esc(p.answer)}</div>`;
  if (a.type === "cost")
    return `<table class="tbl"><tbody>${(p.rows || []).map((r) => `<tr><td>${PC.esc(r.item)}</td><td>${PC.esc(r.price)}</td><td>${PC.esc(r.insurance)}</td></tr>`).join("")}</tbody></table><p class="help-note">${PC.esc(p.note)}</p>`;
  if (a.type === "video")
    return `<video src="${PC.url(a.media_urls[s.sub_index] || a.media_urls[0])}" controls playsinline style="width:100%"></video>`;
  return `<p class="help-note">${PC.esc(it.desc || a.description)}</p><div class="review-image"><img src="${PC.url(it.image || a.media_urls?.[s.sub_index] || PC.thumbOf(a))}" alt="${PC.esc(a.title)}">${s.drawing_url || s.drawing_png ? `<img class="drawing-overlay" src="${PC.url(s.drawing_url || s.drawing_png)}" alt="상담 판서">` : ""}</div>`;
};
