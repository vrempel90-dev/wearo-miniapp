import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { assert } from "./errors";
const filters = z.object({
  q: z.string().max(100).optional(),
  gender: z.enum(["WOMEN", "MEN"]).optional(),
  category: z.string().max(80).optional(),
  seller: z.string().max(80).optional(),
  brand: z.string().max(80).optional(),
  size: z.string().max(20).optional(),
  color: z.string().max(40).optional(),
  style: z.enum(["minimal", "street", "denim", "sport", "elegant"]).optional(),
  sale: z.enum(["true"]).optional(),
  photographed: z.enum(["true"]).optional(),
  min: z.coerce.number().int().min(0).max(100000000).optional(),
  max: z.coerce.number().int().min(0).max(100000000).optional(),
  sort: z
    .enum(["newest", "popular", "price_asc", "price_desc"])
    .default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export const productInclude = {
  seller: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      logoUrl: true,
      demoDataset: true,
    },
  },
  category: true,
  brand: true,
  images: { orderBy: { position: "asc" as const } },
  variants: { where: { active: true }, include: { inventory: true } },
};
export async function catalog(params: URLSearchParams) {
  const f = filters.parse(Object.fromEntries(params));
  const where: Prisma.ProductWhereInput = {
    status: "APPROVED",
    seller: { status: "ACTIVE" },
    priceMinor: { gte: f.min, lte: f.max },
  };
  if (f.gender) where.category = { gender: f.gender };
  if (f.category)
    where.AND = [
      {
        OR: [
          { categoryId: f.category },
          { category: { parentId: f.category } },
        ],
      },
    ];
  if (f.seller) where.sellerId = f.seller;
  if (f.style) where.styleTag = f.style;
  if (f.sale) where.discountPercent = { not: null };
  if (f.photographed) where.images = { some: {} };
  if (f.brand) where.brand = { name: { equals: f.brand, mode: "insensitive" } };
  if (f.q)
    where.OR = [
      { title: { contains: f.q, mode: "insensitive" } },
      { description: { contains: f.q, mode: "insensitive" } },
      { brand: { name: { contains: f.q, mode: "insensitive" } } },
      { seller: { name: { contains: f.q, mode: "insensitive" } } },
      { variants: { some: { sku: { contains: f.q, mode: "insensitive" } } } },
    ];
  if (f.size || f.color)
    where.variants = {
      some: {
        active: true,
        size: f.size,
        color: f.color,
        inventory: { available: { gt: 0 } },
      },
    };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    f.sort === "price_asc"
      ? [{ priceMinor: "asc" }, { id: "asc" }]
      : f.sort === "price_desc"
        ? [{ priceMinor: "desc" }, { id: "asc" }]
        : f.sort === "popular"
          ? [{ favorites: { _count: "desc" } }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }, { id: "asc" }];
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: productInclude,
      orderBy,
      take: 24,
      skip: (f.page - 1) * 24,
    }),
    db.product.count({ where }),
  ]);
  return { products, total, page: f.page };
}
export async function demoStatus() {
  const where = {
    demoDataset: "wearo-fashion-v1",
    status: "APPROVED" as const,
    seller: { status: "ACTIVE" as const },
  };
  const [products, sellers, photographed] = await Promise.all([
    db.product.count({ where }),
    db.seller.count({
      where: { demoDataset: "wearo-fashion-v1", status: "ACTIVE" },
    }),
    db.product.count({ where: { ...where, images: { some: {} } } }),
  ]);
  return {
    enabled: products > 0,
    products,
    sellers,
    photographed,
    missingPhotos: products - photographed,
  };
}
export async function showcase() {
  const base: Prisma.ProductWhereInput = {
    status: "APPROVED",
    seller: { status: "ACTIVE" },
    images: { some: {} },
  };
  const pick = async (extra: Prisma.ProductWhereInput, selection: string[]) => {
    const selected = await db.product.findMany({
      where: {
        ...base,
        ...extra,
        id: { in: selection.map((serial) => `wearo-demo-${serial}`) },
      },
      include: productInclude,
      take: 4,
    });
    if (selected.length)
      return selected.sort(
        (a, b) =>
          selection.indexOf(a.id.slice(-3)) - selection.indexOf(b.id.slice(-3)),
      );
    return db.product.findMany({
      where: { ...base, ...extra },
      include: productInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      distinct: ["categoryId"],
      take: 4,
    });
  };
  const [newest, women, men, shoes, sale] = await Promise.all([
    pick({}, ["001", "106", "151", "251"]),
    pick({ category: { gender: "WOMEN" } }, ["001", "106", "066", "221"]),
    pick({ category: { gender: "MEN" } }, ["281", "376", "356", "401"]),
    pick({ category: { parent: { slug: { endsWith: "-shoes" } } } }, [
      "151",
      "221",
      "401",
      "461",
    ]),
    pick({ discountPercent: { not: null } }, ["012", "112", "284", "404"]),
  ]);
  return { newest, women, men, shoes, sale };
}
export async function publicProduct(id: string) {
  const product = await db.product.findFirst({
    where: { id, status: "APPROVED", seller: { status: "ACTIVE" } },
    include: productInclude,
  });
  assert(product, 404, "Товар не найден");
  return product;
}
