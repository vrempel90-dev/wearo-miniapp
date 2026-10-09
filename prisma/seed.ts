import { loadEnvFile } from "node:process";
try {
  loadEnvFile(".env");
} catch {}
if (process.env.NODE_ENV === "production" || process.env.DEMO_SEED !== "true")
  throw new Error(
    "Демонстрационный seed разрешён только локально с DEMO_SEED=true",
  );
const { db } = await import("../src/server/db");
const { applySeller, saveProduct } = await import("../src/server/sellers");
const { reviewSeller, moderateProduct } = await import("../src/server/admin");
const admin = await db.user.upsert({
  where: { telegramId: -900n },
  create: {
    telegramId: -900n,
    displayName: "Тестовый администратор",
    role: "ADMIN",
  },
  update: {},
});
const buyer = await db.user.upsert({
  where: { telegramId: -901n },
  create: { telegramId: -901n, displayName: "Тестовый покупатель" },
  update: {},
});
for (const gender of ["WOMEN", "MEN"] as const) {
  for (const [slug, name] of [
    ["clothing", "Одежда"],
    ["shoes", "Обувь"],
    ["accessories", "Аксессуары"],
  ])
    await db.category.upsert({
      where: { slug: `${gender.toLowerCase()}-${slug}` },
      create: { slug: `${gender.toLowerCase()}-${slug}`, name, gender },
      update: {},
    });
}
const specs = [
  {
    telegramId: -902n,
    name: "Тестовый продавец 1",
    slug: "demo-studio",
    store: "Demo Studio",
    category: "women-clothing",
    title: "Куртка свободного кроя",
    priceMinor: 2990000,
    sizes: ["M", "L"],
    color: "Песочный",
  },
  {
    telegramId: -903n,
    name: "Тестовый продавец 2",
    slug: "demo-step",
    store: "Demo Step",
    category: "women-shoes",
    title: "Кроссовки для города",
    priceMinor: 2490000,
    sizes: ["38", "39", "40"],
    color: "Белый",
  },
];
for (const spec of specs) {
  let user = await db.user.upsert({
    where: { telegramId: spec.telegramId },
    create: { telegramId: spec.telegramId, displayName: spec.name },
    update: {},
  });
  let seller = await db.seller.findUnique({ where: { slug: spec.slug } });
  if (!seller) {
    seller = await applySeller(user, {
      name: spec.store,
      slug: spec.slug,
      city: "Алматы",
      contact: "Тестовый контакт",
      description: "Демонстрационный магазин, реальные продажи не выполняются.",
    });
    await reviewSeller(admin, seller.id, { status: "ACTIVE" });
  }
  user = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (
    !(await db.product.findFirst({
      where: { sellerId: seller.id, title: spec.title },
    }))
  ) {
    const category = await db.category.findUniqueOrThrow({
      where: { slug: spec.category },
    });
    const product = await saveProduct(user, seller.id, {
      title: spec.title,
      description:
        "Демонстрационный товар для проверки сценариев WEARO. Фото добавляются продавцом через объектное хранилище.",
      categoryId: category.id,
      priceMinor: spec.priceMinor,
      brand: "DEMO",
      variants: spec.sizes.map((size) => ({
        sku: `${spec.slug}-${size}`,
        size,
        color: spec.color,
        available: 10,
      })),
      imageIds: [],
    });
    await moderateProduct(admin, product.id, { status: "APPROVED" });
  }
}
await db.cart.upsert({
  where: { userId: buyer.id },
  create: { userId: buyer.id },
  update: {},
});
console.log(
  "Demo seed ready: buyer, admin, two independent sellers, jacket M/L and sneakers. No fabricated sales.",
);
await db.$disconnect();
