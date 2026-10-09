import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { db } from "./db";
import { digest } from "./auth";
import { AppError, assert } from "./errors";
import { appOrigin } from "./config";
export function json(value: unknown, status = 200) {
  return new Response(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
export async function body(req: Request) {
  assert(
    req.headers.get("content-type")?.includes("application/json"),
    415,
    "Ожидается JSON",
  );
  const reader = req.body?.getReader();
  assert(reader, 400, "Пустой запрос");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 65536) {
      await reader.cancel();
      throw new AppError(413, "Слишком большой запрос");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Некорректный JSON");
  }
}
export function checkOrigin(req: Request) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    assert(
      req.headers.get("origin") === appOrigin(),
      403,
      "Источник запроса не подтверждён",
    );
}
export async function rateLimit(key: string, limit = 30, seconds = 60) {
  const result = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${digest(key)}, 1, NOW() + ${seconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN 1 ELSE "RateLimit"."count"+1 END,
    "resetAt" = CASE WHEN "RateLimit"."resetAt" < NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE "RateLimit"."resetAt" END RETURNING "count"`;
  assert(
    result[0].count <= limit,
    429,
    "Слишком много запросов. Попробуйте позже.",
  );
}
export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        {
          error: "Проверьте поля формы",
          fields: e.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2025"].includes(e.code)
    )
      return json({ error: "Конфликт данных. Обновите страницу." }, 409);
    console.error("wearo request failed", {
      kind: e instanceof Error ? e.name : "unknown",
    });
    return json({ error: "Сервис временно недоступен" }, 503);
  }
}
