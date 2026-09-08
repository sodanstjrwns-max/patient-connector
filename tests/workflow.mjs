import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
const base = "http://localhost:3000",
  f = JSON.parse(fs.readFileSync(".test-results/fixtures.json"));
let count = 0;
const check = (v, m) => {
  assert(v, m);
  count++;
  console.log("PASS", m);
};
const api = async (path, method = "GET", body, cookie = f.A.cookie) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  return { status: r.status, data: await r.json() };
};
// A second clinic account with a fresh password is not needed; admin is a different clinic in local fixtures.
const B = f.admin.cookie;
const initial = {
  client_key: randomUUID(),
  write_key: randomUUID(),
  status: "draft",
  patient_label: "Workflow QA",
  internal_note: "GLOBAL_INTERNAL_SECRET",
  slides: [],
};
const created = await api("/api/sessions", "POST", initial);
check(created.status === 200, "Empty draft is saved server-side");
const replay = await api("/api/sessions", "POST", initial);
check(
  replay.data.id === created.data.id && replay.data.replayed,
  "Lost response replay does not duplicate initial draft",
);
let id = created.data.id,
  version = created.data.version;
const slides = [
  {
    asset_id: f.assetId,
    sub_index: 1,
    note: "UNSELECTED_PATIENT_NOTE",
    internal_note: "STEP_INTERNAL_SECRET",
    include_in_share: false,
  },
  {
    asset_id: f.assetId,
    sub_index: 0,
    note: "VISIBLE_NOTE",
    internal_note: "SECOND_INTERNAL_SECRET",
    include_in_share: true,
  },
];
let saved = await api("/api/sessions", "POST", {
  ...initial,
  id,
  version,
  write_key: randomUUID(),
  slides,
});
check(
  saved.status === 200 && saved.data.slides[0].sub_index === 1,
  "Explicit ordered slides persist in draft",
);
version = saved.data.version;
let preview = await api(`/api/sessions/${id}/preview`);
check(
  preview.data.slides.length === 1 && preview.data.slides[0].sub_index === 0,
  "Review preview contains only selected slide",
);
check(
  !JSON.stringify(preview.data).includes("INTERNAL_SECRET") &&
    !JSON.stringify(preview.data).includes("UNSELECTED_PATIENT_NOTE"),
  "Preview excludes all internal and unselected notes",
);
check(
  preview.data.slides[0].asset.payload.steps[1] === null,
  "Unselected sibling stage content and file URLs are absent from the payload",
);
const share = await api(`/api/sessions/${id}/share`, "POST", {
  days: 7,
  version,
});
check(share.status === 200, "Publication freezes reviewed version");
const token = share.data.token;
let patient = await api("/api/share/" + token, "GET", undefined, null);
check(
  patient.data.slides.length === 1 &&
    !JSON.stringify(patient.data).includes("INTERNAL_SECRET"),
  "Public response excludes internal notes at every level",
);
const updated = await api("/api/sessions", "POST", {
  ...initial,
  id,
  version,
  write_key: randomUUID(),
  patient_label: "CHANGED_LABEL",
  slides: [
    {
      asset_id: f.assetId,
      sub_index: 1,
      note: "NEW_UNPUBLISHED_NOTE",
      include_in_share: true,
    },
  ],
});
check(
  updated.status === 200,
  "Published consultation can keep a separate working draft",
);
version = updated.data.version;
patient = await api("/api/share/" + token, "GET", undefined, null);
check(
  patient.data.patient_label === "Workflow QA" &&
    patient.data.slides[0].note === "VISIBLE_NOTE",
  "Autosave does not silently change an already-sent handout",
);
const stale = await api(`/api/sessions/${id}/share`, "POST", {
  days: 7,
  version: version - 1,
});
check(stale.status === 409, "Stale reviewed version cannot be published");
const visitor = randomUUID();
let feedback = await api(
  "/api/share/" + token + "/feedback",
  "POST",
  { kind: "question", visitor, message: "더 설명해주세요" },
  null,
);
check(feedback.status === 200, "Patient submits clarification request");
const feedbackId = feedback.data.id;
const duplicate = await api(
  "/api/share/" + token + "/feedback",
  "POST",
  { kind: "question", visitor, message: "추가 질문" },
  null,
);
check(
  duplicate.data.id === feedbackId,
  "Same visitor and request type is updated, not duplicated",
);
const inbox = await api("/api/feedback");
check(
  inbox.data.feedback.some((x) => x.id === feedbackId),
  "Owning clinic receives feedback",
);
check(
  !(await api("/api/feedback", "GET", undefined, B)).data.feedback.some(
    (x) => x.id === feedbackId,
  ),
  "Other clinic cannot read feedback",
);
check(
  (await api("/api/feedback/" + feedbackId, "PUT", { status: "resolved" }, B))
    .status === 404,
  "Other clinic cannot resolve feedback",
);
check(
  (await api("/api/feedback/" + feedbackId, "PUT", { status: "resolved" }))
    .status === 200,
  "Clinic can resolve follow-up request",
);
await api(`/api/sessions/${id}/share`, "DELETE");
check(
  (
    await api(
      "/api/share/" + token + "/feedback",
      "POST",
      { kind: "schedule", visitor },
      null,
    )
  ).status === 404,
  "Revoked link cannot submit feedback",
);
const set = await api("/api/sets", "POST", {
  title: "Workflow QA set",
  description: "No patient data",
  items: [
    {
      asset_id: f.assetId,
      sub_index: 1,
      note: "MUST_NOT_SAVE",
      internal_note: "SET_SECRET",
    },
    { asset_id: f.assetId, sub_index: 0 },
  ],
});
check(set.status === 201, "Clinic saves ordered consultation set");
const setId = set.data.id;
const list = await api("/api/sets");
const own = list.data.sets.find((s) => s.id === setId);
check(
  own.items[0].sub_index === 1 &&
    !JSON.stringify(own).includes("MUST_NOT_SAVE") &&
    !JSON.stringify(own).includes("SET_SECRET"),
  "Sets preserve order but never patient notes",
);
check(
  !(await api("/api/sets", "GET", undefined, B)).data.sets.some(
    (s) => s.id === setId,
  ),
  "Sets isolated by clinic",
);
check(
  (await api("/api/sets/" + setId, "PUT", { ...own, title: "Hijack" }, B))
    .status === 404,
  "Cross-clinic set edit blocked",
);
check(
  (await api("/api/sets/" + setId, "PUT", { ...own, version: 0 })).status ===
    409,
  "Concurrent set edits detected",
);
const draft = await api(
  "/api/assets",
  "POST",
  {
    is_public: true,
    title: "QA governance draft",
    type: "faq",
    category: "faq",
    reviewer_name: "검토 대기",
    payload: { question: "검토 질문", answer: "검토 답변" },
    review_status: "draft",
    staff_note: "STAFF_ONLY_SECRET",
    source_url: "https://www.mouthhealthy.org/all-topics-a-z/implants",
    usage_rights: "unconfirmed",
  },
  f.admin.cookie,
);
check(draft.status === 201, "Operator creates explicitly unreviewed content");
const aid = draft.data.id;
check(
  (await api("/api/assets/" + aid, "GET", undefined, null)).status === 404,
  "Unreviewed draft is hidden from patients",
);
const denyReview = await api(
  "/api/assets/" + aid,
  "PUT",
  { review_status: "reviewed", review_confirmed: true },
  f.admin.cookie,
);
check(
  denyReview.status === 400,
  "Review cannot be confirmed without usage rights",
);
const review = await api(
  "/api/assets/" + aid,
  "PUT",
  {
    review_status: "reviewed",
    review_confirmed: true,
    usage_rights: "owned",
    reviewer_name: "검토 담당",
    is_hidden: 0,
  },
  f.admin.cookie,
);
check(
  review.status === 200,
  "Explicit operator review records approval and usage rights",
);
const publicAsset = await api("/api/assets/" + aid, "GET", undefined, null);
check(
  publicAsset.data.asset.review_status === "reviewed" &&
    !("staff_note" in publicAsset.data.asset),
  "Public material exposes verified status but not staff-only guide",
);
await api(
  "/api/assets/" + aid,
  "PUT",
  { description: "Changed after review" },
  f.admin.cookie,
);
check(
  (await api("/api/assets/" + aid, "GET", undefined, f.admin.cookie)).data.asset
    .review_status === "unreviewed",
  "Editing content resets previous review confirmation",
);
const all = await api("/api/admin/stats", "GET", undefined, f.admin.cookie);
check(
  all.data.assets.filter(
    (a) =>
      a.tags.includes("설명초안") && a.is_hidden && a.review_status === "draft",
  ).length === 10,
  "Ten educational drafts remain hidden and unreviewed",
);
await api("/api/assets/" + aid, "DELETE", {}, f.admin.cookie);
await api("/api/sets/" + setId, "DELETE");
await api("/api/sessions/" + id, "DELETE");
check(
  !(await api("/api/feedback")).data.feedback.some((x) => x.id === feedbackId),
  "Deleting consultation removes associated feedback",
);
fs.writeFileSync(
  ".test-results/workflow-api-results.json",
  JSON.stringify({ checks: count, passed: true }, null, 2),
);
console.log(count + " workflow API checks passed");
