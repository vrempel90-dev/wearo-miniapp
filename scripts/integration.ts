import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { randomUUID, createHmac } from "node:crypto";
import assert from "node:assert/strict";
try {
  loadEnvFile(".env");
} catch {}
const url = new URL(process.env.TEST_DATABASE_URL || "");
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname === "/wearo_test" &&
    process.env.NODE_ENV !== "production",
  "Integration reset restricted to local wearo_test database",
);
process.env.DATABASE_URL = url.toString();
process.env.DEV_AUTH = "true";
process.env.TEST_PAYMENTS = "true";
process.env.TELEGRAM_BOT_TOKEN = "integration-only";
const reset = spawnSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "reset",
    "--force",
    "--skip-seed",
    "--skip-generate",
  ],
  { stdio: "inherit", env: process.env },
);
assert.equal(reset.status, 0);
const { db } = await import("../src/server/db");
const { applySeller, saveProduct, setInventory } =
  await import("../src/server/sellers");
const { reviewSeller, moderateProduct, adminData, updateCommission } =
  await import("../src/server/admin");
const { catalog } = await import("../src/server/catalog");
const { setCartItem, cart } = await import("../src/server/cart");
const { checkout, listOrders, transitionOrder } =
  await import("../src/server/orders");
const { testPayment } = await import("../src/server/payments");
const { requestReturn, reviewReturn } = await import("../src/server/returns");
const { requireSeller, telegramLogin } = await import("../src/server/auth");
let count = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  count++;
  console.log(`PASS ${count}: ${name}`);
}
try {
  const admin = await db.user.create({
    data: {
      telegramId: -100n,
      displayName: "Test administrator",
      role: "ADMIN",
    },
  });
  let first = await db.user.create({
    data: { telegramId: -101n, displayName: "Test seller one" },
  });
  let second = await db.user.create({
    data: { telegramId: -102n, displayName: "Test seller two" },
  });
  const buyer = await db.user.create({
    data: { telegramId: -103n, displayName: "Test buyer" },
  });
  const otherBuyer = await db.user.create({
    data: { telegramId: -104n, displayName: "Other test buyer" },
  });
  const clothing = await db.category.create({
    data: { name: "Одежда", slug: "women-clothing", gender: "WOMEN" },
  });
  const shoes = await db.category.create({
    data: { name: "Обувь", slug: "women-shoes", gender: "WOMEN" },
  });
  const seller1 = await applySeller(first, {
    name: "Test studio",
    slug: "test-studio",
    description: "Тестовый магазин",
    city: "Алматы",
    contact: "Тестовый контакт",
  });
  const seller2 = await applySeller(second, {
    name: "Test sneakers",
    slug: "test-sneakers",
    description: "Второй магазин",
    city: "Астана",
    contact: "Тестовый контакт",
  });
  await check("pending seller cannot manage a catalog", async () => {
    await assert.rejects(() => requireSeller(first, seller1.id));
  });
  await check("buyer cannot approve seller", async () => {
    await assert.rejects(() =>
      reviewSeller(buyer, seller1.id, { status: "ACTIVE" }),
    );
  });
  await reviewSeller(admin, seller1.id, { status: "ACTIVE" });
  await reviewSeller(admin, seller2.id, { status: "ACTIVE" });
  first = await db.user.findUniqueOrThrow({ where: { id: first.id } });
  second = await db.user.findUniqueOrThrow({ where: { id: second.id } });
  const jacket = await saveProduct(first, seller1.id, {
    title: "Куртка M/L",
    description: "Куртка для интеграционного теста",
    categoryId: clothing.id,
    priceMinor: 2990000,
    variants: [
      { sku: "JACKET-M", size: "M", color: "Чёрный", available: 2 },
      { sku: "JACKET-L", size: "L", color: "Чёрный", available: 1 },
    ],
  });
  const sneakers = await saveProduct(second, seller2.id, {
    title: "Кроссовки",
    description: "Кроссовки второго продавца",
    categoryId: shoes.id,
    priceMinor: 2490000,
    variants: [{ sku: "SHOES-39", size: "39", color: "Белый", available: 3 }],
  });
  await check("unmoderated products are hidden", async () =>
    assert.equal((await catalog(new URLSearchParams())).total, 0),
  );
  await moderateProduct(admin, jacket.id, { status: "APPROVED" });
  await moderateProduct(admin, sneakers.id, { status: "APPROVED" });
  const variants = await db.productVariant.findMany({
    where: { productId: jacket.id },
  });
  const m = variants.find((v) => v.size === "M")!;
  const l = variants.find((v) => v.size === "L")!;
  const s = await db.productVariant.findFirstOrThrow({
    where: { productId: sneakers.id },
  });
  await check("catalog joins active sellers and size filters", async () => {
    assert.equal((await catalog(new URLSearchParams())).total, 2);
    assert.equal(
      (await catalog(new URLSearchParams({ size: "L" }))).products[0].id,
      jacket.id,
    );
  });
  await check("seller cannot edit another seller inventory", async () => {
    await assert.rejects(() => setInventory(first, seller1.id, s.id, 99));
    assert.equal(
      (await db.inventory.findUniqueOrThrow({ where: { variantId: s.id } }))
        .available,
      3,
    );
    await assert.rejects(() => requireSeller(first, seller2.id));
  });
  await check("seller cannot create a product in another store", async () => {
    await assert.rejects(() =>
      saveProduct(first, seller2.id, { title: "Bad" }),
    );
  });
  await setCartItem(buyer, { variantId: m.id, quantity: 1 });
  await check("independent stores may reuse SKU codes", async () => {
    await saveProduct(second, seller2.id, {
      title: "Другой товар с собственным SKU",
      description: "SKU независим от чужого магазина",
      categoryId: shoes.id,
      priceMinor: 10000,
      variants: [{ sku: m.sku, size: "41", color: "Белый", available: 0 }],
    });
  });
  await setCartItem(buyer, { variantId: s.id, quantity: 1 });
  await check("cart calculates current server prices", async () => {
    assert.equal((await cart(buyer)).totalMinor, 5480000);
    await db.product.update({
      where: { id: jacket.id },
      data: { priceMinor: 3000000 },
    });
    assert.equal((await cart(buyer)).totalMinor, 5490000);
    await db.product.update({
      where: { id: jacket.id },
      data: { priceMinor: 2990000 },
    });
    await assert.rejects(() =>
      setCartItem(buyer, { variantId: m.id, quantity: 1, priceMinor: 1 }),
    );
  });
  const address = {
    name: "Тестовый покупатель",
    phone: "+77000000000",
    city: "Алматы",
    street: "Тестовая улица, 1",
  };
  const key = randomUUID();
  const [a, b] = await Promise.all([
    checkout(buyer, { idempotencyKey: key, address }),
    checkout(buyer, { idempotencyKey: key, address }),
  ]);
  await check(
    "concurrent repeated checkout creates exactly two seller orders once",
    async () => {
      assert.equal(a.id, b.id);
      assert.equal(a.orders.length, 2);
      assert.equal(await db.order.count(), 2);
      assert.equal(
        (await db.inventory.findUniqueOrThrow({ where: { variantId: m.id } }))
          .reserved,
        1,
      );
    },
  );
  await check(
    "immutable commission snapshots and no real liability for test orders",
    async () => {
      const j = a.orders.find((o) => o.sellerId === seller1.id)!;
      assert.equal(j.totalMinor, 2990000);
      assert.equal(j.commission?.amountMinor, 299000);
      assert.equal(j.commission?.sellerNetMinor, 2691000);
      assert.equal(j.commission?.payableMinor, 0);
      await updateCommission(admin, seller1.id, { commissionBps: 2000 });
      assert.equal(
        (await db.commission.findUniqueOrThrow({ where: { orderId: j.id } }))
          .rateBps,
        1000,
      );
    },
  );
  await check(
    "seller sees only own order, buyer cannot see others, admin sees both",
    async () => {
      assert.equal((await listOrders(first, seller1.id)).length, 1);
      assert.equal((await listOrders(second, seller2.id)).length, 1);
      assert.equal((await listOrders(otherBuyer)).length, 0);
      assert.equal(((await adminData(admin, "orders")) as unknown[]).length, 2);
      await assert.rejects(() => listOrders(first, seller2.id));
    },
  );
  await check(
    "checkout key cannot be reused with a different request",
    async () => {
      await assert.rejects(() =>
        checkout(buyer, {
          idempotencyKey: key,
          address: { ...address, city: "Астана" },
        }),
      );
    },
  );
  const order1 = a.orders.find((o) => o.sellerId === seller1.id)!;
  const order2 = a.orders.find((o) => o.sellerId === seller2.id)!;
  await check(
    "order state and ownership checks reject unauthorized writes",
    async () => {
      await assert.rejects(() =>
        transitionOrder(second, order1.id, { status: "CONFIRMED" }, seller2.id),
      );
      await assert.rejects(() =>
        transitionOrder(buyer, order1.id, { status: "DELIVERED" }),
      );
      await assert.rejects(() =>
        transitionOrder(first, order1.id, { status: "CONFIRMED" }, seller1.id),
      );
    },
  );
  const eventId = randomUUID();
  await check(
    "verified test payments are isolated and idempotent",
    async () => {
      await assert.rejects(() =>
        testPayment(otherBuyer, order1.id, { eventId }),
      );
      await testPayment(buyer, order1.id, { eventId });
      await testPayment(buyer, order1.id, { eventId });
      assert.equal(
        await db.paymentEvent.count({
          where: { paymentId: order1.payment!.id },
        }),
        1,
      );
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { orderId: order1.id } }))
          .status,
        "TEST_SUCCEEDED",
      );
      assert.equal(await db.payment.count({ where: { status: "PAID" } }), 0);
    },
  );
  await check(
    "cancel restores reserve exactly once and refunds simulated payment",
    async () => {
      await transitionOrder(buyer, order1.id, { status: "CANCELLED" });
      await assert.rejects(() =>
        transitionOrder(buyer, order1.id, { status: "CANCELLED" }),
      );
      const inv = await db.inventory.findUniqueOrThrow({
        where: { variantId: m.id },
      });
      assert.equal(inv.available, 2);
      assert.equal(inv.reserved, 0);
      assert.equal(
        (await db.payment.findUniqueOrThrow({ where: { orderId: order1.id } }))
          .status,
        "TEST_REFUNDED",
      );
    },
  );
  await testPayment(buyer, order2.id, { eventId: randomUUID() });
  await transitionOrder(second, order2.id, { status: "CONFIRMED" }, seller2.id);
  await transitionOrder(
    second,
    order2.id,
    { status: "PROCESSING" },
    seller2.id,
  );
  await transitionOrder(
    second,
    order2.id,
    { status: "SHIPPED", carrier: "Test carrier", trackingNumber: "TEST-001" },
    seller2.id,
  );
  await transitionOrder(second, order2.id, { status: "DELIVERED" }, seller2.id);
  await check(
    "delivery consumes reserve and records shipment history",
    async () => {
      const stock = await db.inventory.findUniqueOrThrow({
        where: { variantId: s.id },
      });
      assert.equal(stock.available, 2);
      assert.equal(stock.reserved, 0);
      assert.equal(
        await db.orderStatusHistory.count({ where: { orderId: order2.id } }),
        5,
      );
    },
  );
  const r = await requestReturn(buyer, order2.id, {
    reason: "Тестовый возврат товара после доставки",
  });
  await check(
    "return process restocks only after approval and receipt once",
    async () => {
      await assert.rejects(() =>
        reviewReturn(second, r.id, { status: "APPROVED" }),
      );
      await reviewReturn(admin, r.id, { status: "APPROVED" });
      assert.equal(
        (await db.inventory.findUniqueOrThrow({ where: { variantId: s.id } }))
          .available,
        2,
      );
      await reviewReturn(admin, r.id, { status: "RECEIVED" });
      await reviewReturn(admin, r.id, { status: "RECEIVED" });
      assert.equal(
        (await db.inventory.findUniqueOrThrow({ where: { variantId: s.id } }))
          .available,
        3,
      );
      assert.equal(
        (await db.order.findUniqueOrThrow({ where: { id: order2.id } })).status,
        "RETURNED",
      );
    },
  );
  await setCartItem(buyer, { variantId: l.id, quantity: 1 });
  await setCartItem(otherBuyer, { variantId: l.id, quantity: 1 });
  await check("concurrent buyers cannot oversell the last size", async () => {
    const result = await Promise.allSettled([
      checkout(buyer, { idempotencyKey: randomUUID(), address }),
      checkout(otherBuyer, { idempotencyKey: randomUUID(), address }),
    ]);
    assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
    const stock = await db.inventory.findUniqueOrThrow({
      where: { variantId: l.id },
    });
    assert.equal(stock.available, 0);
    assert.equal(stock.reserved, 1);
  });
  await check("failed checkout rolls back all inventory changes", async () => {
    await setCartItem(buyer, { variantId: l.id, quantity: 0 });
    await setCartItem(buyer, { variantId: m.id, quantity: 1 });
    await setCartItem(buyer, { variantId: s.id, quantity: 1 });
    await setInventory(second, seller2.id, s.id, 0);
    const before = await db.inventory.findUniqueOrThrow({
      where: { variantId: m.id },
    });
    await assert.rejects(() =>
      checkout(buyer, { idempotencyKey: randomUUID(), address }),
    );
    const after = await db.inventory.findUniqueOrThrow({
      where: { variantId: m.id },
    });
    assert.equal(before.available, after.available);
    assert.equal(before.reserved, after.reserved);
    assert.equal((await cart(buyer)).items.length, 2);
    await setInventory(second, seller2.id, s.id, 3);
  });
  await check(
    "blocked seller is hidden and cannot manage inventory",
    async () => {
      await reviewSeller(admin, seller2.id, { status: "BLOCKED" });
      assert.equal((await catalog(new URLSearchParams())).total, 1);
      await assert.rejects(() => setInventory(second, seller2.id, s.id, 10));
      await reviewSeller(admin, seller2.id, { status: "ACTIVE" });
    },
  );
  await check("database constraints reject negative stock", async () => {
    await assert.rejects(() =>
      db.inventory.update({
        where: { variantId: m.id },
        data: { available: -1 },
      }),
    );
  });
  await check("Telegram login validates HMAC and denies replay", async () => {
    const p = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 450000000001, first_name: "Test Telegram" }),
    });
    const data = [...p]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = createHmac("sha256", "WebAppData")
      .update("integration-only")
      .digest();
    p.set("hash", createHmac("sha256", secret).update(data).digest("hex"));
    const u = await telegramLogin(p.toString());
    assert.equal(u.telegramId, 450000000001n);
    await assert.rejects(() => telegramLogin(p.toString()));
  });
  await check(
    "database rejects inconsistent old price and accepts an exact discount",
    async () => {
      await assert.rejects(() =>
        db.product.update({
          where: { id: jacket.id },
          data: { oldPriceMinor: 4000000, discountPercent: 25 },
        }),
      );
      await db.product.update({
        where: { id: jacket.id },
        data: {
          priceMinor: 3000000,
          oldPriceMinor: 4000000,
          discountPercent: 25,
        },
      });
      const product = await db.product.findUniqueOrThrow({
        where: { id: jacket.id },
      });
      assert.equal(
        product.priceMinor * 100,
        product.oldPriceMinor! * (100 - product.discountPercent!),
      );
    },
  );
  await check(
    "demo products cannot create non-test orders and rejected checkout preserves all stock",
    async () => {
      await db.product.update({
        where: { id: jacket.id },
        data: { demoDataset: "integration-demo" },
      });
      const before = await db.inventory.findMany({ orderBy: { id: "asc" } });
      process.env.TEST_PAYMENTS = "false";
      try {
        await assert.rejects(
          () => checkout(buyer, { idempotencyKey: randomUUID(), address }),
          /Демонстрационные товары/,
        );
      } finally {
        process.env.TEST_PAYMENTS = "true";
      }
      assert.deepEqual(
        await db.inventory.findMany({ orderBy: { id: "asc" } }),
        before,
      );
    },
  );
  await check(
    "integration fixtures are retained but hidden before the separate demo seed",
    async () => {
      await db.seller.updateMany({
        where: { id: { in: [seller1.id, seller2.id] } },
        data: { status: "BLOCKED" },
      });
      assert.equal((await catalog(new URLSearchParams())).total, 0);
      assert.equal(
        await db.seller.count({
          where: { id: { in: [seller1.id, seller2.id] } },
        }),
        2,
      );
    },
  );
  console.log(`\n${count} PostgreSQL integration scenarios passed.`);
} finally {
  await db.$disconnect();
}
