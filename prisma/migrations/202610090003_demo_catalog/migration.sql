BEGIN;
ALTER TABLE "Seller" ADD COLUMN "demoDataset" TEXT, ADD COLUMN "demoKey" TEXT, ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN "oldPriceMinor" INTEGER, ADD COLUMN "discountPercent" INTEGER, ADD COLUMN "demoDataset" TEXT, ADD COLUMN "demoKey" TEXT, ADD COLUMN "styleTag" TEXT;
CREATE UNIQUE INDEX "Seller_demoKey_key" ON "Seller"("demoKey");
CREATE UNIQUE INDEX "Product_demoKey_key" ON "Product"("demoKey");
CREATE INDEX "Seller_demoDataset_idx" ON "Seller"("demoDataset");
CREATE INDEX "Product_demoDataset_idx" ON "Product"("demoDataset");
ALTER TABLE "Product" ADD CONSTRAINT "Product_discount_check" CHECK (
  ("oldPriceMinor" IS NULL AND "discountPercent" IS NULL) OR
  ("oldPriceMinor" IS NOT NULL AND "discountPercent" IS NOT NULL AND "discountPercent" BETWEEN 10 AND 30 AND "oldPriceMinor" > "priceMinor" AND
   "priceMinor"::BIGINT * 100 = "oldPriceMinor"::BIGINT * (100 - "discountPercent"))
);
COMMIT;
