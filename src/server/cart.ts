import { User } from "@prisma/client";
import { z } from "zod";
import { db, transaction } from "./db";
import { assert } from "./errors";
export async function cart(user: User) {
  const result = await db.cart.findUnique({
    where: { userId: user.id },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          variant: {
            include: {
              inventory: true,
              product: {
                include: {
                  seller: { select: { id: true, name: true, status: true } },
                  images: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const items = (result?.items ?? []).map((i) => ({
    ...i,
    available:
      i.variant.active &&
      i.variant.product.status === "APPROVED" &&
      i.variant.product.seller.status === "ACTIVE" &&
      (i.variant.inventory?.available ?? 0) >= i.quantity,
    lineTotalMinor: i.quantity * i.variant.product.priceMinor,
  }));
  return {
    items,
    totalMinor: items.reduce((sum, i) => sum + i.lineTotalMinor, 0),
  };
}
export async function setCartItem(user: User, input: unknown) {
  const data = z
    .object({
      variantId: z.string().max(80),
      quantity: z.number().int().min(0).max(99),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const basket = await tx.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    if (data.quantity === 0)
      return tx.cartItem.deleteMany({
        where: { cartId: basket.id, variantId: data.variantId },
      });
    const variant = await tx.productVariant.findFirst({
      where: {
        id: data.variantId,
        active: true,
        product: { status: "APPROVED", seller: { status: "ACTIVE" } },
      },
      include: { inventory: true },
    });
    assert(
      variant &&
        variant.inventory &&
        variant.inventory.available >= data.quantity,
      409,
      "Вариант недоступен или недостаточно остатков",
    );
    assert(
      (await tx.cartItem.count({ where: { cartId: basket.id } })) < 50 ||
        (await tx.cartItem.findUnique({
          where: {
            cartId_variantId: { cartId: basket.id, variantId: data.variantId },
          },
        })),
      400,
      "Не более 50 позиций",
    );
    return tx.cartItem.upsert({
      where: {
        cartId_variantId: { cartId: basket.id, variantId: data.variantId },
      },
      create: { cartId: basket.id, ...data },
      update: { quantity: data.quantity },
    });
  });
}
