import { HTTPException } from "hono/http-exception";
import type { AuthUser, Bindings } from "./auth";
export function fail(
  message: string,
  status: 400 | 403 | 404 | 409 | 413 = 400,
): never {
  throw new HTTPException(status, { message });
}
export const text = (v: unknown, max = 500, required = false) => {
  if (v == null && !required) return "";
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(`입력 내용을 확인해 주세요. 최대 ${max}자입니다.`);
  return (v as string).trim();
};
export function passwordValue(v: unknown) {
  if (typeof v !== "string" || !v.trim() || v.length > 128)
    fail("비밀번호는 1~128자로 입력해 주세요.");
  return v as string;
}
export const idOf = (v: unknown) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) fail("올바른 항목을 선택해 주세요.");
  return n;
};
export const parseAsset = (r: any) => ({
  ...r,
  media_urls: JSON.parse(r.media_urls || "[]"),
  payload: JSON.parse(r.payload || "{}"),
  tags: JSON.parse(r.tags || "[]"),
});
export const canRead = (a: any, u: AuthUser | null) =>
  !!a &&
  (u?.role === "admin" ||
    (!!u?.clinic_id && a.clinic_id === u.clinic_id) ||
    (a.is_public === 1 && !a.is_hidden));
export const canEdit = (a: any, u: AuthUser) =>
  !!a && (u.role === "admin" || (!!u.clinic_id && a.clinic_id === u.clinic_id));
