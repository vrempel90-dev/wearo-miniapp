import { test, expect, request, APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
const origin = { Origin: "http://localhost:3000" };
type Profile = { id: string; displayName: string };
type Product = {
  id: string;
  title: string;
  priceMinor: number;
  seller: { id: string; name: string };
  variants: { id: string; size: string; inventory: { available: number } }[];
};
async function login(ctx: APIRequestContext, name: string) {
  const profiles: Profile[] = await (await ctx.get("/api/dev-users")).json();
  const user = profiles.find((u) => u.displayName === name)!;
  expect(user).toBeTruthy();
  const response = await ctx.post("/api/auth/dev", {
    headers: origin,
    data: { id: user.id },
  });
  expect(response.ok()).toBeTruthy();
  return response;
}
test("HTTP onboarding creates two independent stores and moderated products with size stock", async () => {
  const db = new PrismaClient();
  const run = Date.now();
  const contexts: APIRequestContext[] = [];
  try {
    const admin = await request.newContext({
      baseURL: "http://localhost:3000",
    });
    contexts.push(admin);
    await login(admin, "Тестовый администратор");
    const categories = await (await admin.get("/api/categories")).json();
    const category = categories.find(
      (c: { gender: string; parentId: string | null }) =>
        c.gender === "WOMEN" && !c.parentId,
    );
    const createdProducts: Product[] = [];
    const stores: string[] = [];
    const sellerContexts: APIRequestContext[] = [];
    for (const index of [0, 1]) {
      const name = `HTTP Applicant ${run}-${index}`;
      const user = await db.user.create({
        data: { telegramId: -BigInt(run + index), displayName: name },
      });
      const seller = await request.newContext({
        baseURL: "http://localhost:3000",
      });
      contexts.push(seller);
      sellerContexts.push(seller);
      expect(
        (
          await seller.post("/api/auth/dev", {
            headers: origin,
            data: { id: user.id },
          })
        ).ok(),
      ).toBeTruthy();
      const application = await seller.post("/api/seller-applications", {
        headers: origin,
        data: {
          name: `HTTP Store ${run}-${index}`,
          slug: `http-${run}-${index}`,
          description: "Тестовый магазин HTTP",
          city: "Алматы",
          contact: "Тестовый контакт",
        },
      });
      expect(application.ok()).toBeTruthy();
      const store = await application.json();
      stores.push(store.id);
      expect(
        (
          await seller.post(`/api/sellers/${store.id}/products`, {
            headers: origin,
            data: { title: "Недоступно" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await admin.patch(`/api/admin/sellers/${store.id}`, {
            headers: origin,
            data: { status: "ACTIVE" },
          })
        ).ok(),
      ).toBeTruthy();
      const product = await seller.post(`/api/sellers/${store.id}/products`, {
        headers: origin,
        data: {
          title: `HTTP ${run} ${index === 0 ? "Куртка" : "Кроссовки"}`,
          description: "Товар создан через настоящий HTTP endpoint",
          categoryId: category.id,
          priceMinor: index === 0 ? 100000 : 200000,
          variants: (index === 0 ? ["M", "L"] : ["39"]).map((size) => ({
            sku: `http-${run}-${index}-${size}`,
            size,
            color: "Белый",
            available: 2,
          })),
        },
      });
      expect(product.ok()).toBeTruthy();
      const p = await product.json();
      expect(
        (
          await admin.patch(`/api/admin/products/${p.id}`, {
            headers: origin,
            data: { status: "APPROVED" },
          })
        ).ok(),
      ).toBeTruthy();
      createdProducts.push(
        await (await admin.get(`/api/products/${p.id}`)).json(),
      );
      expect(createdProducts[index].variants.length).toBe(index === 0 ? 2 : 1);
      expect(user.role).toBe("BUYER");
    }
    const buyer = await request.newContext({
      baseURL: "http://localhost:3000",
    });
    contexts.push(buyer);
    await login(buyer, "Тестовый покупатель");
    for (const item of (await (await buyer.get("/api/cart")).json()).items)
      await buyer.post("/api/cart", {
        headers: origin,
        data: { variantId: item.variant.id, quantity: 0 },
      });
    for (const p of createdProducts)
      expect(
        (
          await buyer.post("/api/cart", {
            headers: origin,
            data: { variantId: p.variants[0].id, quantity: 1 },
          })
        ).ok(),
      ).toBeTruthy();
    const response = await buyer.post("/api/checkout", {
      headers: origin,
      data: {
        idempotencyKey: crypto.randomUUID(),
        address: {
          name: "HTTP Test",
          phone: "+77000000000",
          city: "Алматы",
          street: "Тестовый адрес, 2",
        },
      },
    });
    expect(response.ok()).toBeTruthy();
    const checkout = await response.json();
    expect(checkout.orders).toHaveLength(2);
    for (const [index, seller] of sellerContexts.entries()) {
      const orders = await (
        await seller.get(`/api/sellers/${stores[index]}/orders`)
      ).json();
      expect(orders).toHaveLength(1);
      expect(orders[0].commission.amountMinor).toBe(
        index === 0 ? 10000 : 20000,
      );
      expect(
        (await seller.get(`/api/sellers/${stores[1 - index]}/orders`)).status(),
      ).toBe(403);
      const variant = await db.inventory.findUniqueOrThrow({
        where: { variantId: createdProducts[index].variants[0].id },
      });
      expect(variant.available).toBe(1);
      expect(variant.reserved).toBe(1);
    }
    for (const order of checkout.orders)
      expect(
        (
          await buyer.patch(`/api/orders/${order.id}`, {
            headers: origin,
            data: { status: "CANCELLED" },
          })
        ).ok(),
      ).toBeTruthy();
    for (const sellerId of stores)
      expect(
        (
          await admin.patch(`/api/admin/sellers/${sellerId}`, {
            headers: origin,
            data: { status: "BLOCKED", note: "HTTP test completed" },
          })
        ).ok(),
      ).toBeTruthy();
  } finally {
    for (const ctx of contexts) await ctx.dispose();
    await db.$disconnect();
  }
});
test("HTTP session, CSRF, seller ownership, real split checkout and idempotency", async () => {
  const anonymous = await request.newContext({
    baseURL: "http://localhost:3000",
  });
  expect((await anonymous.get("/api/cart")).status()).toBe(401);
  await anonymous.dispose();
  const buyer = await request.newContext({ baseURL: "http://localhost:3000" });
  const response = await login(buyer, "Тестовый покупатель");
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  expect(
    (
      await buyer.post("/api/cart", {
        headers: { Origin: "https://evil.example" },
        data: { variantId: "none", quantity: 1 },
      })
    ).status(),
  ).toBe(403);
  expect((await buyer.get("/api/admin/overview")).status()).toBe(403);
  const jacket: Product = await (
    await buyer.get("/api/products/wearo-demo-001")
  ).json();
  const shoes: Product = await (
    await buyer.get("/api/products/wearo-demo-151")
  ).json();
  expect(jacket).toBeTruthy();
  expect(shoes).toBeTruthy();
  const existing = await (await buyer.get("/api/cart")).json();
  for (const item of existing.items)
    await buyer.post("/api/cart", {
      headers: origin,
      data: { variantId: item.variant.id, quantity: 0 },
    });
  const j = jacket.variants.find((v) => v.size === "M")!;
  const s = shoes.variants[0];
  for (const v of [j, s])
    expect(
      (
        await buyer.post("/api/cart", {
          headers: origin,
          data: { variantId: v.id, quantity: 1 },
        })
      ).ok(),
    ).toBeTruthy();
  expect((await (await buyer.get("/api/cart")).json()).totalMinor).toBe(
    jacket.priceMinor + shoes.priceMinor,
  );
  const checkout = {
    idempotencyKey: crypto.randomUUID(),
    address: {
      name: "Тест HTTP",
      phone: "+77000000000",
      city: "Алматы",
      street: "Тестовый адрес, 1",
    },
  };
  const created = await buyer.post("/api/checkout", {
    headers: origin,
    data: checkout,
  });
  expect(created.ok()).toBeTruthy();
  const payload = await created.json();
  expect(payload.orders).toHaveLength(2);
  const repeat = await (
    await buyer.post("/api/checkout", { headers: origin, data: checkout })
  ).json();
  expect(repeat.id).toBe(payload.id);
  const stockDb = new PrismaClient();
  const reservedBefore = await stockDb.inventory.findMany({
    where: { variantId: { in: [j.id, s.id] } },
    orderBy: { variantId: "asc" },
  });
  expect(reservedBefore.every((v) => v.reserved > 0)).toBeTruthy();
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed-demo.ts"],
    { stdio: "pipe" },
  );
  expect(
    await stockDb.inventory.findMany({
      where: { variantId: { in: [j.id, s.id] } },
      orderBy: { variantId: "asc" },
    }),
  ).toEqual(reservedBefore);
  expect(
    await stockDb.product.count({ where: { demoDataset: "wearo-fashion-v1" } }),
  ).toBe(500);
  await stockDb.$disconnect();
  const seller = await request.newContext({ baseURL: "http://localhost:3000" });
  await login(seller, "Демо-продавец · URBAN MODE");
  const sellerOrders = await (
    await seller.get(`/api/sellers/${jacket.seller.id}/orders`)
  ).json();
  expect(
    sellerOrders.every(
      (o: { sellerId: string }) => o.sellerId === jacket.seller.id,
    ),
  ).toBeTruthy();
  expect(
    (await seller.get(`/api/sellers/${shoes.seller.id}/orders`)).status(),
  ).toBe(403);
  const foreignOrder = payload.orders.find(
    (o: { sellerId: string }) => o.sellerId === shoes.seller.id,
  );
  expect(
    (
      await seller.patch(
        `/api/sellers/${jacket.seller.id}/orders/${foreignOrder.id}`,
        { headers: origin, data: { status: "CONFIRMED" } },
      )
    ).status(),
  ).toBe(404);
  for (const o of payload.orders)
    expect(
      (
        await buyer.patch(`/api/orders/${o.id}`, {
          headers: origin,
          data: { status: "CANCELLED" },
        })
      ).ok(),
    ).toBeTruthy();
  await seller.dispose();
  await buyer.dispose();
});
test("mobile catalog, profile login, seller editor and admin screens render without overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Твой стиль. Твой выбор." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Куртка Forma 001 · Песочный" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Демо-продавец · URBAN MODE", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Управлять магазином" }),
  ).toBeVisible();
  await page.goto("/seller");
  await page.getByRole("button", { name: "Добавить товар" }).click();
  await expect(
    page.getByRole("heading", { name: "Новый товар" }),
  ).toBeVisible();
  await expect(page.getByLabel("Название", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Тестовый администратор", exact: true })
    .click();
  await expect(page.getByText("Администратор", { exact: true })).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Администрирование" }),
  ).toBeVisible();
  for (const name of [
    "Заявки",
    "Продавцы",
    "Модерация товаров",
    "Категории",
    "Заказы",
    "Комиссии",
    "Возвраты",
    "Журнал действий",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByText("Загрузка…")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
