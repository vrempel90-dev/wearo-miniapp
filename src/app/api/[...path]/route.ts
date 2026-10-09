import { z } from "zod";
import { db } from "@/server/db";
import { body, checkOrigin, handle, rateLimit } from "@/server/http";
import {
  currentUser,
  createSession,
  devLogin,
  requireSeller,
  requireUser,
  telegramLogin,
  digest,
} from "@/server/auth";
import { developmentEnabled, validateProduction } from "@/server/config";
import { catalog, publicProduct, demoStatus, showcase } from "@/server/catalog";
import {
  addVariant,
  applySeller,
  saveProduct,
  sellerDashboard,
  setInventory,
  updateSeller,
} from "@/server/sellers";
import { uploadImage } from "@/server/uploads";
import { AppError } from "@/server/errors";
import { cookies } from "next/headers";
import { cart, setCartItem } from "@/server/cart";
import { checkout, listOrders, transitionOrder } from "@/server/orders";
import { testPayment } from "@/server/payments";
import {
  adminData,
  reviewSeller,
  moderateProduct,
  saveCategory,
  deleteCategory,
  updateCommission,
} from "@/server/admin";
import { requestReturn, reviewReturn } from "@/server/returns";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function route(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return handle(async () => {
    validateProduction();
    checkOrigin(req);
    const p = (await params).path;
    const method = req.method;
    const url = new URL(req.url);
    if (method === "GET" && p[0] === "demo-status") return demoStatus();
    if (method === "GET" && p[0] === "showcase") return showcase();
    if (method === "GET" && p[0] === "catalog")
      return catalog(url.searchParams);
    if (method === "GET" && p[0] === "products" && p.length === 2)
      return publicProduct(p[1]);
    if (method === "GET" && p[0] === "categories")
      return db.category.findMany({ orderBy: { name: "asc" } });
    if (method === "GET" && p[0] === "stores")
      return db.seller.findMany({
        where: { status: "ACTIVE", ...(p[1] ? { id: p[1] } : {}) },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          city: true,
          logoUrl: true,
          demoDataset: true,
          _count: { select: { products: { where: { status: "APPROVED" } } } },
        },
      });
    if (method === "GET" && p[0] === "session") {
      const user = await currentUser();
      return {
        user,
        memberships: user
          ? await db.sellerMembership.findMany({
              where: { userId: user.id },
              include: { seller: true },
            })
          : [],
        development: developmentEnabled(),
      };
    }
    if (method === "GET" && p[0] === "dev-users" && developmentEnabled())
      return db.user.findMany({
        where: {
          telegramId: { lt: 0 },
          OR: [
            { telegramId: { in: [-900n, -901n] } },
            { memberships: { some: { seller: { status: "ACTIVE" } } } },
          ],
        },
        select: { id: true, displayName: true, role: true },
        orderBy: [{ role: "asc" }, { displayName: "asc" }],
      });
    if (method === "POST" && p[0] === "auth") {
      await rateLimit(`auth:global`, 200);
      await rateLimit(
        `auth:${req.headers.get("x-forwarded-for")?.split(",")[0] || "local"}`,
        20,
      );
      const input = await body(req);
      const user =
        p[1] === "telegram"
          ? await telegramLogin(
              z.object({ initData: z.string() }).strict().parse(input).initData,
            )
          : p[1] === "dev"
            ? await devLogin(
                z.object({ id: z.string() }).strict().parse(input).id,
              )
            : null;
      if (!user) throw new AppError(404, "Не найдено");
      await createSession(user);
      return { user };
    }
    const user = await requireUser();
    if (method !== "GET") await rateLimit(`write:${user.id}`, 60);
    if (method === "POST" && p[0] === "logout") {
      const token = (await cookies()).get("wearo_session")?.value;
      if (token)
        await db.session.deleteMany({ where: { tokenHash: digest(token) } });
      (await cookies()).delete("wearo_session");
      return { ok: true };
    }
    if (p[0] === "seller-applications" && method === "POST")
      return applySeller(user, await body(req));
    if (p[0] === "cart" && method === "GET") return cart(user);
    if (p[0] === "cart" && method === "POST")
      return setCartItem(user, await body(req));
    if (p[0] === "checkout" && method === "POST") {
      await rateLimit(`checkout:${user.id}`, 10);
      return checkout(user, await body(req));
    }
    if (p[0] === "orders" && p.length === 1 && method === "GET")
      return listOrders(user);
    if (p[0] === "orders" && p.length === 2 && method === "PATCH")
      return transitionOrder(user, p[1], await body(req));
    if (
      p[0] === "payments" &&
      p[1] === "test" &&
      p.length === 3 &&
      method === "POST"
    ) {
      await rateLimit(`payment:${user.id}`, 10);
      return testPayment(user, p[2], await body(req));
    }
    if (p[0] === "returns" && p.length === 2 && method === "POST")
      return requestReturn(user, p[1], await body(req));
    if (p[0] === "admin") {
      if (method === "GET")
        return adminData(
          user,
          p[1] || "overview",
          z.coerce
            .number()
            .int()
            .min(1)
            .max(1000)
            .parse(url.searchParams.get("page") || 1),
        );
      if (p[1] === "sellers" && p[3] === "commission" && method === "PATCH")
        return updateCommission(user, p[2], await body(req));
      if (p[1] === "sellers" && p.length === 3 && method === "PATCH")
        return reviewSeller(user, p[2], await body(req));
      if (p[1] === "products" && method === "PATCH")
        return moderateProduct(user, p[2], await body(req));
      if (p[1] === "returns" && method === "PATCH")
        return reviewReturn(user, p[2], await body(req));
      if (p[1] === "categories" && (method === "POST" || method === "PATCH"))
        return saveCategory(user, await body(req), p[2]);
      if (p[1] === "categories" && method === "DELETE")
        return deleteCategory(user, p[2]);
    }
    if (p[0] === "sellers" && p.length >= 2) {
      const sellerId = p[1];
      if (p.length === 2 && method === "GET")
        return sellerDashboard(user, sellerId);
      if (p.length === 2 && method === "PATCH")
        return updateSeller(user, sellerId, await body(req));
      if (p[2] === "images" && method === "POST")
        return uploadImage(req, user, sellerId);
      if (p[2] === "orders" && p.length === 3 && method === "GET")
        return listOrders(user, sellerId);
      if (p[2] === "orders" && p.length === 4 && method === "PATCH")
        return transitionOrder(user, p[3], await body(req), sellerId);
      if (p[2] === "products" && method === "POST" && p.length === 3)
        return saveProduct(user, sellerId, await body(req));
      if (p[2] === "products" && method === "PATCH" && p.length === 4)
        return saveProduct(user, sellerId, await body(req), p[3]);
      if (p[2] === "products" && p[4] === "variants" && method === "POST")
        return addVariant(user, sellerId, p[3], await body(req));
      if (p[2] === "inventory" && method === "PATCH") {
        const input = z
          .object({ available: z.number().int() })
          .strict()
          .parse(await body(req));
        return setInventory(user, sellerId, p[3], input.available);
      }
      await requireSeller(user, sellerId);
    }
    if (p[0] === "favorites") {
      if (method === "GET")
        return db.favorite.findMany({
          where: {
            userId: user.id,
            product: { status: "APPROVED", seller: { status: "ACTIVE" } },
          },
          include: {
            product: {
              include: { images: true, seller: { select: { name: true } } },
            },
          },
        });
      if (method === "POST") {
        await publicProduct(p[1]);
        return db.favorite.upsert({
          where: { userId_productId: { userId: user.id, productId: p[1] } },
          create: { userId: user.id, productId: p[1] },
          update: {},
        });
      }
      if (method === "DELETE")
        return db.favorite.deleteMany({
          where: { userId: user.id, productId: p[1] },
        });
    }
    throw new AppError(404, "Не найдено");
  });
}
export { route as GET, route as POST, route as PATCH, route as DELETE };
