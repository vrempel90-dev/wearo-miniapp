import { User } from "@prisma/client";
import { z } from "zod";
import { db, transaction } from "./db";
import { requireAdmin } from "./auth";
import { assert } from "./errors";
import { orderInclude } from "./orders";
export async function reviewSeller(
  user: User,
  sellerId: string,
  input: unknown,
) {
  requireAdmin(user);
  const data = z
    .object({
      status: z.enum(["ACTIVE", "BLOCKED", "REJECTED"]),
      note: z.string().max(1000).default(""),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const seller = await tx.seller.findUnique({
      where: { id: sellerId },
      include: { application: true, memberships: true },
    });
    assert(seller, 404, "Магазин не найден");
    const allowed: Record<string, string[]> = {
      PENDING: ["ACTIVE", "REJECTED"],
      ACTIVE: ["BLOCKED"],
      BLOCKED: ["ACTIVE"],
      REJECTED: [],
    };
    assert(
      allowed[seller.status].includes(data.status),
      409,
      "Недопустимое решение по магазину",
    );
    if (data.status === "ACTIVE")
      await tx.user.updateMany({
        where: {
          id: { in: seller.memberships.map((m) => m.userId) },
          role: "BUYER",
        },
        data: { role: "SELLER" },
      });
    if (seller.application)
      await tx.sellerApplication.update({
        where: { sellerId },
        data: {
          status: data.status,
          reviewNote: data.note,
          reviewedAt: new Date(),
        },
      });
    const result = await tx.seller.update({
      where: { id: sellerId },
      data: { status: data.status },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "SELLER_REVIEWED",
        entityId: sellerId,
        details: { status: data.status, note: data.note },
      },
    });
    return result;
  });
}
export async function moderateProduct(
  user: User,
  productId: string,
  input: unknown,
) {
  requireAdmin(user);
  const data = z
    .object({
      status: z.enum(["APPROVED", "REJECTED"]),
      note: z.string().max(1000).default(""),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { seller: true },
    });
    assert(product, 404, "Товар не найден");
    assert(
      product.seller.status === "ACTIVE" || data.status === "REJECTED",
      409,
      "Магазин не активен",
    );
    const result = await tx.product.update({
      where: { id: productId },
      data: { status: data.status, moderationNote: data.note },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "PRODUCT_MODERATED",
        entityId: productId,
        details: { status: data.status, note: data.note },
      },
    });
    return result;
  });
}
export async function updateCommission(
  user: User,
  sellerId: string,
  input: unknown,
) {
  requireAdmin(user);
  const { commissionBps } = z
    .object({ commissionBps: z.number().int().min(0).max(10000) })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const seller = await tx.seller.update({
      where: { id: sellerId },
      data: { commissionBps },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "COMMISSION_UPDATED",
        entityId: sellerId,
        details: { commissionBps },
      },
    });
    return seller;
  });
}
export async function saveCategory(
  user: User,
  input: unknown,
  categoryId?: string,
) {
  requireAdmin(user);
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
      gender: z.enum(["WOMEN", "MEN"]),
      parentId: z.string().max(80).nullable().default(null),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    if (categoryId) {
      const child = await tx.category.findFirst({
        where: { parentId: categoryId, gender: { not: data.gender } },
      });
      assert(!child, 409, "Пол дочерних категорий не совпадает");
    }
    let parentId = data.parentId;
    const seen = new Set<string>();
    while (parentId) {
      assert(
        parentId !== categoryId && !seen.has(parentId),
        400,
        "Цикл категорий",
      );
      seen.add(parentId);
      const parent = await tx.category.findUnique({ where: { id: parentId } });
      assert(
        parent && parent.gender === data.gender,
        400,
        "Некорректная родительская категория",
      );
      parentId = parent.parentId;
    }
    const result = categoryId
      ? await tx.category.update({ where: { id: categoryId }, data })
      : await tx.category.create({ data });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "CATEGORY_SAVED", entityId: result.id },
    });
    return result;
  });
}
export async function deleteCategory(user: User, id: string) {
  requireAdmin(user);
  return transaction(async (tx) => {
    assert(
      !(await tx.product.count({ where: { categoryId: id } })) &&
        !(await tx.category.count({ where: { parentId: id } })),
      409,
      "Сначала перенесите товары и дочерние категории",
    );
    await tx.category.delete({ where: { id } });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "CATEGORY_DELETED", entityId: id },
    });
    return { ok: true };
  });
}
export async function adminData(user: User, section: string, page = 1) {
  requireAdmin(user);
  const paging = { take: 50, skip: (page - 1) * 50 };
  if (section === "overview") {
    const [sellers, products, orders, realSales, liabilities] =
      await Promise.all([
        db.seller.count(),
        db.product.count(),
        db.order.count(),
        db.order.aggregate({
          where: {
            isTest: false,
            status: "DELIVERED",
            payment: { status: "PAID" },
          },
          _sum: { totalMinor: true },
          _count: true,
        }),
        db.commission.aggregate({ _sum: { payableMinor: true } }),
      ]);
    return {
      sellers,
      products,
      orders,
      realSales: realSales._count,
      realRevenueMinor: realSales._sum.totalMinor ?? 0,
      payableMinor: liabilities._sum.payableMinor ?? 0,
    };
  }
  if (section === "applications")
    return db.sellerApplication.findMany({
      include: { seller: true, user: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
  if (section === "sellers")
    return db.seller.findMany({ orderBy: { createdAt: "desc" }, ...paging });
  if (section === "products")
    return db.product.findMany({
      include: {
        seller: { select: { id: true, name: true } },
        category: true,
        brand: true,
        images: true,
        variants: { include: { inventory: true } },
      },
      orderBy: { updatedAt: "desc" },
      ...paging,
    });
  if (section === "categories")
    return db.category.findMany({ orderBy: { name: "asc" } });
  if (section === "orders")
    return db.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      ...paging,
    });
  if (section === "commissions")
    return db.commission.findMany({
      include: {
        order: {
          select: {
            id: true,
            isTest: true,
            status: true,
            seller: { select: { name: true } },
          },
        },
      },
      orderBy: { id: "desc" },
      ...paging,
    });
  if (section === "returns")
    return db.returnRequest.findMany({
      include: { order: { include: orderInclude } },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
  if (section === "audit")
    return db.auditLog.findMany({
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      ...paging,
    });
  assert(false, 404, "Раздел не найден");
}
