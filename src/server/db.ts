import { Prisma, PrismaClient } from '@prisma/client';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient({log: ['error']});
if (process.env.NODE_ENV !== 'production') globalDb.prisma = db;
export async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, {isolationLevel: 'Serializable', timeout: 15000}); }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(e.code) && attempt < 4) continue;
      throw e;
    }
  }
}
