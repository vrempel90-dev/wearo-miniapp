import { db } from "../src/server/db";
import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch {}
const id = process.env.BOOTSTRAP_ADMIN_TELEGRAM_ID;
if (!id || !/^[1-9]\d{0,18}$/.test(id))
  throw new Error("Укажите контролируемый BOOTSTRAP_ADMIN_TELEGRAM_ID");
const user = await db.user.upsert({
  where: { telegramId: BigInt(id) },
  create: {
    telegramId: BigInt(id),
    displayName: "Администратор",
    role: "ADMIN",
  },
  update: { role: "ADMIN" },
});
await db.auditLog.create({
  data: { actorId: user.id, action: "ADMIN_BOOTSTRAP", entityId: user.id },
});
console.log("Administrator initialized");
await db.$disconnect();
