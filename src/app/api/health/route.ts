import { db } from "@/server/db";
import { validateProduction } from "@/server/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    validateProduction();
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
