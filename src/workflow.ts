import { Hono } from "hono";
import {
  requireUser,
  requireClinic,
  rateLimit,
  digest,
  type Bindings,
  type AuthUser,
} from "./auth";
import {
  fail,
  text,
  idOf,
  assetFor,
  activeShare,
  shareSlides,
} from "./security";

export function governance(b: any, u: AuthUser, old: any = {}) {
  const merged = { ...old, ...b },
    rights = text(merged.usage_rights || "unconfirmed", 30);
  if (
    ![
      "unconfirmed",
      "owned",
      "licensed",
      "consented",
      "public_domain",
    ].includes(rights)
  )
    fail("사용 권한을 확인해 주세요.");
  const source = text(merged.source_url, 1800);
  if (source && !/^https:\/\/[^\s<>"']+$/.test(source))
    fail("출처는 HTTPS 주소로 입력해 주세요.");
  const changed = [
    "title",
    "description",
    "payload",
    "media_urls",
    "reviewer_name",
    "source_url",
    "source_note",
    "usage_rights",
  ].some((k) => k in b && JSON.stringify(b[k]) !== JSON.stringify(old[k]));
  let status = merged.review_status || "unreviewed",
    at = old.reviewed_at || null,
    by = old.reviewed_by || null;
  if (!["draft", "unreviewed", "reviewed"].includes(status))
    fail("검토 상태를 확인해 주세요.");
  if (status === "reviewed" && b.review_confirmed === true) {
    if (!["owner", "admin"].includes(u.role))
      fail("대표 또는 운영자 계정으로 검토해 주세요.", 403);
    if (rights === "unconfirmed")
      fail("사용 권한 확인 후 검토 완료로 표시할 수 있습니다.");
    at = new Date().toISOString();
    by = u.id;
  } else if (changed || old.review_status !== "reviewed") {
    if (status === "reviewed") status = "unreviewed";
    at = null;
    by = null;
  }
  return {
    staff_note: text(merged.staff_note, 4000),
    source_url: source,
    source_note: text(merged.source_note, 1500),
    usage_rights: rights,
    review_status: status,
    reviewed_at: at,
    reviewed_by: by,
  };
}
export async function patientSnapshot(env: Bindings, row: any) {
  if (row.share_snapshot) return JSON.parse(row.share_snapshot);
  const slides = await shareSlides(env, row),
    ids = [
      ...new Set(slides.map((s: any) => s.asset.treatment_id).filter(Boolean)),
    ];
  let cautions: any[] = [];
  if (ids.length) {
    const r = await env.DB.prepare(
      `SELECT title,description FROM assets WHERE category='caution' AND type!='compare' AND is_hidden=0 AND (is_public=1 OR clinic_id=?) AND treatment_id IN (${ids.map(() => "?").join(",")}) ORDER BY sort_order`,
    )
      .bind(row.clinic_id, ...ids)
      .all();
    cautions = r.results;
  }
  return {
    slides,
    patient_label: row.patient_label || "",
    schedule_note: row.schedule_note || "",
    cautions,
    created_at: row.created_at,
  };
}
const api = new Hono<{ Bindings: Bindings }>();
async function validItems(c: any, items: any, u: AuthUser) {
  if (!Array.isArray(items) || !items.length || items.length > 40)
    fail("상담 세트는 1~40장으로 구성해 주세요.");
  const out: any[] = [],
    seen = new Set<string>();
  for (const x of items) {
    if (!x || typeof x !== "object") fail("자료 형식을 확인해 주세요.");
    const a = await assetFor(c.env, x.asset_id, u),
      p = JSON.parse(a.payload || "{}"),
      urls = JSON.parse(a.media_urls || "[]"),
      sub = Number(x.sub_index ?? 0),
      max = Math.max(1, (p.steps || p.stages || urls).length);
    if (!Number.isInteger(sub) || sub < 0 || sub >= max)
      fail("자료 단계를 확인해 주세요.");
    const key = a.id + ":" + sub;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ asset_id: a.id, sub_index: sub });
  }
  return out;
}
api.get("/sessions/:id/preview", async (c) => {
  const u = await requireUser(c),
    row = await c.env.DB.prepare(
      "SELECT * FROM consult_sessions WHERE id=? AND clinic_id=?",
    )
      .bind(idOf(c.req.param("id")), requireClinic(u))
      .first<any>();
  if (!row) fail("상담을 찾을 수 없습니다.", 404);
  return c.json({
    ...(await patientSnapshot(c.env, { ...row, share_snapshot: null })),
    version: row.version,
  });
});
api.get("/sets", async (c) => {
  const u = await requireUser(c);
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM consult_sets WHERE clinic_id=? ORDER BY updated_at DESC,id DESC",
  )
    .bind(requireClinic(u))
    .all<any>();
  return c.json({
    sets: results.map((r) => ({ ...r, items: JSON.parse(r.items) })),
  });
});
api.post("/sets", async (c) => {
  const u = await requireUser(c),
    clinic = requireClinic(u),
    b = await c.req.json(),
    items = await validItems(c, b.items, u);
  const r = await c.env.DB.prepare(
    "INSERT INTO consult_sets(clinic_id,user_id,title,description,items) VALUES(?,?,?,?,?)",
  )
    .bind(
      clinic,
      u.id,
      text(b.title, 150, true),
      text(b.description, 500),
      JSON.stringify(items),
    )
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});
api.put("/sets/:id", async (c) => {
  const u = await requireUser(c),
    clinic = requireClinic(u),
    b = await c.req.json(),
    row = await c.env.DB.prepare(
      "SELECT * FROM consult_sets WHERE id=? AND clinic_id=?",
    )
      .bind(idOf(c.req.param("id")), clinic)
      .first<any>();
  if (!row) fail("상담 세트를 찾을 수 없습니다.", 404);
  if (b.version !== row.version) fail("다른 화면에서 수정된 세트입니다.", 409);
  const items = await validItems(c, b.items, u);
  const r = await c.env.DB.prepare(
    "UPDATE consult_sets SET title=?,description=?,items=?,version=version+1,updated_at=datetime('now') WHERE id=? AND clinic_id=? AND version=?",
  )
    .bind(
      text(b.title, 150, true),
      text(b.description, 500),
      JSON.stringify(items),
      row.id,
      clinic,
      row.version,
    )
    .run();
  if (!r.meta.changes) fail("다른 화면에서 수정된 세트입니다.", 409);
  return c.json({ ok: true, version: row.version + 1 });
});
api.delete("/sets/:id", async (c) => {
  const u = await requireUser(c);
  const r = await c.env.DB.prepare(
    "DELETE FROM consult_sets WHERE id=? AND clinic_id=?",
  )
    .bind(idOf(c.req.param("id")), requireClinic(u))
    .run();
  if (!r.meta.changes) fail("상담 세트를 찾을 수 없습니다.", 404);
  return c.json({ ok: true });
});
api.post("/share/:token/feedback", async (c) => {
  const row = await activeShare(c.env, c.req.param("token"));
  if (!row) fail("공유가 종료되었습니다.", 404);
  const b = await c.req.json(),
    kind = text(b.kind, 20, true),
    visitor = text(b.visitor, 100, true);
  if (!["understood", "question", "schedule"].includes(kind))
    fail("확인 항목을 선택해 주세요.");
  if (!/^[\w-]{16,100}$/.test(visitor))
    fail("브라우저 식별자를 확인해 주세요.");
  await rateLimit(
    c,
    "feedback-ip:" +
      row.id +
      ":" +
      (c.req.header("CF-Connecting-IP") || "local"),
    30,
    3600,
  );
  await rateLimit(c, "feedback:" + row.id + ":" + visitor, 8, 3600);
  const key = await digest(visitor),
    message = text(b.message, 500);
  const r = await c.env.DB.prepare(
    `INSERT INTO patient_feedback(session_id,clinic_id,visitor_key,kind,message) VALUES(?,?,?,?,?) ON CONFLICT(session_id,visitor_key,kind) DO UPDATE SET message=excluded.message,status='open',resolved_at=NULL,resolved_by=NULL,updated_at=datetime('now') RETURNING id`,
  )
    .bind(row.id, row.clinic_id, key, kind, message)
    .first<any>();
  return c.json({
    ok: true,
    id: r.id,
    message:
      "병원 확인 목록에 전달되었습니다. 치료 동의나 예약 확정이 아닙니다.",
  });
});
api.get("/feedback", async (c) => {
  const u = await requireUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT f.id,f.session_id,f.kind,f.message,f.status,f.created_at,f.updated_at,f.resolved_at,s.patient_label,json_extract(s.slides,'$[0].asset_id') AS first_asset_id FROM patient_feedback f JOIN consult_sessions s ON s.id=f.session_id WHERE f.clinic_id=? ORDER BY f.status='open' DESC,f.updated_at DESC LIMIT 300`,
  )
    .bind(requireClinic(u))
    .all();
  return c.json({ feedback: results });
});
api.put("/feedback/:id", async (c) => {
  const u = await requireUser(c),
    b = await c.req.json();
  if (!["open", "resolved"].includes(b.status))
    fail("처리 상태를 확인해 주세요.");
  const r = await c.env.DB.prepare(
    "UPDATE patient_feedback SET status=?,resolved_at=CASE WHEN ?='resolved' THEN datetime('now') ELSE NULL END,resolved_by=CASE WHEN ?='resolved' THEN ? ELSE NULL END WHERE id=? AND clinic_id=?",
  )
    .bind(
      b.status,
      b.status,
      b.status,
      u.id,
      idOf(c.req.param("id")),
      requireClinic(u),
    )
    .run();
  if (!r.meta.changes) fail("확인 항목을 찾을 수 없습니다.", 404);
  return c.json({ ok: true });
});
export default api;
