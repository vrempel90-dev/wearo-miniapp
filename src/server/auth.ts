import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { assert } from "./errors";
import { developmentEnabled, validateProduction } from "./config";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function validateInitData(
  raw: string,
  token: string,
  now = Math.floor(Date.now() / 1000),
) {
  assert(raw.length <= 12000 && token, 401, "Некорректные данные Telegram");
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  assert(new Set(keys).size === keys.length, 401, "Повторные поля Telegram");
  const hash = params.get("hash") || "";
  assert(/^[a-f0-9]{64}$/.test(hash), 401, "Некорректная подпись Telegram");
  params.delete("hash");
  const data = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(data).digest();
  assert(
    timingSafeEqual(expected, Buffer.from(hash, "hex")),
    401,
    "Подпись Telegram не подтверждена",
  );
  const time = Number(params.get("auth_date"));
  assert(
    Number.isSafeInteger(time) && time <= now + 30 && now - time <= 300,
    401,
    "Данные Telegram устарели",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.get("user") || "{}");
  } catch {
    assert(false, 401, "Нет пользователя Telegram");
  }
  const user = z
    .object({
      id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      first_name: z.string().min(1).max(128),
    })
    .parse(parsed);
  return {
    telegramId: BigInt(user.id),
    displayName: user.first_name,
    hash: digest(hash),
  };
}
export async function telegramLogin(initData: string) {
  validateProduction();
  const user = validateInitData(initData, process.env.TELEGRAM_BOT_TOKEN || "");
  return db.$transaction(async (tx) => {
    await tx.authReplay.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const used = await tx.authReplay.findUnique({ where: { hash: user.hash } });
    assert(
      !used,
      401,
      "Эти данные Telegram уже использованы. Откройте приложение заново.",
    );
    await tx.authReplay.create({
      data: { hash: user.hash, expiresAt: new Date(Date.now() + 360000) },
    });
    return tx.user.upsert({
      where: { telegramId: user.telegramId },
      create: { telegramId: user.telegramId, displayName: user.displayName },
      update: { displayName: user.displayName },
    });
  });
}
export async function devLogin(id: string) {
  assert(developmentEnabled(), 404, "Недоступно");
  const user = await db.user.findUnique({ where: { id } });
  assert(
    user && user.telegramId < 0n,
    403,
    "Доступны только локальные тестовые профили",
  );
  return user;
}
export async function createSession(user: User) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 86400000);
  await db.session.create({
    data: { userId: user.id, tokenHash: digest(token), expiresAt },
  });
  (await cookies()).set("wearo_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("wearo_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  });
  return session &&
    session.expiresAt > new Date() &&
    !(process.env.NODE_ENV === "production" && session.user.telegramId <= 0n)
    ? session.user
    : null;
}
export async function requireUser() {
  const user = await currentUser();
  assert(user, 401, "Войдите через Telegram");
  return user;
}
export function requireAdmin(user: User) {
  assert(user.role === "ADMIN", 403, "Нужны права администратора");
}
export async function requireSeller(
  user: User,
  sellerId: string,
  active = true,
) {
  const membership = await db.sellerMembership.findUnique({
    where: { userId_sellerId: { userId: user.id, sellerId } },
    include: { seller: true },
  });
  assert(
    membership &&
      (user.role === "SELLER" || user.role === "ADMIN") &&
      (!active || membership.seller.status === "ACTIVE"),
    403,
    "Магазин недоступен",
  );
  return membership.seller;
}
