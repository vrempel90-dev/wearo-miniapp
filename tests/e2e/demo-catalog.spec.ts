import { test, expect } from "@playwright/test";
const origin = { Origin: "http://localhost:3000" };
test("all 500 products, allocations, search, stock filters, discounts and stores are backed by the API", async ({
  request,
}) => {
  const catalog = await (await request.get("/api/catalog")).json();
  expect(catalog.total).toBe(500);
  const ids = new Set<string>();
  for (let page = 1; page <= Math.ceil(catalog.total / 24); page++) {
    const response = await (
      await request.get(`/api/catalog?page=${page}`)
    ).json();
    for (const p of response.products) {
      expect(ids.has(p.id)).toBeFalsy();
      ids.add(p.id);
      expect(p.variants.length).toBeGreaterThan(0);
      for (const image of p.images) {
        const photo = await request.head(image.url);
        expect(photo.ok(), image.url).toBeTruthy();
        expect(photo.headers()["content-type"], image.url).toContain(
          "image/jpeg",
        );
      }
    }
  }
  expect(ids.size).toBe(500);
  const stores = await (await request.get("/api/stores")).json();
  expect(stores).toHaveLength(15);
  for (const s of stores) {
    expect(s._count.products).toBeGreaterThan(0);
    expect((await request.head(s.logoUrl)).ok()).toBeTruthy();
  }
  const categories = await (await request.get("/api/categories")).json();
  for (const [slug, count] of [
    ["women-clothing", 150],
    ["women-shoes", 100],
    ["men-clothing", 150],
    ["men-shoes", 100],
  ]) {
    const category = categories.find((c: { slug: string }) => c.slug === slug);
    expect(
      (await (await request.get(`/api/catalog?category=${category.id}`)).json())
        .total,
    ).toBe(count);
  }
  const one = await (await request.get("/api/catalog?q=WEA-151")).json();
  expect(one.total).toBe(1);
  expect(one.products[0].id).toBe("wearo-demo-151");
  expect(
    (await (await request.get("/api/catalog?gender=MEN")).json()).total,
  ).toBe(250);
  expect(
    (
      await (
        await request.get("/api/catalog?size=impossible&color=impossible")
      ).json()
    ).total,
  ).toBe(0);
  const filtered = await (
    await request.get(
      `/api/catalog?gender=WOMEN&size=38&color=${encodeURIComponent("Песочный")}`,
    )
  ).json();
  expect(filtered.total).toBeGreaterThan(0);
  for (const p of filtered.products)
    expect(
      p.variants.some(
        (v: {
          size: string;
          color: string;
          inventory: { available: number };
        }) =>
          v.size === "38" &&
          v.color === "Песочный" &&
          v.inventory.available > 0,
      ),
    ).toBeTruthy();
  const sale = await (await request.get("/api/catalog?sale=true")).json();
  expect(sale.total).toBe(125);
  for (const p of sale.products)
    expect(p.priceMinor * 100).toBe(
      p.oldPriceMinor * (100 - p.discountPercent),
    );
  const sorted = await (
    await request.get("/api/catalog?sort=price_asc&min=900000&max=1500000")
  ).json();
  expect(sorted.products.length).toBeGreaterThan(0);
  for (let i = 0; i < sorted.products.length; i++) {
    expect(sorted.products[i].priceMinor).toBeGreaterThanOrEqual(900000);
    expect(sorted.products[i].priceMinor).toBeLessThanOrEqual(1500000);
    if (i)
      expect(sorted.products[i].priceMinor).toBeGreaterThanOrEqual(
        sorted.products[i - 1].priceMinor,
      );
  }
  const photographed = await (
    await request.get("/api/catalog?photographed=true")
  ).json();
  const status = await (await request.get("/api/demo-status")).json();
  expect(photographed.total).toBe(status.photographed);
});
test("a buyer chooses card variants, changes quantity, submits two test orders and simulates payment", async ({
  page,
  request,
}) => {
  const users = await (await request.get("/api/dev-users")).json();
  const buyer = users.find(
    (u: { displayName: string }) => u.displayName === "Тестовый покупатель",
  );
  await page.goto("/account");
  await page
    .getByRole("button", { name: buyer.displayName, exact: true })
    .click();
  await expect(
    page.getByText(buyer.displayName, { exact: true }).first(),
  ).toBeVisible();
  const basket = await (await page.request.get("/api/cart")).json();
  for (const item of basket.items)
    await page.request.post("/api/cart", {
      headers: origin,
      data: { variantId: item.variant.id, quantity: 0 },
    });
  const products = [];
  for (const id of ["wearo-demo-001", "wearo-demo-151"]) {
    const p = await (await request.get(`/api/products/${id}`)).json();
    products.push(p);
    await page.goto(`/store/${p.seller.id}`);
    const card = page.locator(".product-card").filter({
      has: page.getByRole("heading", { name: p.title, exact: true }),
    });
    const variant = p.variants.find(
      (v: { size: string; color: string }) =>
        v.color === (id.endsWith("001") ? "Песочный" : "Песочный") &&
        v.size === (id.endsWith("001") ? "M" : "38"),
    );
    await card.getByRole("combobox").selectOption(variant.id);
    await card.getByRole("button", { name: "В корзину" }).click();
    await expect(card.getByRole("status")).toHaveText("Сохранено");
  }
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Тестовое оформление" }),
  ).toBeVisible();
  const first = page.locator(".cart-row").filter({
    has: page.getByRole("heading", { name: products[0].title, exact: true }),
  });
  await first.getByRole("button", { name: "+", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/cart")).json()).totalMinor,
    )
    .toBe(products[0].priceMinor * 2 + products[1].priceMinor);
  await page.getByLabel("Получатель", { exact: true }).fill("Тест WEARO");
  await page.getByLabel("Телефон (+7…)").fill("+77000000000");
  await page.getByLabel("Город", { exact: true }).fill("Алматы");
  await page.getByLabel("Улица, дом, квартира").fill("Вымышленная улица, 1");
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith("/api/checkout") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Создать тестовые заказы", exact: true })
    .click();
  const response = await submitted;
  expect(response.ok()).toBeTruthy();
  const checkout = await response.json();
  expect(checkout.orders).toHaveLength(2);
  await expect(page.getByRole("heading", { name: "Мои заказы" })).toBeVisible();
  for (const order of checkout.orders) {
    expect(order.isTest).toBe(true);
    expect(order.payment.provider).toBe("TEST");
    const pay = await page.request.post(`/api/payments/test/${order.id}`, {
      headers: origin,
      data: { eventId: crypto.randomUUID() },
    });
    expect(pay.ok()).toBeTruthy();
    expect((await pay.json()).status).toBe("TEST_SUCCEEDED");
    expect(
      (
        await page.request.patch(`/api/orders/${order.id}`, {
          headers: origin,
          data: { status: "CANCELLED" },
        })
      ).ok(),
    ).toBeTruthy();
  }
  expect(
    (await (await page.request.get("/api/cart")).json()).items,
  ).toHaveLength(0);
  await expect(
    page.getByText("Демонстрационный каталог — заказы и оплата тестовые", {
      exact: true,
    }),
  ).toBeVisible();
});
