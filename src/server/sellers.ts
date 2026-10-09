import { User } from "@prisma/client";
import { db, transaction } from "./db";
import { requireSeller } from "./auth";
import { assert } from "./errors";
import {
  productInput,
  productUpdateInput,
  sellerApplicationInput,
  sellerProfileInput,
  variantInput,
} from "./validation";
export async function applySeller(user: User, input: unknown) {
  const data = sellerApplicationInput.parse(input);
  return transaction(async (tx) => {
    assert(
      !(await tx.sellerApplication.findFirst({
        where: { userId: user.id, status: { in: ["PENDING", "ACTIVE"] } },
      })),
      409,
      "Заявка уже существует",
    );
    const { contact, ...profile } = data;
    const seller = await tx.seller.create({
      data: {
        ...profile,
        memberships: { create: { userId: user.id } },
        application: { create: { userId: user.id, contact } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SELLER_APPLICATION",
        entityId: seller.id,
      },
    });
    return seller;
  });
}
export async function updateSeller(
  user: User,
  sellerId: string,
  input: unknown,
) {
  await requireSeller(user, sellerId);
  const data = sellerProfileInput.parse(input);
  return transaction(async (tx) => {
    const seller = await tx.seller.update({ where: { id: sellerId }, data });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SELLER_PROFILE_UPDATED",
        entityId: sellerId,
      },
    });
    return seller;
  });
}
export async function saveProduct(
  user: User,
  sellerId: string,
  input: unknown,
  productId?: string,
) {
  await requireSeller(user, sellerId);
  const data = productId
    ? productUpdateInput.parse(input)
    : productInput.parse(input);
  return transaction(async (tx) => {
    if (productId)
      assert(
        await tx.product.findFirst({ where: { id: productId, sellerId } }),
        404,
        "Товар не найден",
      );
    assert(
      await tx.category.findUnique({ where: { id: data.categoryId } }),
      400,
      "Категория не найдена",
    );
    if (data.imageIds.length)
      assert(
        (await tx.productImage.count({
          where: {
            id: { in: data.imageIds },
            sellerId,
            OR: [{ productId: null }, ...(productId ? [{ productId }] : [])],
          },
        })) === data.imageIds.length,
        403,
        "Изображения недоступны",
      );
    const brand = data.brand
      ? await tx.brand.upsert({
          where: { name: data.brand },
          create: { name: data.brand },
          update: {},
        })
      : null;
    const fields = {
      title: data.title,
      description: data.description,
      priceMinor: data.priceMinor,
      oldPriceMinor: null,
      discountPercent: null,
      categoryId: data.categoryId,
      brandId: brand?.id ?? null,
      status: "PENDING" as const,
      moderationNote: null,
    };
    const product = productId
      ? await tx.product.update({ where: { id: productId }, data: fields })
      : await tx.product.create({
          data: {
            ...fields,
            sellerId,
            variants: {
              create: productInput.parse(input).variants.map((v) => ({
                sku: v.sku,
                size: v.size,
                color: v.color,
                inventory: { create: { available: v.available } },
              })),
            },
          },
        });
    await tx.productImage.updateMany({
      where: { productId: product.id },
      data: { productId: null },
    });
    for (const [position, imageId] of data.imageIds.entries())
      await tx.productImage.update({
        where: { id: imageId },
        data: { productId: product.id, position },
      });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: productId ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
        entityId: product.id,
      },
    });
    return product;
  });
}
export async function addVariant(
  user: User,
  sellerId: string,
  productId: string,
  input: unknown,
) {
  await requireSeller(user, sellerId);
  const data = variantInput.parse(input);
  return transaction(async (tx) => {
    assert(
      await tx.product.findFirst({ where: { id: productId, sellerId } }),
      404,
      "Товар не найден",
    );
    const variant = await tx.productVariant.create({
      data: {
        productId,
        sku: data.sku,
        size: data.size,
        color: data.color,
        inventory: { create: { available: data.available } },
      },
    });
    await tx.product.update({
      where: { id: productId },
      data: { status: "PENDING" },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "VARIANT_CREATED",
        entityId: variant.id,
      },
    });
    return variant;
  });
}
export async function setInventory(
  user: User,
  sellerId: string,
  variantId: string,
  available: number,
) {
  await requireSeller(user, sellerId);
  assert(
    Number.isInteger(available) && available >= 0 && available <= 100000,
    400,
    "Некорректный остаток",
  );
  return transaction(async (tx) => {
    assert(
      await tx.productVariant.findFirst({
        where: { id: variantId, product: { sellerId } },
      }),
      404,
      "Вариант не найден",
    );
    const stock = await tx.inventory.update({
      where: { variantId },
      data: { available },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "INVENTORY_UPDATED",
        entityId: variantId,
        details: { available },
      },
    });
    return stock;
  });
}
export async function sellerDashboard(user: User, sellerId: string) {
  await requireSeller(user, sellerId);
  const [seller, products, orders, images] = await Promise.all([
    db.seller.findUnique({ where: { id: sellerId } }),
    db.product.findMany({
      where: { sellerId },
      include: {
        category: true,
        brand: true,
        images: true,
        variants: { include: { inventory: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.order.findMany({
      where: { sellerId },
      include: {
        items: true,
        payment: true,
        commission: true,
        shipment: true,
        history: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.productImage.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const realSales = await db.order.aggregate({
    where: {
      sellerId,
      isTest: false,
      status: "DELIVERED",
      payment: { status: "PAID" },
    },
    _sum: { totalMinor: true },
    _count: true,
  });
  return {
    seller,
    products,
    orders,
    images,
    stats: {
      realSalesCount: realSales._count,
      realRevenueMinor: realSales._sum.totalMinor ?? 0,
      testOrders: await db.order.count({ where: { sellerId, isTest: true } }),
    },
  };
}
