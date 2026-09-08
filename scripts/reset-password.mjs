// Offline administrator utility. Never expose this as an HTTP endpoint.
// PC_NEW_PASSWORD must come from a secure environment variable, not a CLI argument.
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { execFileSync } from "node:child_process";
const args = process.argv.slice(2),
  email = args
    .find((a) => a.startsWith("--email="))
    ?.slice(8)
    .toLowerCase();
const password = process.env.PC_NEW_PASSWORD;
if (
  !email ||
  !/^\S+@\S+\.\S+$/.test(email) ||
  !password ||
  password.length < 10 ||
  password.length > 128
) {
  console.error(
    "Usage: set PC_NEW_PASSWORD securely, then node scripts/reset-password.mjs --email=user@example.com --local",
  );
  process.exit(1);
}
if (!args.includes("--local") || args.includes("--remote")) {
  console.error(
    "This utility is local-only. Production account recovery must be reviewed with the deployment operator.",
  );
  process.exit(1);
}
const salt = randomBytes(16).toString("hex"),
  hash = `pbkdf2$100000$${salt}$${pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex")}`,
  escaped = email.replaceAll("'", "''");
const command = `UPDATE users SET password_hash='${hash}' WHERE lower(email)='${escaped}' RETURNING id; DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email)='${escaped}');`;
try {
  const output = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "webapp-production",
      "--local",
      "--json",
      "--command",
      command,
    ],
    { encoding: "utf8" },
  );
  const results = JSON.parse(output);
  if (!results[0]?.results?.length) {
    console.error("No matching local account.");
    process.exit(1);
  }
  console.log("Local account password updated; existing sessions revoked.");
} catch {
  console.error("Password reset failed. Check local database configuration.");
  process.exit(1);
}
