// Local-only cleanup of explicitly namespaced synthetic QA accounts; never touches production.
import { execFileSync } from "node:child_process";
if (process.argv.includes("--remote"))
  throw new Error("Remote cleanup is forbidden");
const execute = (sql) =>
  JSON.parse(
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "webapp-production",
        "--local",
        "--json",
        "--command",
        sql,
      ],
      { encoding: "utf8", stdio: "pipe" },
    ),
  );
const rows = execute(
  "SELECT id,clinic_id FROM users WHERE email LIKE 'care-qa-%@example.test'",
)[0].results;
const userIds =
  rows
    .map((r) => Number(r.id))
    .filter(Number.isSafeInteger)
    .join(",") || "0";
const clinicIds =
  rows
    .map((r) => Number(r.clinic_id))
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .join(",") || "0";
const sessions = `SELECT id FROM consult_sessions WHERE clinic_id IN (${clinicIds})`;
const assets = `SELECT id FROM assets WHERE clinic_id IN (${clinicIds}) OR (title='QA 공개 FAQ' AND reviewer_name='검증 원장')`;
execute(`
DELETE FROM share_views WHERE session_id IN (${sessions});
DELETE FROM favorites WHERE user_id IN (${userIds}) OR asset_id IN (${assets});
DELETE FROM consult_sessions WHERE clinic_id IN (${clinicIds});
DELETE FROM cases WHERE clinic_id IN (${clinicIds});
DELETE FROM assets WHERE id IN (${assets});
DELETE FROM uploads WHERE user_id IN (${userIds});
DELETE FROM auth_sessions WHERE user_id IN (${userIds});
DELETE FROM users WHERE id IN (${userIds});
DELETE FROM clinics WHERE id IN (${clinicIds}) AND NOT EXISTS (SELECT 1 FROM users u WHERE u.clinic_id=clinics.id);
DELETE FROM auth_limits;
`);
console.log(
  "Local QA records and local rate-limit counters cleared. Clinical seed data preserved.",
);
