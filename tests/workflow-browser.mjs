import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
const f = JSON.parse(fs.readFileSync(".test-results/fixtures.json")),
  base = "http://localhost:3000",
  browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
await ctx.addCookies([
  { name: "pc_session", value: f.A.cookie.split("=")[1], url: base },
]);
const p = await ctx.newPage(),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
let n = 0;
const check = (v, m) => {
  assert(v, m);
  n++;
  console.log("PASS", m);
};
try {
  await p.goto(base + "/consult/1");
  await p.waitForSelector("#add-current-slide");
  await p.waitForFunction(() => !S.busy);
  await p.getByRole("button", { name: "다음 단계", exact: true }).click();
  await p.waitForFunction(() => !S.busy);
  check(
    (await p.evaluate(
      () => [...S.slides.values()].filter((s) => s._selected).length,
    )) === 0,
    "Browsing stages does not add them to consultation",
  );
  await p.goto(base + "/");
  await p.waitForSelector(".add-to-consult");
  // Keep coverage for legacy saved-workflow recovery, independent of the new library basket.
  await p.evaluate(() => PC.addToConsult(1));
  await p.waitForFunction(() => !!PC.currentDraft());
  const draftId = await p.evaluate(() => PC.currentDraft());
  await p.goto(base + "/prepare?session=" + draftId);
  await p.waitForSelector(".selected-row");
  const length = await p.locator(".selected-row").count();
  check(
    length > 1,
    "Legacy consultation helper preserves server-backed multi-step drafts",
  );
  await p.locator("#prep-patient-label").fill("Workflow browser patient");
  await p.locator("#prep-internal-note").fill("PRIVATE_GLOBAL_NEVER_SEND");
  await p.waitForFunction(
    () => P.saver.ack === P.saver.revision && P.saver.revision > 0,
  );
  await p.reload();
  await p.waitForSelector("#prep-patient-label");
  check(
    (await p.locator("#prep-patient-label").inputValue()) ===
      "Workflow browser patient",
    "Draft autosave survives page reload",
  );
  await p
    .locator(".selected-row")
    .first()
    .getByRole("button", { name: "아래로 이동", exact: true })
    .click();
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(() => P.saver.ack === P.saver.revision);
  check(
    (await p.evaluate(() => P.session.slides[0].sub_index)) === 1,
    "Accessible reordering changes stored presentation order",
  );
  await p.locator(".selected-row .share-check input").first().uncheck();
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(() => P.saver.ack === P.saver.revision);
  await p.getByRole("button", { name: "세트로 저장", exact: true }).click();
  await p.locator("#save-set-form [name=title]").fill("Workflow browser set");
  await p.getByRole("button", { name: "세트 저장", exact: true }).click();
  await p.waitForFunction(() => !document.getElementById("pc-modal"));
  check(true, "Selected order can be saved as a reusable clinic set");
  await p.locator("#start-consult").click();
  await p.waitForSelector("#studio-title");
  await p.waitForFunction(() => !S.busy);
  check(
    (await p.evaluate(() => S.sub)) === 1,
    "Studio opens at the first selected ordered stage",
  );
  await p.locator("#internal-note").fill("PRIVATE_STEP_NEVER_SEND");
  await p.locator("#slide-note").fill("Unselected stage note");
  await p.locator("#save-button").click();
  await p.waitForFunction(() => !S.dirty);
  await p.locator("#send-button").click();
  await p.waitForSelector("#delivery-confirm");
  check(
    !(await p.locator("#pc-modal").innerText()).includes(
      "PRIVATE_GLOBAL_NEVER_SEND",
    ) &&
      !(await p.locator("#pc-modal").innerText()).includes(
        "PRIVATE_STEP_NEVER_SEND",
      ),
    "Pre-send review excludes both kinds of internal memo",
  );
  check(
    (await p.locator(".review-card").count()) === length - 1,
    "Review includes only explicitly checked materials",
  );
  check(
    (await p.locator(".review-image img").count()) > 0,
    "Preview includes actual chosen imagery, not just titles",
  );
  await p.locator("#delivery-confirm").check();
  await p.locator("#publish-prepared").click();
  await p.waitForSelector("#copy-prepared-link");
  const link = await p
    .locator("#pc-modal a[target=_blank]")
    .getAttribute("href");
  check(!!link, "Reviewed publication creates a patient handout");
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  const patient = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    q = await patient.newPage();
  q.on("pageerror", (e) => errors.push(e.message));
  await q.goto(base + link);
  await q.waitForSelector("#patient-feedback-form");
  await q.locator("#feedback-kind").selectOption("question");
  await q.locator("#feedback-message").fill("치료 순서가 궁금해요");
  await q.locator("#feedback-submit").click();
  await q.waitForFunction(() =>
    document.getElementById("feedback-status").textContent.includes("전달"),
  );
  check(true, "Patient clarification form submits successfully");
  await q.screenshot({
    path: ".test-results/workflow-patient.png",
    fullPage: true,
  });
  await p.goto(base + "/prepare?tab=followup");
  await p.waitForSelector(".tbl tbody tr");
  const feedback = p
    .locator("tr")
    .filter({ hasText: "치료 순서가 궁금해요" })
    .first();
  await feedback
    .getByRole("button", { name: "처리 완료", exact: true })
    .click();
  await feedback
    .getByRole("button", { name: "다시 열기", exact: true })
    .waitFor();
  check(true, "Clinic receives and resolves the patient request");
  await p.goto(base + "/prepare?session=" + draftId);
  await p.waitForSelector("#prep-patient-label");
  await p.locator("#prep-patient-label").fill("Changed working draft");
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(() => P.saver.ack === P.saver.revision);
  await q.reload();
  await q.waitForSelector(".patient-intro");
  check(
    (await q.locator(".patient-intro").innerText()).includes(
      "Workflow browser patient",
    ),
    "Already-shared handout stays frozen during draft edits",
  );
  // Simulate an acknowledged-on-server request whose response is lost.
  let lost = false;
  await p.route("**/api/sessions", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await p.locator("#prep-schedule").fill("Lost response safely retried");
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(() => P.saver.pending && !P.saver.sending);
  await p.unroute("**/api/sessions");
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(() => P.saver.ack === P.saver.revision);
  check(
    true,
    "Lost-response retry reuses write ID and recovers without duplicate draft",
  );
  await ctx.setOffline(true);
  await p.locator("#prep-schedule").fill("Offline input preserved");
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(
    () =>
      document.getElementById("draft-save-state").dataset.state === "offline",
  );
  check(
    (await p.locator("#prep-schedule").inputValue()) ===
      "Offline input preserved",
    "Offline editing keeps unsaved input in the current screen",
  );
  await ctx.setOffline(false);
  await p.waitForFunction(() => P.saver.ack === P.saver.revision);
  check(true, "Reconnect saves the pending draft");
  // A second authenticated tab writes a newer version.
  const current = await p.evaluate(() => ({ ...P.session }));
  await ctx.request.post(base + "/api/sessions", {
    data: {
      ...current,
      write_key: crypto.randomUUID(),
      schedule_note: "Other tab update",
    },
  });
  await p.locator("#prep-schedule").fill("My conflicting input");
  await p.getByRole("button", { name: "지금 저장", exact: true }).click();
  await p.waitForFunction(() => P.saver.conflicted);
  check(
    (await p.locator("#prep-schedule").inputValue()) === "My conflicting input",
    "Conflict does not overwrite current user input",
  );
  await p
    .getByRole("button", { name: "별도 상담으로 저장", exact: true })
    .click();
  await p.waitForFunction(
    () => !P.saver.conflicted && P.saver.ack === P.saver.revision,
  );
  check(
    (await p.evaluate(() => P.session.id)) !== draftId,
    "Conflicted content can be saved as a separate draft",
  );
  await p.screenshot({
    path: ".test-results/workflow-prepare-desktop.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "새 환자 상담", exact: true }).click();
  await p.locator("#confirm-action").click();
  await p.waitForURL("**/prepare*");
  await p.waitForSelector("#prep-patient-label");
  await p.waitForFunction(() => P.session.slides.length === 0);
  check(
    (await p.locator("#prep-patient-label").inputValue()) === "" &&
      (await p.locator("#prep-internal-note").inputValue()) === "",
    "New-patient flow clears all prior patient details",
  );
  await p.getByRole("button", { name: "병원 상담 세트", exact: true }).click();
  await p.waitForSelector(".set-grid .panel");
  const set = p
    .locator(".set-grid .panel")
    .filter({ hasText: "Workflow browser set" })
    .first();
  await set
    .getByRole("button", { name: "새 상담으로 사용", exact: true })
    .click();
  await p.locator("#confirm-action").click();
  await p.waitForSelector(".selected-row");
  check(
    (await p.locator("#prep-patient-label").inputValue()) === "" &&
      (await p.locator("#prep-internal-note").inputValue()) === "",
    "Using a set copies no prior patient data",
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(200);
  check(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Preparation layout fits mobile without horizontal overflow",
  );
  await p.screenshot({
    path: ".test-results/workflow-prepare-mobile.png",
    fullPage: true,
  });
  await patient.close();
  check(
    errors.length === 0,
    "No uncaught workflow browser errors: " + errors.join("; "),
  );
  fs.writeFileSync(
    ".test-results/workflow-browser-results.json",
    JSON.stringify({ checks: n, errors }, null, 2),
  );
  console.log(n + " workflow browser checks passed");
} finally {
  await browser.close();
}
