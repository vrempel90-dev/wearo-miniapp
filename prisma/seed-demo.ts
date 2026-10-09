import { loadEnvFile } from "node:process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DATASET, makeDemoCatalog, stores } from "./demo-data";
try {
  loadEnvFile(".env");
} catch {}
if (
  process.env.NODE_ENV === "production" ||
  process.env.DEMO_SEED !== "true" ||
  process.env.TEST_PAYMENTS !== "true"
)
  throw new Error(
    "Demo seed requires a non-production environment, DEMO_SEED=true and TEST_PAYMENTS=true",
  );
const { db } = await import("../src/server/db");
const products = makeDemoCatalog();
const photos = new Set<string>();
for (const p of products) {
  try {
    await access(resolve("public", p.photo.slice(1)));
    photos.add(p.id);
  } catch {}
}
await mkdir("public/demo/logos", { recursive: true });
for (const [slug, name, , , monogram, color] of stores) {
  await writeFile(
    `public/demo/logos/${slug}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="${name}"><rect width="160" height="160" rx="80" fill="${color}"/><circle cx="80" cy="80" r="66" fill="none" stroke="#ffffff" stroke-opacity=".35"/><text x="80" y="91" text-anchor="middle" font-family="Georgia,serif" font-size="39" fill="#fff">${monogram}</text></svg>`,
  );
}
try {
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(762019001)`;
      const unexpected = await tx.product.count({
        where: {
          demoDataset: DATASET,
          demoKey: { notIn: products.map((p) => p.demoKey) },
        },
      });
      if (unexpected)
        throw new Error(
          "Dataset has unknown records; seed will not delete them",
        );
      for (const [telegramId, displayName, role] of [
        [-900n, "Тестовый администратор", "ADMIN"],
        [-901n, "Тестовый покупатель", "BUYER"],
      ] as const)
        await tx.user.upsert({
          where: { telegramId },
          create: { telegramId, displayName, role },
          update: {},
        });
      const sellerIds: string[] = [];
      for (const [i, [slug, name, description, city]] of stores.entries()) {
        const key = `${DATASET}/${slug}`;
        const existing = await tx.seller.findUnique({
          where: { slug: `demo-${slug}` },
        });
        if (existing && existing.demoKey !== key)
          throw new Error(`Seller slug collision: ${slug}`);
        const user = await tx.user.upsert({
          where: { telegramId: BigInt(-910 - i) },
          create: {
            telegramId: BigInt(-910 - i),
            displayName: `Демо-продавец · ${name}`,
            role: "SELLER",
          },
          update: {},
        });
        const seller = await tx.seller.upsert({
          where: { demoKey: key },
          create: {
            slug: `demo-${slug}`,
            name,
            description: `${description}. Вымышленный магазин для демонстрации WEARO. Реальные продажи не выполняются.`,
            city,
            status: "ACTIVE",
            demoDataset: DATASET,
            demoKey: key,
            logoUrl: `/demo/logos/${slug}.svg`,
            memberships: { create: { userId: user.id } },
            application: {
              create: {
                userId: user.id,
                contact: "Демонстрационный профиль; контакт не существует",
                status: "ACTIVE",
              },
            },
          },
          update: { logoUrl: `/demo/logos/${slug}.svg` },
        });
        sellerIds.push(seller.id);
      }
      const categories = new Map<string, string>();
      for (const p of products) {
        if (categories.has(p.categorySlug)) continue;
        const parentSlug = `${p.gender.toLowerCase()}-${p.group}`;
        const parent = await tx.category.upsert({
          where: { slug: parentSlug },
          create: {
            slug: parentSlug,
            gender: p.gender,
            name: p.group === "shoes" ? "Обувь" : "Одежда",
          },
          update: {},
        });
        const category = await tx.category.upsert({
          where: { slug: p.categorySlug },
          create: {
            slug: p.categorySlug,
            name: p.categoryName,
            gender: p.gender,
            parentId: parent.id,
          },
          update: {},
        });
        categories.set(p.categorySlug, category.id);
      }
      for (const p of products) {
        const collision = await tx.product.findUnique({ where: { id: p.id } });
        if (collision && collision.demoKey !== p.demoKey)
          throw new Error(`Product id collision: ${p.id}`);
        const product = await tx.product.upsert({
          where: { demoKey: p.demoKey },
          create: {
            id: p.id,
            demoKey: p.demoKey,
            demoDataset: DATASET,
            sellerId: sellerIds[p.storeIndex],
            categoryId: categories.get(p.categorySlug)!,
            title: p.title,
            description: p.description,
            priceMinor: p.priceMinor,
            oldPriceMinor: p.oldPriceMinor,
            discountPercent: p.discountPercent,
            styleTag: p.styleTag,
            status: "APPROVED",
            createdAt: new Date(
              Date.UTC(2026, 9, 1, 12, 0, 500 - Number(p.serial)),
            ),
            variants: {
              create: p.variants.map((v) => ({
                id: v.id,
                sku: v.sku,
                size: v.size,
                color: v.color,
                inventory: { create: { available: v.available } },
              })),
            },
          },
          update: {},
        });
        if (photos.has(p.id))
          await tx.productImage.upsert({
            where: { objectKey: `demo/${p.demoKey}/main` },
            create: {
              objectKey: `demo/${p.demoKey}/main`,
              sellerId: product.sellerId,
              productId: product.id,
              url: p.photo,
            },
            update: { url: p.photo },
          });
      }
      // Retire only the two known legacy fixtures owned by the original negative-id demo users. Preserve their products/orders.
      await tx.seller.updateMany({
        where: {
          slug: { in: ["demo-studio", "demo-step"] },
          demoDataset: null,
          memberships: {
            some: { user: { telegramId: { in: [-902n, -903n] } } },
            every: { user: { telegramId: { lt: 0n } } },
          },
        },
        data: { status: "BLOCKED" },
      });
      if (
        (await tx.product.count({ where: { demoDataset: DATASET } })) !== 500 ||
        (await tx.seller.count({ where: { demoDataset: DATASET } })) !== 15
      )
        throw new Error("Demo dataset count invariant failed");
    },
    { timeout: 120000 },
  );
  console.log(
    JSON.stringify({
      dataset: DATASET,
      products: 500,
      sellers: 15,
      uniquePhotos: photos.size,
      missingPhotos: 500 - photos.size,
      inventoryPolicy:
        "Existing stock and reservations preserved; no real records deleted",
    }),
  );
} finally {
  await db.$disconnect();
}
