import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(".test-results/fixtures.json", "utf8"));
const base = "http://localhost:3000",
  browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
let count = 0;
const check = (x, label) => {
  assert(x, label);
  count++;
  console.log("PASS", label);
};
async function draw(p, start, end) {
  const box = await p.locator("#draw-canvas").boundingBox();
  await p.mouse.move(
    box.x + box.width * start[0],
    box.y + box.height * start[1],
  );
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], {
    steps: 15,
  });
  await p.mouse.up();
}
try {
  await page.goto(base + "/login");
  await page.locator("[name=email]").fill(fixture.A.email);
  await page.locator("[name=password]").fill(fixture.A.password);
  await page.locator("#auth-submit").click();
  await page.waitForURL(base + "/");
  await page.waitForSelector(".asset-card");
  check(
    (await page.locator("#workspace-metrics .metric").count()) === 4,
    "Authenticated library loads four live metrics",
  );
  await page.locator("#search-input").fill("없는검색어-QAX");
  await page.waitForFunction(() =>
    document
      .querySelector("#library-grid")
      .textContent.includes("검색 결과가 없습니다."),
  );
  check(
    (await page.locator(".empty-state").count()) === 1,
    "Library search empty state works",
  );
  await page.locator("#search-input").fill("임플란트");
  await page.waitForFunction(
    () => document.querySelectorAll(".asset-card").length > 0,
  );
  check(
    (await page.locator(".asset-card").count()) > 0,
    "Debounced title search returns matching cards",
  );
  await page.locator('[aria-label="목록 보기"]').click();
  check(
    (await page.locator(".library-list").count()) === 1,
    "List/grid view toggle works",
  );
  await page.goto(base + "/manage");
  await page.waitForSelector("#manage-list .tbl");
  await page.getByRole("button", { name: "새 자료", exact: true }).click();
  await page
    .locator("#asset-form [name=title]")
    .fill("브라우저 검증 비용 안내");
  await page.locator("#asset-form [name=type]").selectOption("cost");
  await page.locator("[data-key=item]").fill("진료 상담");
  await page.locator("[data-key=price]").fill("100,000원");
  await page.locator("#editor-save").click();
  await page.waitForFunction(() => !document.getElementById("pc-modal"));
  await page
    .locator("tr")
    .filter({ hasText: "브라우저 검증 비용 안내" })
    .last()
    .last()
    .waitFor();
  check(true, "Structured cost editor creates a persistent asset");
  let row = page
    .locator("tr")
    .filter({ hasText: "브라우저 검증 비용 안내" })
    .last();
  await row.getByRole("button", { name: "숨기기", exact: true }).click();
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll("tbody tr")].findLast((r) =>
      r.textContent.includes("브라우저 검증 비용 안내"),
    );
    return row?.textContent.includes("숨김");
  });
  row = page
    .locator("tr")
    .filter({ hasText: "브라우저 검증 비용 안내" })
    .last();
  await row.getByRole("button", { name: "다시 표시", exact: true }).click();
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll("tbody tr")].findLast((r) =>
      r.textContent.includes("브라우저 검증 비용 안내"),
    );
    return row?.textContent.includes("표시 중");
  });
  check(true, "Hidden asset can be restored from management UI");
  await page.goto(base + "/manage?tab=settings");
  await page.locator("form [name=phone]").fill("02-555-0101");
  await page
    .getByRole("button", { name: "병원 정보 저장", exact: true })
    .click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector("[name=phone]");
  check(
    (await page.locator("[name=phone]").inputValue()) === "02-555-0101",
    "Clinic profile persists after reload",
  );
  // Real two-step canvas flow; no synthetic application state injection.
  await page.goto(base + "/consult/1");
  await page.waitForSelector("#draw-canvas");
  await page.waitForFunction(() => !S.busy);
  await page.locator("#patient-label").fill("브라우저 검증 환자");
  await page.locator("#add-current-slide").click();
  await page.locator("#slide-note").fill("첫 단계 상담 메모");
  await draw(page, [0.2, 0.35], [0.45, 0.5]);
  const first = await page.evaluate(() => slide().drawing_png);
  await page.getByRole("button", { name: "다음 단계", exact: true }).click();
  await page.waitForFunction(() => S.sub === 1 && !S.busy);
  await page.locator("#add-current-slide").click();
  await page.locator("#slide-note").fill("두 번째 단계 메모");
  await draw(page, [0.6, 0.25], [0.7, 0.6]);
  const second = await page.evaluate(() => slide().drawing_png);
  check(
    first && second && first !== second,
    "Separate canvas drawings are recorded for each treatment step",
  );
  await page.getByRole("button", { name: "이전 단계", exact: true }).click();
  await page.waitForFunction(() => S.sub === 0 && !S.busy);
  check(
    (await page.locator("#slide-note").inputValue()) === "첫 단계 상담 메모",
    "Step navigation restores the matching note",
  );
  const beforeUndo = await page.evaluate(() => canvas.toDataURL());
  await page.getByRole("button", { name: "실행취소", exact: true }).click();
  await page.waitForFunction(() => !S.busy);
  const afterUndo = await page.evaluate(() => canvas.toDataURL());
  check(beforeUndo !== afterUndo, "Canvas undo works per step");
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await page.waitForFunction(() => !S.busy);
  check(
    (await page.evaluate(() => canvas.toDataURL())) === beforeUndo,
    "Canvas redo restores prior stroke",
  );
  await page.locator("#save-button").click();
  await page.waitForFunction(() => S.session.id && !S.saving && !S.dirty);
  const sessionId = await page.evaluate(() => S.session.id);
  check(!!sessionId, "Consultation save succeeds from studio");
  await page.screenshot({
    path: ".test-results/studio-desktop.png",
    fullPage: false,
  });
  await page.reload();
  await page.waitForFunction(
    () => typeof S !== "undefined" && !S.busy && S.slides.size === 2,
  );
  check(
    (await page.locator("#patient-label").inputValue()) ===
      "브라우저 검증 환자",
    "Saved consultation reopens with patient label",
  );
  check(
    await page.evaluate(
      () =>
        S.slides.get("1:0").note === "첫 단계 상담 메모" &&
        S.slides.get("1:1").note === "두 번째 단계 메모" &&
        !!S.slides.get("1:1").drawing_url,
    ),
    "Both step notes and R2 drawings survive reload",
  );
  await page.getByRole("button", { name: "다음 단계", exact: true }).click();
  await page.waitForFunction(() => S.sub === 1 && !S.busy);
  check(
    (await page.locator("#slide-note").inputValue()) === "두 번째 단계 메모",
    "Reopened step two restores its own note",
  );
  await page.locator("#send-button").click();
  await page.waitForSelector("#delivery-confirm");
  await page.locator("#delivery-confirm").check();
  await page.locator("#publish-prepared").click();
  await page.waitForSelector("#copy-prepared-link");
  const shareURL = await page
    .locator("#pc-modal a[target=_blank]")
    .getAttribute("href");
  check(shareURL?.startsWith("/p/"), "Patient sharing produces a valid link");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  const patient = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    handout = await patient.newPage();
  handout.on("pageerror", (e) => errors.push(e.message));
  await handout.goto(base + shareURL);
  await handout.waitForSelector(".patient-card");
  await handout.waitForFunction(() =>
    [...document.querySelectorAll(".drawing-overlay")].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  check(
    (await handout.locator(".drawing-overlay").count()) === 2,
    "Anonymous patient sees two distinct annotation overlays",
  );
  check(
    (await handout
      .locator(".patient-card")
      .filter({ hasText: "첫 단계 상담 메모" })
      .count()) === 1 &&
      (await handout
        .locator(".patient-card")
        .filter({ hasText: "두 번째 단계 메모" })
        .count()) === 1,
    "Patient handout shows the correct note on each step",
  );
  check(
    await handout.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Patient mobile handout has no horizontal overflow",
  );
  await handout.screenshot({
    path: ".test-results/patient-mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/manage?tab=sessions");
  await page.waitForSelector("#manage-list .tbl");
  const consultation = page
    .locator("tr")
    .filter({ hasText: "브라우저 검증 환자" })
    .first();
  await consultation
    .getByRole("button", { name: "공유 관리", exact: true })
    .click();
  await page.getByRole("button", { name: "공유 종료", exact: true }).click();
  await page.waitForFunction(() => !document.getElementById("pc-modal"));
  await handout.reload();
  await handout
    .getByRole("heading", { name: "상담 안내를 열 수 없습니다.", exact: true })
    .waitFor();
  check(true, "Revocation through management UI blocks patient handout");
  await patient.close();
  // Upload retryable form, keyboard modal focus, browser DELETE request behavior.
  await page.goto(base + "/manage?new=1");
  await page.waitForSelector("#asset-form");
  await page.locator("[name=title]").fill("브라우저 검증 이미지");
  await page
    .locator("#asset-files")
    .setInputFiles("public/static/icon-192.png");
  await page.waitForSelector(".upload-preview img");
  await page.locator("#editor-save").click();
  await page.waitForFunction(() => !document.getElementById("pc-modal"));
  await page
    .locator("tr")
    .filter({ hasText: "브라우저 검증 이미지" })
    .waitFor();
  check(true, "Image upload and create flow works in browser");
  await page
    .locator("tr")
    .filter({ hasText: "브라우저 검증 이미지" })
    .getByRole("button", { name: "자료 삭제", exact: true })
    .click();
  await page.locator("#confirm-action").click();
  await page.waitForFunction(() => !document.getElementById("pc-modal"));
  check(
    (await page
      .locator("tr")
      .filter({ hasText: "브라우저 검증 이미지" })
      .count()) === 0,
    "Browser DELETE requests include valid JSON and delete asset",
  );
  await page.goto(base + "/cases");
  await page.getByRole("button", { name: "케이스 등록", exact: true }).click();
  await page.locator("#case-form [name=title]").fill("브라우저 검증 케이스");
  await page.locator("#case-form [name=treatment_id]").selectOption("1");
  await page
    .locator("#case-form input[type=file]")
    .nth(0)
    .setInputFiles("public/static/icon-192.png");
  await page.waitForSelector("#case-before img");
  await page
    .locator("#case-form input[type=file]")
    .nth(1)
    .setInputFiles("public/static/icon-192.png");
  await page.waitForSelector("#case-after img");
  await page.locator("#case-form [name=consent]").check();
  await page.locator("#case-save").click();
  await page.waitForFunction(() => !document.getElementById("pc-modal"));
  await page.waitForSelector(".case-compare");
  check(true, "Consent-confirmed case registration works");
  await page.locator("input[type=range]").first().fill("75");
  check(
    (await page
      .locator(".case-compare")
      .first()
      .evaluate((el) => el.style.getPropertyValue("--split"))) === "75%",
    "Before/after comparison slider works",
  );
  const adminCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await adminCtx.addCookies([
    {
      name: "pc_session",
      value: fixture.admin.cookie.split("=")[1],
      url: base,
    },
  ]);
  const operator = await adminCtx.newPage();
  operator.on("pageerror", (e) => errors.push(e.message));
  await operator.goto(base + "/admin");
  await operator.waitForSelector(".tbl");
  await operator
    .getByRole("button", { name: "공개 자료 등록", exact: true })
    .click();
  await operator.waitForSelector("#asset-form");
  check(true, "Operator has a dedicated public asset editor");
  await operator.screenshot({ path: ".test-results/admin-editor.png" });
  await adminCtx.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  await page.waitForSelector(".asset-card");
  await page.waitForTimeout(300);
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile library has no horizontal overflow",
  );
  check(
    await page
      .locator("#sidebar")
      .evaluate((el) => el.getBoundingClientRect().right <= 0),
    "Mobile navigation is fully offscreen until opened",
  );
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  check(
    await page
      .locator("#sidebar")
      .evaluate((el) => el.classList.contains("open")),
    "Mobile sidebar opens",
  );
  await page.locator("#sb-backdrop").click({ position: { x: 330, y: 250 } });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: ".test-results/home-mobile.png",
    fullPage: true,
  });
  await page.goto(base + "/consult/1?session=" + sessionId);
  await page.waitForFunction(() => typeof S !== "undefined" && !S.busy);
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile studio fits viewport",
  );
  await page.screenshot({ path: ".test-results/studio-mobile.png" });
  await page
    .getByRole("button", { name: "설명 및 메모 패널", exact: true })
    .click();
  await page.locator("#patient-label").waitFor({ state: "visible" });
  check(true, "Mobile studio notes open in a drawer");
  check(
    errors.length === 0,
    "No uncaught JavaScript errors across all tested pages: " +
      errors.join("; "),
  );
  writeFileSync(
    ".test-results/browser-results.json",
    JSON.stringify(
      {
        checks: count,
        errors,
        sessionId,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\n${count} browser checks passed.`);
} finally {
  await browser.close();
}
