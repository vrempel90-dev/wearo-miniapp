import { describe, expect, it } from "vitest";
import { makeDemoCatalog, stores } from "../prisma/demo-data";
const products = makeDemoCatalog();
describe("reproducible fictional catalog", () => {
  it("generates 500 products with the exact gender/category allocation across all 15 stores", () => {
    expect(products).toHaveLength(500);
    expect(stores).toHaveLength(15);
    for (const [gender, group, count] of [
      ["WOMEN", "clothing", 150],
      ["WOMEN", "shoes", 100],
      ["MEN", "clothing", 150],
      ["MEN", "shoes", 100],
    ])
      expect(
        products.filter((p) => p.gender === gender && p.group === group),
      ).toHaveLength(count as number);
    expect(new Set(products.map((p) => p.storeIndex)).size).toBe(15);
    expect(makeDemoCatalog()).toEqual(products);
  });
  it("uses unique identities, titles, descriptions, photo paths and SKU values", () => {
    for (const key of [
      "id",
      "demoKey",
      "title",
      "description",
      "photo",
    ] as const)
      expect(new Set(products.map((p) => p[key])).size).toBe(500);
    const variants = products.flatMap((p) => p.variants);
    expect(new Set(variants.map((v) => v.sku)).size).toBe(variants.length);
  });
  it("keeps displayed prices within the requested fictional KZT ranges and discounts exact", () => {
    const ranges: Record<string, number[]> = {
      tee: [3990, 12990],
      shirt: [7990, 24990],
      hoodie: [9990, 29990],
      sweatshirt: [9990, 29990],
      jeans: [9990, 34990],
      trousers: [8990, 29990],
      dress: [9990, 49990],
      jacket: [19990, 79990],
      coat: [29990, 119990],
      sneakers: [12990, 59990],
      canvas: [9990, 39990],
      boots: [19990, 69990],
      pumps: [14990, 59990],
      dressshoes: [14990, 59990],
    };
    for (const p of products) {
      if (ranges[p.kind]) {
        expect(p.priceMinor).toBeGreaterThanOrEqual(ranges[p.kind][0] * 100);
        expect(p.priceMinor).toBeLessThanOrEqual(ranges[p.kind][1] * 100);
      }
      if (p.discountPercent) {
        expect(p.discountPercent).toBeGreaterThanOrEqual(10);
        expect(p.discountPercent).toBeLessThanOrEqual(30);
        expect(p.priceMinor * 100).toBe(
          p.oldPriceMinor! * (100 - p.discountPercent),
        );
      } else expect(p.oldPriceMinor).toBeNull();
    }
    expect(products.filter((p) => p.discountPercent)).toHaveLength(125);
  });
  it("uses gender-appropriate shoe sizes and independent positive variant stock", () => {
    for (const p of products) {
      expect(new Set(p.variants.map((v) => v.color)).size).toBe(2);
      for (const v of p.variants) {
        expect(v.available).toBeGreaterThan(0);
        if (p.group === "shoes") {
          expect(Number(v.size)).toBeGreaterThanOrEqual(
            p.gender === "WOMEN" ? 36 : 40,
          );
          expect(Number(v.size)).toBeLessThanOrEqual(
            p.gender === "WOMEN" ? 41 : 45,
          );
        } else expect(["XS", "S", "M", "L", "XL", "XXL"]).toContain(v.size);
      }
    }
  });
});
