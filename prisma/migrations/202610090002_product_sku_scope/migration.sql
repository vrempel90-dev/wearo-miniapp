BEGIN;
DROP INDEX "ProductVariant_sku_key";
CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");
COMMIT;
