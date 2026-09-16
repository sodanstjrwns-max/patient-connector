import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const base = "http://localhost:3000";
const f = JSON.parse(fs.readFileSync(".test-results/fixtures.json"));
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
await ctx.addCookies([
  { name: "pc_session", value: f.A.cookie.split("=")[1], url: base },
]);
const p = await ctx.newPage(),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
let n = 0;
const check = (v, m) => {
  assert(v, m);
  n++;
  console.log("PASS", m);
};
try {
  await p.goto(base);
  await p.waitForSelector(".asset-card");
  check(
    (await p.locator("#workspace-metrics,#recent-drafts").count()) === 0,
    "Home is a material library, not a patient dashboard",
  );
  const old = await p.evaluate(async () => {
    const r = await axios.post("/api/sessions", {
      client_key: crypto.randomUUID(),
      write_key: crypto.randomUUID(),
      status: "draft",
      patient_label: "PRIVATE_PREVIOUS_PATIENT",
      internal_note: "PRIVATE_PREVIOUS_NOTE",
      schedule_note: "PRIVATE_PREVIOUS_SCHEDULE",
      slides: [
        {
          asset_id: 1,
          sub_index: 0,
          note: "PRIVATE_SLIDE_NOTE",
          include_in_share: true,
        },
      ],
    });
    PC.rememberDraft(r.data.id);
    return r.data.id;
  });
  await p.keyboard.press("/");
  check(
    await p
      .locator("#search-input")
      .evaluate((el) => el === document.activeElement),
    "Slash shortcut focuses search",
  );
  await p.locator("#search-input").fill("임플란트 치료 과정");
  await p.waitForFunction(() => state.assets.length === 1);
  const card = p.locator('[data-asset-id="1"]');
  const before = await p.evaluate(
    async () => (await axios.get("/api/sessions")).data.sessions.length,
  );
  await card.locator(".material-select").click();
  check(
    (await p.locator("#selected-material-count").innerText()) === "1",
    "Explicit selection updates sending tray",
  );
  check(
    (await p.evaluate(
      async () => (await axios.get("/api/sessions")).data.sessions.length,
    )) === before,
    "Selecting materials does not create a consultation",
  );
  await card.locator(".cover-link").click();
  await p.waitForSelector("#studio-title");
  await p.waitForFunction(() => !S.busy);
  check(
    (await p.locator("#studio-note-options").getAttribute("open")) === null,
    "New explanation screen does not ask for patient details",
  );
  check(
    (await p.evaluate(
      () => [...S.slides.values()].filter((s) => s._selected).length,
    )) === 0,
    "Opening a material does not include notes or start personalized selection",
  );
  await p.screenshot({ path: ".test-results/clarity-studio-desktop.png" });
  await p.locator('[aria-label="라이브러리로 돌아가기"]').click();
  await p.waitForSelector(".asset-card");
  check(
    (await p.locator("#selected-material-count").innerText()) === "1",
    "Material-only selection survives explaining and returning",
  );
  check(
    (await p.evaluate(() => PC.currentDraft())) === old,
    "Library selection never replaces an existing saved consultation",
  );
  // Lose the response after the server saved the draft. Retrying must reuse client/write IDs.
  let dropped = false;
  await p.route("**/api/sessions", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await p.locator("#quick-delivery-button").click();
  await p.waitForFunction(() => !PC.deliveryBusy && !!PC.quickDraft);
  await p.unroute("**/api/sessions");
  await p.locator("#quick-delivery-button").click();
  await p.waitForSelector("#quick-delivery-confirm");
  const job = await p.evaluate(() => PC.quickDraft.saved);
  check(
    (await p.evaluate(
      async () => (await axios.get("/api/sessions")).data.sessions.length,
    )) ===
      before + 1,
    "Lost quick-save response retries without duplicate drafts",
  );
  check(
    job.slides.length === 6,
    "Material-level sharing includes all six selected treatment stages",
  );
  const preview = await p.locator("#pc-modal").innerText();
  check(
    !preview.includes("PRIVATE_"),
    "Quick preview does not inherit previous patient, notes or schedule",
  );
  check(
    (await p.locator(".review-card").count()) === 6,
    "Quick preview displays actual complete selected content",
  );
  await p.locator("#quick-publish").click();
  check(
    (await p.locator("#quick-delivery-confirm").count()) === 1,
    "Publication requires explicit review confirmation",
  );
  await p.locator("#quick-delivery-confirm").check();
  await p.locator("#quick-share-days").selectOption("7");
  await p.locator("#quick-publish").click();
  await p.waitForSelector("#copy-kakao-message");
  check(
    (await p.locator(".delivery-result").innerText()).includes(
      "아직 환자에게 발송되지는 않았습니다",
    ),
    "Prepared link is not falsely labeled as a sent message",
  );
  check(
    (await p.locator(".delivery-result").innerText()).includes(
      "SOLAPI 알림톡 자동 발송은 아직 연결되지 않았습니다",
    ),
    "Unconfigured automated Kakao delivery is clearly disclosed",
  );
  await p.locator("#copy-kakao-message").click();
  const text = await p.evaluate(() => navigator.clipboard.readText());
  const path = await p.locator(".delivery-open").getAttribute("href");
  check(
    text.includes(base + path) &&
      text.includes("진료 안내") &&
      !text.includes("PRIVATE_"),
    "Kakao-ready message copies a valid link with no inherited private text",
  );
  check(
    (await p.evaluate(() => PC.materialSelection.length)) === 0,
    "Published selection clears to avoid accidental carry-over",
  );
  check(
    (await p.evaluate(() => PC.currentDraft())) === old,
    "Quick publication preserves legacy draft pointer",
  );
  await p.setViewportSize({ width: 390, height: 844 });
  check(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Delivery modal fits mobile viewport",
  );
  await p.screenshot({ path: ".test-results/clarity-delivery-mobile.png" });
  const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    g = await guest.newPage();
  g.on("pageerror", (e) => errors.push(e.message));
  await g.goto(base + path);
  await g.waitForSelector(".patient-card");
  check(
    !(await g.locator("body").innerText()).includes("PRIVATE_"),
    "Anonymous handout contains only generic selected material",
  );
  check(
    await g.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Generic handout fits mobile",
  );
  await g.screenshot({
    path: ".test-results/clarity-handout-mobile.png",
    fullPage: false,
  });
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  await p.goto(base + "/");
  await p.waitForSelector(".asset-card");
  await p.locator(".material-select:not([disabled])").first().click();
  check(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile tray fits viewport",
  );
  await p.reload();
  await p.waitForSelector("#selected-material-count");
  check(
    (await p.locator("#selected-material-count").innerText()) === "1",
    "Only material IDs survive reload",
  );
  await p.getByRole("button", { name: "비우기", exact: true }).click();
  check(
    (await p.locator("#material-tray").innerText()) === "",
    "Clear selection removes the tray",
  );
  await p.getByRole("button", { name: "주의사항", exact: true }).click();
  await p.waitForFunction(
    () =>
      state.assets.length > 0 && !document.querySelector('[aria-busy="true"]'),
  );
  check(
    await p.evaluate(() => state.assets.every((a) => a.category === "caution")),
    "Precautions category filters material cards",
  );
  await g.goto(base + "/");
  await g.waitForSelector(".material-select");
  await g.locator(".material-select:not([disabled])").first().click();
  await g.locator("#quick-delivery-button").click();
  await g.waitForSelector("#pc-modal");
  check(
    (await g.locator("#pc-modal").innerText()).includes("병원 로그인"),
    "Anonymous users can browse but must authenticate before issuing shares",
  );
  await p.request.delete(base + `/api/sessions/${job.id}/share`, { data: {} });
  await g.goto(base + path);
  await g.waitForSelector(".empty-state");
  check(
    (await g.locator("body").innerText()).includes("공유 기간이 지났거나"),
    "Quick handout remains revocable",
  );
  await p.request.delete(base + `/api/sessions/${job.id}`, { data: {} });
  await p.request.delete(base + `/api/sessions/${old}`, { data: {} });
  check(
    errors.length === 0,
    "No uncaught errors across new library and delivery flows",
  );
  fs.writeFileSync(
    ".test-results/clarity-browser-results.json",
    JSON.stringify({ checks: n, errors }, null, 2),
  );
  console.log(`${n} clarity browser checks passed`);
} finally {
  await browser.close();
}
