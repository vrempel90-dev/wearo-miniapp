import { describe, it, expect } from "vitest";
import { commission, validateTransition } from "../src/server/order-rules";
import { checkoutInput, productInput } from "../src/server/validation";
import {
  developmentEnabled,
  testPaymentsEnabled,
  validateProduction,
} from "../src/server/config";
import {
  DisabledPaymentProvider,
  TestPaymentProvider,
} from "../src/server/payments";
describe("order rules", () => {
  it("calculates integer KZT commission and seller net", () =>
    expect(commission(2990000, 1000)).toEqual({
      rateBps: 1000,
      amountMinor: 299000,
      sellerNetMinor: 2691000,
    }));
  it("rounds fractional tiyn deterministically", () =>
    expect(commission(105, 1000).amountMinor).toBe(11));
  it("allows zero and full commission", () => {
    expect(commission(100, 0).sellerNetMinor).toBe(100);
    expect(commission(100, 10000).sellerNetMinor).toBe(0);
  });
  it("rejects invalid commission", () => {
    expect(() => commission(100, 10001)).toThrow();
    expect(() => commission(-1, 1000)).toThrow();
  });
  it("rejects skipped states", () =>
    expect(() =>
      validateTransition("PENDING", "DELIVERED", "SELLER"),
    ).toThrow());
  it("protects terminal statuses", () => {
    expect(() =>
      validateTransition("CANCELLED", "CONFIRMED", "ADMIN"),
    ).toThrow();
    expect(() =>
      validateTransition("RETURNED", "DELIVERED", "ADMIN"),
    ).toThrow();
  });
  it("buyer cannot ship", () =>
    expect(() =>
      validateTransition("PROCESSING", "SHIPPED", "BUYER"),
    ).toThrow());
  it("seller cannot approve returns", () =>
    expect(() =>
      validateTransition("RETURN_REQUESTED", "RETURNED", "SELLER"),
    ).toThrow());
  it("buyer can cancel before processing", () => {
    expect(() =>
      validateTransition("PENDING", "CANCELLED", "BUYER"),
    ).not.toThrow();
    expect(() =>
      validateTransition("PROCESSING", "CANCELLED", "BUYER"),
    ).toThrow();
  });
});
describe("input restrictions", () => {
  it("rejects price injection in checkout", () =>
    expect(() =>
      checkoutInput.parse({ idempotencyKey: "aa", totalMinor: 1 }),
    ).toThrow());
  it("rejects negative stock", () =>
    expect(() =>
      productInput.parse({
        title: "Куртка",
        description: "Описание куртки",
        categoryId: "test",
        priceMinor: 100,
        variants: [{ sku: "sku", size: "M", color: "black", available: -1 }],
      }),
    ).toThrow());
});
describe("production isolation", () => {
  it("cannot activate development auth or test payments in production", () => {
    const env = { ...process.env };
    try {
      process.env = {
        ...process.env,
        NODE_ENV: "production",
        DEV_AUTH: "true",
        TEST_PAYMENTS: "true",
      };
      expect(developmentEnabled()).toBe(false);
      expect(testPaymentsEnabled()).toBe(false);
      expect(() => validateProduction()).toThrow();
    } finally {
      process.env = env;
    }
  });
  it("disabled provider never confirms or refunds money", async () => {
    const provider = new DisabledPaymentProvider();
    await expect(provider.createIntent()).rejects.toThrow();
    expect(() => provider.verifyEvent()).toThrow();
    await expect(provider.refund()).rejects.toThrow();
  });
  it("rejects forged payment event signatures", () => {
    process.env.TEST_PAYMENTS = "true";
    const provider = new TestPaymentProvider();
    expect(() => provider.verifyEvent("{}", "0".repeat(64))).toThrow();
  });
});
