import type { Context } from "hono";
import {
  requireUser,
  requireClinic,
  rateLimit,
  digest,
  type Bindings,
} from "./auth";
import { fail, text, idOf, assetFor, snapshot } from "./security";
import { patientSnapshot } from "./workflow";
export async function saveConsultation(c: Context<{ Bindings: Bindings }>) {
  const u = await requireUser(c),
    clinic = requireClinic(u),
    b = await c.req.json();
  const state = b.status === "draft" ? "draft" : "saved";
  if (
    !Array.isArray(b.slides) ||
    b.slides.length > 40 ||
    (!b.slides.length && state !== "draft")
  )
    fail("저장할 자료를 담아 주세요. 초안은 빈 상태로 보관할 수 있습니다.");
  const clientKey = b.client_key == null ? null : text(b.client_key, 80, true),
    writeKey = b.write_key == null ? null : text(b.write_key, 80, true);
  if (
    (clientKey && !/^[a-zA-Z0-9_-]{16,80}$/.test(clientKey)) ||
    (writeKey && !/^[a-zA-Z0-9_-]{16,80}$/.test(writeKey))
  )
    fail("저장 식별자가 올바르지 않습니다.");
  await rateLimit(c, `save:${u.id}`, 600, 3600);
  const existing = b.id
    ? await c.env.DB.prepare(
        "SELECT * FROM consult_sessions WHERE id=? AND clinic_id=?",
      )
        .bind(idOf(b.id), clinic)
        .first<any>()
    : clientKey
      ? await c.env.DB.prepare(
          "SELECT * FROM consult_sessions WHERE clinic_id=? AND client_key=?",
        )
          .bind(clinic, clientKey)
          .first<any>()
      : null;
  if (b.id && !existing) fail("상담을 찾을 수 없습니다.", 404);
  if (existing && writeKey && existing.last_write_key === writeKey)
    return c.json({
      ok: true,
      id: existing.id,
      version: existing.version,
      slides: JSON.parse(existing.slides),
      status: existing.status,
      replayed: true,
    });
  if (existing && Number(b.version) !== existing.version)
    return c.json(
      {
        error:
          "다른 화면에서 수정되었습니다. 현재 입력은 유지됩니다. 새로 불러오기 또는 별도 상담 저장을 선택해 주세요.",
        session_id: existing.id,
        version: existing.version,
      },
      409,
    );
  const patientLabel = text(b.patient_label, 100),
    scheduleNote = text(b.schedule_note, 2000),
    internalNote = text(b.internal_note, 4000);
  const oldSlides = JSON.parse(existing?.slides || "[]"),
    slides: any[] = [],
    pending: { index: number; png: string }[] = [],
    seen = new Set<string>(),
    assetCache = new Map<number, any>();
  for (const s of b.slides) {
    if (!s || typeof s !== "object") fail("슬라이드 형식을 확인해 주세요.");
    const id = idOf(s.asset_id),
      sub = Number(s.sub_index ?? 0),
      key = id + ":" + sub;
    if (seen.has(key)) fail("중복된 슬라이드입니다.");
    seen.add(key);
    const old = oldSlides.find(
      (x: any) => x.asset_id === id && (x.sub_index || 0) === sub,
    );
    let a = old?.asset || assetCache.get(id);
    if (!a) {
      a = snapshot(await assetFor(c.env, id, u));
      assetCache.set(id, a);
    }
    const items = a.payload.steps || a.payload.stages || a.media_urls;
    if (
      !Number.isInteger(sub) ||
      sub < 0 ||
      sub >= Math.max(1, items?.length || 0)
    )
      fail("자료 단계를 확인해 주세요.");
    let drawing_url = null;
    if (s.drawing_png) {
      if (
        typeof s.drawing_png !== "string" ||
        s.drawing_png.length > 700000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.drawing_png)
      )
        fail("판서 이미지 형식을 확인해 주세요.");
      pending.push({ index: slides.length, png: s.drawing_png });
    } else if (s.drawing_url) {
      if (s.drawing_url !== old?.drawing_url)
        fail("다른 상담의 판서는 연결할 수 없습니다.", 403);
      drawing_url = s.drawing_url;
    }
    slides.push({
      asset_id: id,
      sub_index: sub,
      asset: a,
      note: text(s.note, 2000),
      internal_note: text(s.internal_note, 2000),
      include_in_share: s.include_in_share !== false,
      drawing_url,
      aspect: Math.min(3, Math.max(0.4, Number(s.aspect) || 1.5)),
    });
  }
  if (new TextEncoder().encode(JSON.stringify(slides)).length > 850000)
    fail("상담 내용이 너무 많습니다. 나누어 저장해 주세요.", 413);
  for (const p of pending) {
    const bytes = Uint8Array.from(atob(p.png.split(",")[1]), (ch) =>
      ch.charCodeAt(0),
    );
    if (bytes[0] !== 137 || bytes[1] !== 80) fail("잘못된 판서 이미지입니다.");
    const key = `clinic${clinic}/drawings/${slides[p.index].asset_id}-${slides[p.index].sub_index}-${await digest(p.png)}.png`;
    await c.env.R2.put(key, bytes, {
      httpMetadata: { contentType: "image/png" },
    });
    slides[p.index].drawing_url = "/files/" + key;
  }
  const json = JSON.stringify(slides);
  let id = b.id,
    version = 1;
  const freeze =
    existing?.share_token && !existing.share_snapshot
      ? JSON.stringify(await patientSnapshot(c.env, existing))
      : null;
  if (existing) {
    const r = await c.env.DB.prepare(
      "UPDATE consult_sessions SET patient_label=?,slides=?,schedule_note=?,internal_note=?,status=?,last_write_key=?,share_snapshot=COALESCE(share_snapshot,?),updated_at=datetime('now'),version=version+1 WHERE id=? AND clinic_id=? AND version=?",
    )
      .bind(
        patientLabel,
        json,
        scheduleNote,
        internalNote,
        state,
        writeKey,
        freeze,
        existing.id,
        clinic,
        existing.version,
      )
      .run();
    if (!r.meta.changes)
      fail(
        "다른 화면에서 수정되었습니다. 입력 내용을 보존하고 다시 확인해 주세요.",
        409,
      );
    id = existing.id;
    version = existing.version + 1;
  } else {
    try {
      const r = await c.env.DB.prepare(
        "INSERT INTO consult_sessions(clinic_id,user_id,patient_label,slides,schedule_note,internal_note,status,client_key,last_write_key) VALUES(?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          clinic,
          u.id,
          patientLabel,
          json,
          scheduleNote,
          internalNote,
          state,
          clientKey,
          writeKey,
        )
        .run();
      id = r.meta.last_row_id;
    } catch (e) {
      if (clientKey) {
        const row = await c.env.DB.prepare(
          "SELECT * FROM consult_sessions WHERE clinic_id=? AND client_key=?",
        )
          .bind(clinic, clientKey)
          .first<any>();
        if (row?.last_write_key === writeKey && writeKey)
          return c.json({
            ok: true,
            id: row.id,
            version: row.version,
            slides: JSON.parse(row.slides),
            status: row.status,
            replayed: true,
          });
        if (row) fail("이미 다른 화면에서 생성한 초안입니다.", 409);
      }
      throw e;
    }
  }
  return c.json({ ok: true, id, version, slides, status: state });
}
