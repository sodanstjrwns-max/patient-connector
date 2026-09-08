// Destructive integration fixtures are restricted to the LOCAL Wrangler preview.
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
mkdirSync(".test-results", { recursive: true });
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
const base = process.env.TEST_URL || "http://localhost:3000";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Tests may only run against local Wrangler",
);
let checks = 0;
function check(value, label) {
  assert(value, label);
  checks++;
  console.log("PASS", label);
}
async function request(
  path,
  { method = "GET", body, cookie, headers = {} } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
check(
  (
    await request("/api/auth/login", {
      method: "POST",
      body: { email: "admin@patientconnect.kr", password: "admin1234" },
    })
  ).status === 401,
  "Former publicly documented operator password is disabled",
);
const stamp = Date.now(),
  password = "Qa!" + randomBytes(15).toString("hex");
async function signup(key) {
  const email = `care-qa-${stamp}-${key}@example.test`;
  const r = await request("/api/auth/signup", {
    method: "POST",
    body: {
      email,
      password,
      name: "검증 전용 " + key,
      clinic_name: "검증 병원 " + key,
      specialty: "치과",
    },
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  const me = await request("/api/auth/me", { cookie: r.cookie });
  return { email, password, cookie: r.cookie, user: me.data.user };
}
const A = await signup("a"),
  B = await signup("b"),
  admin = await signup("admin");
const localSQL = (sql) =>
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "webapp-production",
      "--local",
      "--command",
      sql,
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
localSQL(`UPDATE users SET role='admin' WHERE id=${admin.user.id}`);
check(
  A.user.clinic_id !== B.user.clinic_id,
  "Signup atomically creates isolated clinics",
);
const hashes = localSQL(
  `SELECT password_hash FROM users WHERE id IN (${A.user.id},${B.user.id})`,
);
check(
  hashes.includes("pbkdf2$100000$"),
  "Passwords use versioned salted PBKDF2",
);
const login = await request("/api/auth/login", {
  method: "POST",
  body: { email: A.email.toUpperCase(), password },
});
check(login.status === 200 && login.cookie, "Case-insensitive login succeeds");
check(
  login.headers.get("set-cookie").includes("HttpOnly"),
  "Session cookie is HttpOnly",
);
const logout = await request("/api/auth/logout", {
  method: "POST",
  cookie: login.cookie,
});
check(
  logout.status === 200 &&
    (await request("/api/auth/me", { cookie: login.cookie })).data.user ===
      null,
  "Logout revokes server-side session",
);
check(
  (
    await request("/api/auth/login", {
      method: "POST",
      body: { email: A.email, password: "incorrect" },
    })
  ).status === 401,
  "Invalid password rejected",
);
check(
  (
    await request("/api/auth/signup", {
      method: "POST",
      body: {
        email: "weak@example.test",
        password: "123",
        name: "a",
        clinic_name: "b",
        specialty: "치과",
      },
    })
  ).status === 400,
  "Short signup password rejected",
);
check(
  (
    await request("/api/assets", {
      method: "POST",
      cookie: A.cookie,
      body: [],
      headers: { Origin: base },
    })
  ).status === 400,
  "Non-object JSON rejected",
);
check(
  (
    await request("/api/auth/logout", {
      method: "POST",
      cookie: A.cookie,
      headers: { Origin: "https://other.example" },
    })
  ).status === 403,
  "Cross-origin state changes rejected",
);
check(
  (await request("/api/admin/stats", { cookie: A.cookie })).status === 403,
  "Clinic cannot access operator statistics",
);
check(
  (await request("/api/admin/stats", { cookie: admin.cookie })).status === 200,
  "Operator statistics accessible to operator",
);
check(
  (await request("/api/sessions")).status === 401,
  "Consultation history requires authentication",
);
const upload = async (
  cookie,
  type = "image/png",
  bytes = readFileSync("public/static/icon-192.png"),
) => {
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type }), "test.png");
  const r = await fetch(base + "/api/upload", {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  return { status: r.status, data: await r.json() };
};
const uploaded = await upload(A.cookie),
  privateB = await upload(B.cookie);
check(uploaded.status === 201, "Validated image uploads to R2");
check(
  (await upload(A.cookie, "text/html", Buffer.from("<script>bad()</script>")))
    .status === 400,
  "HTML upload rejected",
);
check(
  (await upload(A.cookie, "image/png", Buffer.from("not an image"))).status ===
    400,
  "Spoofed image signature rejected",
);
const privateURL = uploaded.data.url;
check(
  (await fetch(base + privateURL)).status === 404,
  "Anonymous visitor cannot fetch private file",
);
check(
  (await fetch(base + privateURL, { headers: { Cookie: B.cookie } })).status ===
    404,
  "Another clinic cannot fetch private file",
);
check(
  (await fetch(base + privateURL, { headers: { Cookie: A.cookie } })).status ===
    200,
  "Owning clinic can fetch private file",
);
const partial = await fetch(base + privateURL, {
  headers: { Cookie: A.cookie, Range: "bytes=0-9" },
});
check(
  partial.status === 206 && (await partial.arrayBuffer()).byteLength === 10,
  "Authenticated byte-range response supports media seeking",
);
check(
  (
    await fetch(base + privateURL, {
      headers: { Cookie: A.cookie, Range: "bytes=999999999-" },
    })
  ).status === 416,
  "Unsatisfiable media range returns 416",
);
const original = {
  title: "QA 단계별 설명",
  type: "steps",
  category: "process",
  treatment_id: 1,
  description: "검증 전용 자료",
  reviewer_name: "검증 원장",
  media_urls: [],
  tags: ["검증"],
  payload: {
    steps: [
      { title: "첫 단계", desc: "첫 번째 설명", image: privateURL },
      { title: "다음 단계", desc: "두 번째 설명", image: "/ph?t=Second" },
    ],
  },
};
const created = await request("/api/assets", {
  method: "POST",
  cookie: A.cookie,
  body: original,
});
assert.equal(created.status, 201, JSON.stringify(created.data));
const id = created.data.id;
check(
  (await request(`/api/assets/${id}`, { cookie: B.cookie })).status === 404,
  "Cross-clinic private asset read blocked",
);
check(
  (
    await request(`/api/assets/${id}/duplicate`, {
      method: "POST",
      cookie: B.cookie,
    })
  ).status === 404,
  "Cross-clinic duplication blocked",
);
check(
  (
    await request(`/api/assets/${id}`, {
      method: "PUT",
      cookie: B.cookie,
      body: { title: "attack" },
    })
  ).status === 404,
  "Cross-clinic edit blocked",
);
check(
  (
    await request("/api/assets", {
      method: "POST",
      cookie: B.cookie,
      body: {
        ...original,
        payload: { steps: [{ title: "x", image: privateURL }] },
      },
    })
  ).status === 403,
  "Cross-clinic file reference rejected",
);
check(
  (
    await request("/api/assets", {
      method: "POST",
      cookie: A.cookie,
      body: {
        ...original,
        title: "url attack",
        payload: { steps: [{ title: "x", image: "javascript:alert(1)" }] },
      },
    })
  ).status === 400,
  "Active-protocol media URL rejected",
);
await request(`/api/assets/${id}/favorite`, {
  method: "POST",
  cookie: A.cookie,
  body: { favorite: true },
});
check(
  (
    await request("/api/assets?favorite=1", { cookie: A.cookie })
  ).data.assets.some((a) => a.id === id),
  "Favorites persist for authenticated user",
);
await request(`/api/assets/${id}`, {
  method: "PUT",
  cookie: A.cookie,
  body: { is_hidden: 1 },
});
check(
  !(await request("/api/assets", { cookie: A.cookie })).data.assets.some(
    (a) => a.id === id,
  ) &&
    (
      await request("/api/assets?manage=1", { cookie: A.cookie })
    ).data.assets.some((a) => a.id === id),
  "Hidden assets remain manageable",
);
await request(`/api/assets/${id}`, {
  method: "PUT",
  cookie: A.cookie,
  body: { is_hidden: 0 },
});
const png =
  "data:image/png;base64," +
  readFileSync("public/static/icon-192.png").toString("base64");
const saved = await request("/api/sessions", {
  method: "POST",
  cookie: A.cookie,
  body: {
    patient_label: "검증 환자",
    schedule_note: "다음 진료 안내",
    slides: [
      { asset_id: id, sub_index: 0, note: "첫 단계 메모", drawing_png: png },
      { asset_id: id, sub_index: 1, note: privateB.data.url, drawing_png: png },
    ],
  },
});
assert.equal(saved.status, 200, JSON.stringify(saved.data));
const session = saved.data.id;
check(
  saved.data.slides.length === 2 &&
    saved.data.slides[0].drawing_url !== saved.data.slides[1].drawing_url,
  "Distinct drawings stored per step in R2",
);
check(
  (await request(`/api/sessions/${session}`, { cookie: B.cookie })).status ===
    404,
  "Cross-clinic session access blocked",
);
check(
  (
    await request("/api/sessions", {
      method: "POST",
      cookie: B.cookie,
      body: { slides: [{ asset_id: id }] },
    })
  ).status === 404,
  "Forged private-asset consultation rejected",
);
check(
  (
    await request("/api/sessions", {
      method: "POST",
      cookie: A.cookie,
      body: { id: session, version: 0, slides: [{ asset_id: id }] },
    })
  ).status === 409,
  "Concurrent edit conflict detected",
);
const valid = await request("/api/sessions", {
  method: "POST",
  cookie: A.cookie,
  body: {
    id: session,
    version: 1,
    patient_label: "검증 환자",
    slides: saved.data.slides,
  },
});
check(
  valid.status === 200 && valid.data.version === 2,
  "Saved R2 drawings can be reused by owning session",
);
const link = await request(`/api/sessions/${session}/share`, {
  method: "POST",
  cookie: A.cookie,
  body: { days: 7 },
});
assert.equal(link.status, 200, JSON.stringify(link.data));
let token = link.data.token;
let shared = await request(`/api/share/${token}`);
check(
  shared.status === 200 && shared.data.slides.length === 2,
  "Patient link renders every saved step",
);
check(
  shared.headers.get("cache-control").includes("no-store"),
  "Patient data has no-store cache policy",
);
check(
  (await fetch(base + shared.data.slides[0].drawing_url)).status === 200,
  "Token authorizes only the shared drawing",
);
check(
  (await fetch(base + privateB.data.url + "?share=" + token)).status === 404,
  "A note cannot grant access to another clinic file",
);
await request(`/api/assets/${id}`, {
  method: "PUT",
  cookie: A.cookie,
  body: { title: "수정된 라이브러리" },
});
check(
  (await request(`/api/share/${token}`)).data.slides[0].asset.title ===
    "QA 단계별 설명",
  "Saved consultation content survives later asset edits",
);
const cmp = await request("/api/assets", {
  method: "POST",
  cookie: A.cookie,
  body: {
    title: "QA 비교",
    type: "compare",
    category: "compare",
    reviewer_name: "검증 원장",
    media_urls: ["/ph?t=before", "/ph?t=after"],
    payload: { before: "/ph?t=before", after: "/ph?t=after" },
  },
});
const compareSession = await request("/api/sessions", {
  method: "POST",
  cookie: A.cookie,
  body: {
    slides: [
      { asset_id: cmp.data.id, note: "NEVER_SHARE_COMPARE", drawing_png: png },
      { asset_id: id, sub_index: 0 },
    ],
  },
});
const compareLink = await request(
  `/api/sessions/${compareSession.data.id}/share`,
  { method: "POST", cookie: A.cookie, body: { days: 7 } },
);
const compareData = await request(`/api/share/${compareLink.data.token}`);
check(
  compareData.data.slides.every((s) => s.asset.type !== "compare") &&
    !JSON.stringify(compareData.data).includes("NEVER_SHARE_COMPARE"),
  "Compare content AND drawings/notes excluded server-side",
);
const visit = await request(`/api/share/${token}/view`, {
  method: "POST",
  body: { visitor: "qa-visitor" },
});
check(
  visit.status === 200 &&
    (
      await request(`/api/share/${token}/view`, {
        method: "POST",
        body: { visitor: "qa-visitor" },
      })
    ).status === 429,
  "Repeated view event deduplicated",
);
await request(`/api/sessions/${session}/share`, {
  method: "DELETE",
  cookie: A.cookie,
});
check(
  (await request(`/api/share/${token}`)).status === 404 &&
    (await fetch(base + saved.data.slides[0].drawing_url + "?share=" + token))
      .status === 404,
  "Revocation invalidates patient data and private files",
);
const relink = await request(`/api/sessions/${session}/share`, {
  method: "POST",
  cookie: A.cookie,
  body: { days: 1 },
});
token = relink.data.token;
localSQL(
  `UPDATE consult_sessions SET share_expires_at=datetime('now','-1 day') WHERE id=${session}`,
);
check(
  (await request(`/api/share/${token}`)).status === 404,
  "Expired patient link rejected",
);
const finalLink = await request(`/api/sessions/${session}/share`, {
  method: "POST",
  cookie: A.cookie,
  body: { days: 7 },
});
const changed = await request("/api/auth/password", {
  method: "POST",
  cookie: B.cookie,
  body: { current_password: password, password: password + "new" },
});
check(
  changed.status === 200 &&
    (await request("/api/auth/me", { cookie: B.cookie })).data.user === null,
  "Password change revokes existing sessions",
);
const pub = await request("/api/assets", {
  method: "POST",
  cookie: admin.cookie,
  body: {
    title: "QA 공개 FAQ",
    type: "faq",
    category: "faq",
    reviewer_name: "검증 원장",
    payload: { question: "테스트 질문", answer: "테스트 답변" },
    is_public: true,
  },
});
check(
  pub.status === 201 &&
    (await request(`/api/assets/${pub.data.id}`)).status === 200,
  "Operator can publish public explanations",
);
const doc = {
  A,
  admin,
  assetId: id,
  sessionId: session,
  compareId: cmp.data.id,
  shareToken: finalLink.data.token,
  checks,
  generatedAt: new Date().toISOString(),
};
writeFileSync(".test-results/fixtures.json", JSON.stringify(doc, null, 2), {
  mode: 0o600,
});
console.log(
  `\n${checks} integration checks passed. Fixture credentials remain in ignored local artifacts only.`,
);
