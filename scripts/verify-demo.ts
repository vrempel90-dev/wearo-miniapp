import { loadEnvFile } from "node:process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { DATASET, makeDemoCatalog } from "../prisma/demo-data";
try {
  loadEnvFile(".env");
} catch {}
if (process.env.NODE_ENV === "production" || process.env.DEMO_SEED !== "true")
  throw new Error("Explicit demo environment required");
const { db } = await import("../src/server/db");
try {
  const products = await db.product.findMany({
    where: { demoDataset: DATASET },
    include: {
      category: { include: { parent: true } },
      seller: true,
      variants: { include: { inventory: true } },
      images: true,
    },
  });
  assert.equal(products.length, 500);
  assert.equal(await db.seller.count({ where: { demoDataset: DATASET } }), 15);
  assert.equal(new Set(products.map((p) => p.sellerId)).size, 15);
  const allocation = {
    womenClothing: 0,
    womenShoes: 0,
    menClothing: 0,
    menShoes: 0,
  };
  const hashes = new Set<string>();
  let photos = 0,
    variants = 0,
    discounts = 0;
  for (const p of products) {
    const group = p.category.parent?.slug.endsWith("-shoes")
      ? "Shoes"
      : "Clothing";
    const key =
      `${p.category.gender === "WOMEN" ? "women" : "men"}${group}` as keyof typeof allocation;
    allocation[key]++;
    const canonical = makeDemoCatalog().find(
      (item) => item.demoKey === p.demoKey,
    )!;
    assert.ok(canonical);
    assert.equal(p.priceMinor, canonical.priceMinor);
    assert.equal(p.status, "APPROVED");
    assert.equal(p.seller.status, "ACTIVE");
    if (p.discountPercent) {
      discounts++;
      assert.equal(
        p.priceMinor * 100,
        p.oldPriceMinor! * (100 - p.discountPercent),
      );
    }
    assert.equal(p.variants.length, canonical.variants.length);
    for (const v of p.variants) {
      variants++;
      assert.ok(
        v.inventory && v.inventory.available >= 0 && v.inventory.reserved >= 0,
      );
    }
    for (const image of p.images) {
      assert.ok(image.url.startsWith("/demo/products/"));
      const bytes = await readFile(`public${image.url}`);
      const meta = await sharp(bytes).metadata();
      assert.ok(
        meta.width && meta.width >= 800 && meta.height && meta.height >= 1000,
      );
      const hash = createHash("sha256").update(bytes).digest("hex");
      assert.ok(!hashes.has(hash), `Duplicate photo ${image.url}`);
      hashes.add(hash);
      photos++;
    }
  }
  assert.deepEqual(allocation, {
    womenClothing: 150,
    womenShoes: 100,
    menClothing: 150,
    menShoes: 100,
  });
  assert.equal(discounts, 125);
  const result = {
    dataset: DATASET,
    products: products.length,
    stores: 15,
    allocation,
    variants,
    discounts,
    uniquePhotos: photos,
    missingPhotos: 500 - photos,
    completePhotography: photos === 500,
  };
  await mkdir("work", { recursive: true });
  await writeFile(
    "work/demo-verification.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
