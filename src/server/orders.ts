import { Prisma, User } from "@prisma/client";
import { db, transaction } from "./db";
import { assert } from "./errors";
import { digest, requireSeller } from "./auth";
import { testPaymentsEnabled } from "./config";
import { checkoutInput, orderTransitionInput } from "./validation";
import { commission, validateTransition } from "./order-rules";
export const orderInclude = {
  items: true,
  seller: { select: { id: true, name: true } },
  payment: true,
  commission: true,
  history: { orderBy: { createdAt: "asc" as const } },
  shipment: true,
  returnRequest: true,
};
export async function checkout(user: User, input: unknown) {
  const data = checkoutInput.parse(input);
  const requestHash = digest(JSON.stringify(data.address));
  return transaction(async (tx) => {
    const existing = await tx.checkout.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: user.id,
          idempotencyKey: data.idempotencyKey,
        },
      },
      include: { orders: { include: orderInclude } },
    });
    if (existing) {
      assert(
        existing.requestHash === requestHash,
        409,
        "Ключ оформления уже использован для другого запроса",
      );
      return existing;
    }
    const basket = await tx.cart.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                inventory: true,
                product: { include: { seller: true } },
              },
            },
          },
        },
      },
    });
    assert(
      basket && basket.items.length > 0 && basket.items.length <= 50,
      400,
      "Корзина пуста или слишком велика",
    );
    const groups = new Map<string, typeof basket.items>();
    for (const item of [...basket.items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    )) {
      const v = item.variant,
        p = v.product;
      assert(
        v.active && p.status === "APPROVED" && p.seller.status === "ACTIVE",
        409,
        `Товар ${p.title} недоступен`,
      );
      const stock = await tx.inventory.updateMany({
        where: { variantId: v.id, available: { gte: item.quantity } },
        data: {
          available: { decrement: item.quantity },
          reserved: { increment: item.quantity },
        },
      });
      assert(
        stock.count === 1,
        409,
        `Недостаточно остатков: ${p.title}, ${v.size}`,
      );
      groups.set(p.sellerId, [...(groups.get(p.sellerId) ?? []), item]);
    }
    const created = await tx.checkout.create({
      data: {
        userId: user.id,
        idempotencyKey: data.idempotencyKey,
        requestHash,
      },
    });
    const isTest = testPaymentsEnabled();
    for (const [sellerId, items] of groups) {
      const totalMinor = items.reduce(
        (sum, i) => sum + i.quantity * i.variant.product.priceMinor,
        0,
      );
      assert(totalMinor <= 2_000_000_000, 400, "Сумма заказа превышает лимит");
      const fees = commission(
        totalMinor,
        items[0].variant.product.seller.commissionBps,
      );
      await tx.order.create({
        data: {
          checkoutId: created.id,
          buyerId: user.id,
          sellerId,
          totalMinor,
          address: data.address,
          isTest,
          items: {
            create: items.map((i) => ({
              variantId: i.variantId,
              title: i.variant.product.title,
              sku: i.variant.sku,
              size: i.variant.size,
              color: i.variant.color,
              priceMinor: i.variant.product.priceMinor,
              quantity: i.quantity,
            })),
          },
          history: { create: { toStatus: "PENDING", actorId: user.id } },
          commission: { create: fees },
          payment: {
            create: {
              provider: isTest ? "TEST" : "DISABLED",
              amountMinor: totalMinor,
            },
          },
        },
      });
    }
    await tx.cartItem.deleteMany({ where: { cartId: basket.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CHECKOUT_CREATED",
        entityId: created.id,
        details: { orders: groups.size, isTest },
      },
    });
    return tx.checkout.findUniqueOrThrow({
      where: { id: created.id },
      include: { orders: { include: orderInclude } },
    });
  });
}
export async function listOrders(user: User, sellerId?: string) {
  if (sellerId) await requireSeller(user, sellerId);
  return db.order.findMany({
    where: sellerId ? { sellerId } : { buyerId: user.id },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
export async function accessibleOrder(
  tx: Prisma.TransactionClient,
  user: User,
  orderId: string,
  sellerId?: string,
) {
  const where: Prisma.OrderWhereInput = { id: orderId };
  if (sellerId) {
    const member = await tx.sellerMembership.findUnique({
      where: { userId_sellerId: { userId: user.id, sellerId } },
      include: { seller: true },
    });
    assert(
      member &&
        member.seller.status === "ACTIVE" &&
        ["SELLER", "ADMIN"].includes(user.role),
      403,
      "Магазин недоступен",
    );
    where.sellerId = sellerId;
  } else if (user.role !== "ADMIN") where.buyerId = user.id;
  const order = await tx.order.findFirst({ where, include: orderInclude });
  assert(order, 404, "Заказ не найден");
  return order;
}
export async function releaseReservation(
  tx: Prisma.TransactionClient,
  order: { items: { variantId: string; quantity: number }[] },
  restock: boolean,
) {
  for (const i of order.items) {
    const result = await tx.inventory.updateMany({
      where: { variantId: i.variantId, reserved: { gte: i.quantity } },
      data: {
        reserved: { decrement: i.quantity },
        ...(restock ? { available: { increment: i.quantity } } : {}),
      },
    });
    assert(result.count === 1, 409, "Не удалось согласовать резерв");
  }
}
export async function transitionOrder(
  user: User,
  orderId: string,
  input: unknown,
  sellerId?: string,
) {
  const data = orderTransitionInput.parse(input);
  assert(
    !["RETURN_REQUESTED", "RETURNED"].includes(data.status),
    400,
    "Используйте процедуру возврата",
  );
  return transaction(async (tx) => {
    const order = await accessibleOrder(tx, user, orderId, sellerId);
    const actor = sellerId
      ? "SELLER"
      : user.role === "ADMIN"
        ? "ADMIN"
        : "BUYER";
    validateTransition(order.status, data.status, actor);
    assert(
      order.status !== "RETURN_REQUESTED",
      409,
      "Заказ находится в процедуре возврата",
    );
    if (data.status === "CONFIRMED")
      assert(
        order.payment?.status === "PAID" ||
          (order.isTest && order.payment?.status === "TEST_SUCCEEDED"),
        409,
        "Оплата не подтверждена",
      );
    if (data.status === "SHIPPED") {
      assert(
        data.carrier && data.trackingNumber,
        400,
        "Укажите службу доставки и трек-номер",
      );
      await tx.shipment.create({
        data: {
          orderId,
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
        },
      });
    }
    if (data.status === "DELIVERED") {
      await releaseReservation(tx, order, false);
      if (!order.isTest && order.payment?.status === "PAID" && order.commission)
        await tx.commission.update({
          where: { orderId },
          data: { payableMinor: order.commission.sellerNetMinor },
        });
    }
    if (data.status === "CANCELLED") {
      assert(
        order.payment?.status !== "PAID",
        503,
        "Для отмены нужен подключённый провайдер возвратов",
      );
      await releaseReservation(tx, order, true);
      if (order.payment) {
        const status =
          order.payment.status === "TEST_SUCCEEDED"
            ? "TEST_REFUNDED"
            : "CANCELLED";
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status },
        });
        await tx.paymentEvent.create({
          data: {
            paymentId: order.payment.id,
            eventId: `cancel:${orderId}`,
            type: status,
          },
        });
      }
      await tx.commission.update({
        where: { orderId },
        data: { reversedAt: new Date(), payableMinor: 0 },
      });
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: data.status,
        actorId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ORDER_STATUS_CHANGED",
        entityId: orderId,
        details: { from: order.status, to: data.status },
      },
    });
    return tx.order.update({
      where: { id: orderId },
      data: { status: data.status },
      include: orderInclude,
    });
  });
}