export async function assetFor(env: Bindings, id: unknown, u: AuthUser | null) {
  const a = await env.DB.prepare("SELECT * FROM assets WHERE id=?")
    .bind(idOf(id))
    .first<any>();
  if (!canRead(a, u)) fail("자료가 없거나 접근 권한이 없습니다.", 404);
  return a;
}
export function mediaURL(value: unknown) {
  const url = text(value, 1800);
  if (!url) return "";
  // Existing library seeds contain Korean titles and spaces in /ph query strings.
  // Canonicalize only this fixed local endpoint; keep active protocols and file paths restricted.
  if (/^\/ph(?:\?|$)/.test(url) && !/[\u0000-\u001f]/.test(url)) {
    const placeholder = new URL(url, "https://placeholder.invalid");
    if (placeholder.pathname === "/ph") {
      const query = placeholder.searchParams.toString();
      return "/ph" + (query ? "?" + query : "");
    }
  }
  if (
    /^\/(?:files\/[a-zA-Z0-9/_\-.]+|ph(?:\?[^<>"'\s]*)?)$/.test(url) &&
    !url.includes("..")
  )
    return url;
  // Avoid active protocols, attribute injection, and same-origin external-form URLs.
  if (/^https:\/\/[^\s<>"']+$/.test(url)) {
    try {
      const p = new URL(url);
      if (!p.username && !p.password) return p.href;
    } catch {}
  }
  fail("이미지는 업로드 파일 또는 안전한 HTTPS 주소를 사용해 주세요.");
}
export function urlsIn(value: any): string[] {
  if (typeof value === "string")
    return value.startsWith("/files/") ? [value.split("?")[0]] : [];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(urlsIn);
}
export async function checkMediaOwnership(
  env: Bindings,
  value: any,
  user: AuthUser,
) {
  for (const url of new Set(urlsIn(value))) {
    if (
      user.role === "admin" ||
      (user.clinic_id && url.startsWith(`/files/clinic${user.clinic_id}/`))
    )
      continue;
    const publicRef = await env.DB.prepare(
      "SELECT id FROM assets WHERE is_public=1 AND is_hidden=0 AND (instr(media_urls,?)>0 OR instr(payload,?)>0) LIMIT 1",
    )
      .bind(JSON.stringify(url), JSON.stringify(url))
      .first();
    if (!publicRef) fail("다른 병원의 파일은 사용할 수 없습니다.", 403);
  }
}
export function validateAsset(b: any) {
  if (!b || typeof b !== "object" || Array.isArray(b))
    fail("잘못된 자료 형식입니다.");
  const type = text(b.type, 30, true),
    category = text(b.category, 30, true);
  if (
    ![
      "image",
      "video",
      "compare",
      "progression",
      "cost",
      "steps",
      "faq",
    ].includes(type)
  )
    fail("자료 유형을 확인해 주세요.");
  if (
    ![
      "process",
      "progression",
      "caution",
      "cost",
      "compare",
      "faq",
      "clinic",
    ].includes(category)
  )
    fail("자료 분류를 확인해 주세요.");
  const p = b.payload || {},
    payload: any = {};
  if (typeof p !== "object" || Array.isArray(p))
    fail("자료 내용 형식을 확인해 주세요.");
  for (const field of ["steps", "stages", "rows"])
    if (
      Array.isArray(p[field]) &&
      p[field].some((r: any) => !r || typeof r !== "object" || Array.isArray(r))
    )
      fail("자료 항목 형식을 확인해 주세요.");
  if (["steps", "progression"].includes(type)) {
    const field = type === "steps" ? "steps" : "stages";
    if (!Array.isArray(p[field]) || !p[field].length || p[field].length > 12)
      fail("단계는 1~12개로 입력해 주세요.");
    payload[field] = p[field].map((s: any) => ({
      title: text(s.title, 150, true),
      image: mediaURL(s.image),
      desc: text(s.desc, 1500),
      label: text(s.label, 50),
    }));
  }
  if (type === "cost") {
    if (!Array.isArray(p.rows) || !p.rows.length || p.rows.length > 30)
      fail("수가 항목은 1~30개로 입력해 주세요.");
    payload.rows = p.rows.map((r: any) => ({
      item: text(r.item, 150, true),
      price: text(r.price, 100, true),
      insurance: text(r.insurance, 50),
      note: text(r.note, 300),
    }));
    payload.note = text(p.note, 1000);
  }
  if (type === "faq") {
    payload.question = text(p.question, 300, true);
    payload.answer = text(p.answer, 5000, true);
  }
  if (type === "compare") {
    payload.before = mediaURL(p.before || b.media_urls?.[0]);
    payload.after = mediaURL(p.after || b.media_urls?.[1]);
    if (!payload.before || !payload.after)
      fail("비교 이미지 두 장이 필요합니다.");
  }
  if (!Array.isArray(b.media_urls || []) || (b.media_urls || []).length > 12)
    fail("파일은 최대 12개입니다.");
  if (!Array.isArray(b.tags || []) || (b.tags || []).length > 20)
    fail("태그는 최대 20개입니다.");
  if (["image", "video"].includes(type) && !(b.media_urls || []).length)
    fail("파일을 최소 한 개 등록해 주세요.");
  if (type === "compare" && (b.media_urls || []).length > 2)
    fail("비포·애프터는 사진 두 장만 등록해 주세요.");
  return {
    title: text(b.title, 180, true),
    description: text(b.description, 5000),
    type,
    category,
    treatment_id: b.treatment_id ? idOf(b.treatment_id) : null,
    media_urls: (b.media_urls || []).map(mediaURL),
    payload,
    reviewer_name: text(b.reviewer_name, 100, true),
    tags: (b.tags || []).map((t: any) => text(t, 50)),
    is_hidden: b.is_hidden ? 1 : 0,
    sort_order: Math.max(-999, Math.min(9999, Number(b.sort_order) || 0)),
  };
}
export function snapshot(a: any) {
  const p = typeof a.media_urls === "string" ? parseAsset(a) : a;
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.type,
    category: p.category,
    treatment_id: p.treatment_id,
    media_urls: p.media_urls,
    payload: p.payload,
    reviewer_name: p.reviewer_name,
    review_status: p.review_status || "unreviewed",
    reviewed_at: p.reviewed_at || null,
    source_url: p.source_url || "",
    usage_rights: p.usage_rights || "unconfirmed",
    tags: p.tags,
  };
}
export function sharedFiles(slides: any[]) {
  return slides.flatMap((s) => [
    ...urlsIn(s.asset?.media_urls || []),
    ...urlsIn(
      (s.asset?.payload?.steps || s.asset?.payload?.stages || []).map(
        (x: any) => x?.image,
      ),
    ),
    ...urlsIn([s.asset?.payload?.before, s.asset?.payload?.after]),
    ...(s.drawing_url ? [s.drawing_url] : []),
  ]);
}
export function withShareUrls(value: any, token: string): any {
  if (typeof value === "string" && value.startsWith("/files/"))
    return `${value.split("?")[0]}?share=${encodeURIComponent(token)}`;
  if (Array.isArray(value)) return value.map((v) => withShareUrls(v, token));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, withShareUrls(v, token)]),
    );
  return value;
}
export async function activeShare(env: Bindings, token: string) {
  if (!/^[a-f0-9]{24,64}$/.test(token)) return null;
  return env.DB.prepare(
    "SELECT * FROM consult_sessions WHERE share_token=? AND share_revoked_at IS NULL AND share_expires_at>datetime('now')",
  )
    .bind(token)
    .first<any>();
}
export async function shareSlides(env: Bindings, row: any) {
  if (row.share_snapshot) return JSON.parse(row.share_snapshot).slides || [];
  const out: any[] = [];
  for (const s of JSON.parse(row.slides || "[]").slice(0, 40)) {
    if (s.include_in_share === false) continue;
    let a = s.asset;
    if (!a) {
      const raw = await env.DB.prepare(
        "SELECT * FROM assets WHERE id=? AND (is_public=1 OR clinic_id=?)",
      )
        .bind(s.asset_id, row.clinic_id)
        .first<any>();
      if (raw) a = snapshot(raw);
    }
    if (!a || a.type === "compare") continue;
    // Do not leak unselected sibling stages or their private file URLs through the asset payload.
    a = structuredClone(a);
    const selectedIndex = Number(s.sub_index) || 0;
    if (a.payload?.steps)
      a.payload.steps = a.payload.steps.map((x: any, i: number) =>
        i === selectedIndex ? x : null,
      );
    if (a.payload?.stages)
      a.payload.stages = a.payload.stages.map((x: any, i: number) =>
        i === selectedIndex ? x : null,
      );
    if (["image", "video"].includes(a.type))
      a.media_urls = (a.media_urls || []).map((url: string, i: number) =>
        i === selectedIndex ? url : "",
      );
    else if (["steps", "progression"].includes(a.type)) a.media_urls = [];
    out.push({
      asset_id: s.asset_id,
      sub_index: s.sub_index || 0,
      asset: a,
      note: s.note || "",
      drawing_url: s.drawing_url || null,
      drawing_png: s.drawing_png || null,
      aspect: s.aspect || null,
    });
  }
  return out;
}
