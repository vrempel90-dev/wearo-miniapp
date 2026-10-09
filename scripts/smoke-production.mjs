import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
try {
  loadEnvFile(".env");
} catch {}
assert(
  !existsSync(".next/standalone/.env"),
  "Environment file must not be deployed",
);
const port = 3110;
const base = `http://127.0.0.1:${port}`;
const appUrl = "https://smoke.wearo.invalid";
const db = new PrismaClient();
const dev = await db.user.findFirst({ where: { telegramId: { lt: 0 } } });
assert(dev, "Demo seed required");
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
await db.session.create({
  data: { tokenHash, userId: dev.id, expiresAt: new Date(Date.now() + 60000) },
});
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  windowsHide: true,
  stdio: "ignore",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    APP_URL: appUrl,
    DEV_AUTH: "false",
    TEST_PAYMENTS: "false",
    TELEGRAM_BOT_TOKEN: "smoke-only-token",
  },
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, "Standalone healthcheck failed");
  console.log("PASS production healthcheck with PostgreSQL");
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(`${base}/favicon.svg`)).status, 200);
  console.log("PASS standalone page and static assets");
  const photo = await fetch(`${base}/demo/products/001.jpg`);
  assert.equal(photo.status, 200);
  assert.ok(photo.headers.get("content-type").includes("image/jpeg"));
  assert.ok((await photo.arrayBuffer()).byteLength > 10000);
  console.log("PASS generated catalog photo served by production standalone");
  assert.equal(
    (
      await fetch(`${base}/api/auth/dev`, {
        method: "POST",
        headers: { Origin: appUrl, "Content-Type": "application/json" },
        body: JSON.stringify({ id: dev.id }),
      })
    ).status,
    404,
  );
  console.log("PASS production development login disabled");
  const response = await fetch(`${base}/api/session`, {
    headers: { Cookie: `wearo_session=${token}` },
  });
  assert.equal((await response.json()).user, null);
  console.log("PASS development sessions rejected in production");
  assert.equal(
    (
      await fetch(`${base}/api/admin/overview`, {
        headers: { Cookie: `wearo_session=${token}` },
      })
    ).status,
    401,
  );
  console.log("PASS production admin authorization");
} finally {
  server.kill();
  await db.session.deleteMany({ where: { tokenHash } });
  await db.$disconnect();
}
