"use client";
import { useEffect, useState, FormEvent, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Search,
  Heart,
  ShoppingBag,
  UserRound,
  ArrowLeft,
  SlidersHorizontal,
  Shirt,
  Menu,
  X,
  Plus,
} from "lucide-react";
type User = { id: string; displayName: string; role: string };
type Seller = {
  id: string;
  name: string;
  slug: string;
  city: string;
  description: string;
  status: string;
  commissionBps: number;
  logoUrl?: string | null;
  demoDataset?: string | null;
  _count?: { products: number };
};
type Category = {
  id: string;
  name: string;
  gender: string;
  parentId: string | null;
};
type Variant = {
  id: string;
  sku: string;
  size: string;
  color: string;
  inventory: { available: number; reserved: number };
};
type Image = { id: string; url: string };
type Product = {
  id: string;
  title: string;
  description: string;
  priceMinor: number;
  oldPriceMinor?: number | null;
  discountPercent?: number | null;
  demoDataset?: string | null;
  styleTag?: string | null;
  status: string;
  categoryId: string;
  brand?: { name: string } | null;
  seller: Seller;
  images: Image[];
  variants: Variant[];
};
type Session = {
  user: User | null;
  memberships: { seller: Seller }[];
  development: boolean;
};
export const money = (minor: number) =>
  new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const statusLabel: Record<string, string> = {
  PENDING: "На проверке / ожидает",
  ACTIVE: "Активен",
  BLOCKED: "Заблокирован",
  REJECTED: "Отклонён",
  APPROVED: "Опубликован",
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждён",
  PROCESSING: "Собирается",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  CANCELLED: "Отменён",
  RETURN_REQUESTED: "Запрошен возврат",
  RETURNED: "Возвращён",
  TEST_SUCCEEDED: "Тестовая оплата",
  PAID: "Оплачен",
  TEST_REFUNDED: "Тестовый возврат",
  REFUNDED: "Возврат выполнен",
  REQUESTED: "Запрошен",
  RECEIVED: "Получен",
};
export async function api<T = unknown>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers:
      data instanceof FormData
        ? {}
        : data === undefined
          ? {}
          : { "Content-Type": "application/json" },
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Ошибка запроса");
  return result;
}
export function useData<T>(path: string | null) {
  const [stored, setStored] = useState<{ path: string; value: T } | null>(null);
  const [failure, setFailure] = useState<{
    path: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailure(null);
    api<T>(path)
      .then((value) => {
        if (alive) setStored({ path, value });
      })
      .catch((e) => {
        if (alive) setFailure({ path, message: e.message });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return {
    data: stored?.path === path ? stored.value : null,
    error: failure?.path === path ? failure.message : "",
    loading,
    reload: () => setVersion((v) => v + 1),
  };
}
export function State({
  loading,
  error,
  empty,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
}) {
  return loading ? (
    <p className="notice">Загрузка…</p>
  ) : error ? (
    <p role="alert" className="notice error">
      {error}
    </p>
  ) : empty ? (
    <p className="notice">Здесь пока ничего нет.</p>
  ) : null;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Action({
  run,
  children,
  className = "button",
  onDone,
}: {
  run: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <span className="action">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            await run();
            setMessage("Сохранено");
            onDone?.();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Подождите…" : children}
      </button>
      {message && <small role="status">{message}</small>}
    </span>
  );
}
export function ProductCard({ product: p }: { product: Product }) {
  const [chosen, setChosen] = useState("");
  const [failedImage, setFailedImage] = useState(false);
  const available = p.variants.filter((v) => v.inventory.available > 0);
  return (
    <article className="product-card">
      <Link href={`/product/${p.id}`}>
        <div className="product-photo">
          {p.images[0] && !failedImage ? (
            <img
              src={p.images[0].url}
              alt={p.title}
              loading="lazy"
              width="900"
              height="1200"
              onError={() => setFailedImage(true)}
            />
          ) : (
            <div className="missing-photo">
              <Shirt size={62} strokeWidth={0.7} />
              <small>Фото ещё не добавлено</small>
            </div>
          )}
          {p.discountPercent && (
            <span className="discount-tag">−{p.discountPercent}% · демо</span>
          )}
          <span className="photo-tag">
            {p.brand?.name || "Независимый бренд"}
          </span>
          <span className="photo-arrow">
            <ArrowUpRight size={20} />
          </span>
        </div>
        <p className="eyebrow">{p.seller.name}</p>
        <h3>{p.title}</h3>
        <p className="product-price">
          {money(p.priceMinor)}{" "}
          {p.oldPriceMinor && <del>{money(p.oldPriceMinor)}</del>}
        </p>
      </Link>
      <p className="available-sizes">
        Размеры:{" "}
        {[...new Set(available.map((v) => v.size))].join(" · ") ||
          "Нет в наличии"}
      </p>
      <select
        aria-label={`Размер и цвет: ${p.title}`}
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
      >
        <option value="">Размер / цвет</option>
        {available.map((v) => (
          <option key={v.id} value={v.id}>
            {v.size} / {v.color}
          </option>
        ))}
      </select>
      {chosen ? (
        <Action
          className="button card-cart"
          run={async () => {
            const basket = await api<{
              items: { quantity: number; variant: { id: string } }[];
            }>("cart");
            const quantity =
              (basket.items.find((i) => i.variant.id === chosen)?.quantity ??
                0) + 1;
            return api("cart", "POST", { variantId: chosen, quantity });
          }}
        >
          В корзину <ShoppingBag size={15} />
        </Action>
      ) : (
        <button className="card-cart choose-size" disabled>
          Выберите размер
        </button>
      )}
    </article>
  );
}
function Catalog() {
  const [gender, setGender] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [category, setCategory] = useState("");
  const [seller, setSeller] = useState("");
  const [filters, setFilters] = useState(false);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [page, setPage] = useState(1);
  const [style, setStyle] = useState("");
  const [sale, setSale] = useState(false);
  const [photographed, setPhotographed] = useState(false);
  const query = new URLSearchParams({
    q: search,
    sort,
    page: String(page),
  });
  for (const [k, v] of Object.entries({
    category,
    gender,
    style,
    sale: sale ? "true" : "",
    photographed: photographed ? "true" : "",
    seller,
    size,
    color,
    brand,
    min: min ? String(Number(min) * 100) : "",
    max: max ? String(Number(max) * 100) : "",
  }))
    if (v) query.set(k, v);
  const products = useData<{ products: Product[]; total: number }>(
    `catalog?${query}`,
  );
  const categories = useData<Category[]>("categories");
  const stores = useData<Seller[]>("stores");
  const curated = useData<Record<string, Product[]>>("showcase");
  const demo = useData<{
    products: number;
    sellers: number;
    photographed: number;
    missingPhotos: number;
  }>("demo-status");
  return (
    <>
      <div className="gender-tabs">
        <button
          className={!gender ? "selected" : ""}
          onClick={() => {
            setGender("");
            setCategory("");
            setPage(1);
          }}
        >
          Все
        </button>
        <button
          className={gender === "WOMEN" ? "selected" : ""}
          onClick={() => {
            setGender("WOMEN");
            setCategory("");
            setPage(1);
          }}
        >
          Женщина
        </button>
        <button
          className={gender === "MEN" ? "selected" : ""}
          onClick={() => {
            setGender("MEN");
            setCategory("");
            setPage(1);
          }}
        >
          Мужчина
        </button>
      </div>
      <section className="hero">
        <div>
          <span className="eyebrow">WEARO / НОВЫЙ СЕЗОН</span>
          <h1>
            Твой стиль.
            <br />
            <i>Твой выбор.</i>
          </h1>
          <p>
            Вымышленные магазины. Настоящий выбор стиля.
            <br />
            Новые сочетания каждый день.
          </p>
          <a href="#catalog" className="button">
            Смотреть коллекцию <ArrowUpRight size={18} />
          </a>
        </div>
        <div className="hero-art hero-product" aria-hidden="true">
          <img src="/demo/products/001.jpg" alt="" />
          <span className="art-caption">THE EVERYDAY EDIT / DEMO</span>
        </div>
      </section>
      {demo.data && (
        <div className="catalog-summary">
          <strong>
            {demo.data.products} товаров · {demo.data.sellers} магазинов
          </strong>
          <span>Цены и остатки вымышлены</span>
          {demo.data.missingPhotos > 0 && (
            <span className="photo-progress">
              Фотографии: {demo.data.photographed} из {demo.data.products}.
              Визуальное наполнение ещё не завершено.
            </span>
          )}
        </div>
      )}
      <div className="showcase-sections">
        {[
          ["newest", "Новые поступления"],
          ["women", "Женская коллекция"],
          ["men", "Мужская коллекция"],
          ["shoes", "Популярная обувь"],
          ["sale", "Товары со скидками"],
        ].map(([key, title]) => (
          <section key={key}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  {key === "shoes"
                    ? "ДЕМОНСТРАЦИОННАЯ ПОДБОРКА / БЕЗ СТАТИСТИКИ ПРОДАЖ"
                    : "WEARO SELECT / DEMO"}
                </span>
                <h2>{title}</h2>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setGender(
                    key === "women" ? "WOMEN" : key === "men" ? "MEN" : "",
                  );
                  setCategory("");
                  setSeller("");
                  setSale(key === "sale");
                  setStyle("");
                  setPage(1);
                  document
                    .getElementById("catalog")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                В каталог <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="product-grid">
              {curated.data?.[key]?.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <State
              loading={curated.loading}
              error={curated.error}
              empty={curated.data?.[key]?.length === 0}
            />
          </section>
        ))}
      </div>
      <section className="style-section">
        <div className="section-heading">
          <h2>Подборки по стилю</h2>
          <span className="eyebrow">СОБЕРИ СВОЙ ГАРДЕРОБ</span>
        </div>
        <div className="style-grid">
          {[
            [
              "minimal",
              "Чистые линии",
              "Спокойная база для каждого дня",
              "011",
            ],
            [
              "denim",
              "Деним и город",
              "Свободные формы, знакомая фактура",
              "066",
            ],
            ["elegant", "Особый момент", "Силуэты с мягким характером", "106"],
            ["street", "Ритм улиц", "Объём и повседневный комфорт", "036"],
          ].map(([value, title, text, image]) => (
            <button
              key={value}
              className={`style-card style-${value}`}
              onClick={() => {
                setStyle(value);
                setGender("");
                setCategory("");
                setSeller("");
                setSale(false);
                setPage(1);
                document
                  .getElementById("catalog")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <img src={`/demo/products/${image}.jpg`} alt="" loading="lazy" />
              <div>
                <span className="eyebrow">STYLE EDIT / DEMO</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <ArrowUpRight />
            </button>
          ))}
        </div>
      </section>
      <div className="category-row">
        {categories.data
          ?.filter((c) => (!gender || c.gender === gender) && !c.parentId)
          .map((c) => (
            <button
              className={category === c.id ? "selected" : ""}
              key={c.id}
              onClick={() => {
                setCategory(category === c.id ? "" : c.id);
                setPage(1);
              }}
            >
              {!gender
                ? `${c.gender === "WOMEN" ? "Женская" : "Мужская"} `
                : ""}
              {c.name}
              <ArrowUpRight size={17} />
            </button>
          ))}
      </div>
      <section id="catalog">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ГАРДЕРОБ БЕЗ ГРАНИЦ</span>
            <h2>
              Каталог{" "}
              <small className="catalog-count">
                {products.data?.total ?? "…"}
              </small>
            </h2>
          </div>
          <button className="text-button" onClick={() => setFilters(!filters)}>
            <SlidersHorizontal size={16} /> Фильтры
          </button>
        </div>
        <div className="search-row">
          <form
            className="search-input"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
              setPage(1);
            }}
          >
            <Search size={18} />
            <input
              aria-label="Поиск товаров"
              placeholder="Куртка, кроссовки, любимый бренд…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button>Найти</button>
          </form>
          <select
            aria-label="Сортировка"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Сначала новинки</option>
            <option value="popular">По добавлениям в избранное</option>
            <option value="price_asc">Цена по возрастанию</option>
            <option value="price_desc">Цена по убыванию</option>
          </select>
        </div>
        {filters && (
          <div className="filters">
            <Field label="Магазин">
              <select
                value={seller}
                onChange={(e) => {
                  setSeller(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все магазины</option>
                {stores.data?.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Категория">
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все категории</option>
                {categories.data
                  ?.filter((c) => !gender || c.gender === gender)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.gender === "WOMEN" ? "Ж" : "М"} / {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            {[
              ["Размер", size, setSize],
              ["Цвет", color, setColor],
              ["Бренд", brand, setBrand],
              ["От ₸", min, setMin],
              ["До ₸", max, setMax],
            ].map(([label, value, setter]) => (
              <Field label={label as string} key={label as string}>
                <input
                  value={value as string}
                  onChange={(e) => {
                    (setter as (v: string) => void)(e.target.value);
                    setPage(1);
                  }}
                />
              </Field>
            ))}
            <Field label="Стиль">
              <select
                value={style}
                onChange={(e) => {
                  setStyle(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все стили</option>
                <option value="minimal">Минимализм</option>
                <option value="street">Уличный</option>
                <option value="denim">Деним</option>
                <option value="sport">Спортивный</option>
                <option value="elegant">Элегантный</option>
              </select>
            </Field>
            <label className="check-filter">
              <input
                type="checkbox"
                checked={sale}
                onChange={(e) => {
                  setSale(e.target.checked);
                  setPage(1);
                }}
              />
              Со скидкой
            </label>
            <label className="check-filter">
              <input
                type="checkbox"
                checked={photographed}
                onChange={(e) => {
                  setPhotographed(e.target.checked);
                  setPage(1);
                }}
              />
              Только с фото
            </label>
            <button
              className="text-button"
              onClick={() => {
                setSeller("");
                setCategory("");
                setSize("");
                setColor("");
                setBrand("");
                setMin("");
                setMax("");
                setStyle("");
                setSale(false);
                setPhotographed(false);
                setPage(1);
              }}
            >
              Сбросить фильтры
            </button>
          </div>
        )}
        <State
          loading={products.loading}
          error={products.error}
          empty={products.data?.products.length === 0}
        />
        <div className="product-grid">
          {products.data?.products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        {(products.data?.total ?? 0) > 24 && (
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Назад
            </button>
            <span>
              {page} / {Math.ceil((products.data?.total ?? 0) / 24)}
            </span>
            <button
              disabled={page * 24 >= (products.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Далее
            </button>
          </div>
        )}
      </section>
      <section>
        <div className="section-heading">
          <h2>Рекомендуемые магазины</h2>
          <span className="eyebrow">НЕЗАВИСИМЫЕ. РАЗНЫЕ. ТВОИ.</span>
        </div>
        <State
          loading={stores.loading}
          error={stores.error}
          empty={stores.data?.length === 0}
        />
        <div className="store-grid">
          {stores.data?.map((s) => (
            <Link className="store-card" key={s.id} href={`/store/${s.id}`}>
              {s.logoUrl ? (
                <img
                  className="store-logo"
                  src={s.logoUrl}
                  alt={`Логотип ${s.name}`}
                  loading="lazy"
                />
              ) : (
                <span className="store-letter">{s.name[0]}</span>
              )}
              <h3>{s.name}</h3>
              <p>
                {s.city} · {s._count?.products ?? 0} товаров
                {s.demoDataset && " · Вымышленный магазин"}
              </p>
              <ArrowUpRight size={20} />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
function ProductDetail({ id }: { id: string }) {
  const result = useData<Product>(`products/${id}`);
  const [variant, setVariant] = useState("");
  const p = result.data;
  if (!p) return <State loading={result.loading} error={result.error} />;
  return (
    <section className="detail">
      <div className="detail-photo">
        {p.images.length ? (
          p.images.map((i) => <img key={i.id} src={i.url} alt={p.title} />)
        ) : (
          <Shirt size={160} strokeWidth={0.5} />
        )}
      </div>
      <div>
        <p className="eyebrow">
          {p.seller.name} / {p.brand?.name || "WEARO SELECT"}
        </p>
        <h1>{p.title}</h1>
        <h2 className="product-price">
          {money(p.priceMinor)}{" "}
          {p.oldPriceMinor && <del>{money(p.oldPriceMinor)}</del>}
        </h2>
        {p.discountPercent && (
          <p className="badge">Демонстрационная скидка {p.discountPercent}%</p>
        )}
        {p.demoDataset && (
          <p className="notice">
            Демонстрационный товар.{" "}
            {p.images.length
              ? "Фото сгенерировано; основной цвет показан на снимке."
              : "Фотография ещё не добавлена."}
          </p>
        )}
        <p>{p.description}</p>
        <div className="variant-list">
          {p.variants.map((v) => (
            <button
              disabled={v.inventory.available === 0}
              className={variant === v.id ? "selected" : ""}
              key={v.id}
              onClick={() => setVariant(v.id)}
            >
              {v.size} / {v.color}
              <small>
                {v.inventory.available > 0
                  ? `${p.demoDataset ? "Демо-остаток" : "В наличии"}: ${v.inventory.available}`
                  : "Нет в наличии"}
              </small>
            </button>
          ))}
        </div>
        {variant && (
          <Action
            run={() => api("cart", "POST", { variantId: variant, quantity: 1 })}
          >
            В корзину <ShoppingBag size={18} />
          </Action>
        )}
        <Action
          className="text-button"
          run={() => api(`favorites/${p.id}`, "POST")}
        >
          <Heart size={17} /> В избранное
        </Action>
        <p className="muted">
          {p.demoDataset
            ? "Вымышленный продавец; тестовый заказ без доставки"
            : "Продажа и исполнение заказа"}
          : <Link href={`/store/${p.seller.id}`}>{p.seller.name}</Link>,{" "}
          {p.seller.city}.
        </p>
      </div>
    </section>
  );
}
function Storefront({ id }: { id: string }) {
  const stores = useData<Seller[]>(`stores/${id}`);
  const [page, setPage] = useState(1);
  const products = useData<{ products: Product[]; total: number }>(
    `catalog?seller=${id}&page=${page}`,
  );
  const s = stores.data?.[0];
  if (!s)
    return (
      <State
        loading={stores.loading}
        error={stores.error}
        empty={!!stores.data}
      />
    );
  return (
    <section>
      <div className="store-profile">
        {s.logoUrl && (
          <img
            className="store-logo"
            src={s.logoUrl}
            alt={`Логотип ${s.name}`}
          />
        )}
        <div>
          <span className="eyebrow">
            {s.demoDataset ? "ВЫМЫШЛЕННЫЙ МАГАЗИН / DEMO" : "МАГАЗИН НА WEARO"}
          </span>
          <h1>{s.name}</h1>
          <p>{s.description}</p>
          <p>
            {s.city} · {s._count?.products} товаров
          </p>
        </div>
      </div>
      <State
        loading={products.loading}
        error={products.error}
        empty={products.data?.total === 0}
      />
      <div className="product-grid">
        {products.data?.products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {(products.data?.total ?? 0) > 24 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span>
            {page} / {Math.ceil((products.data?.total ?? 0) / 24)}
          </span>
          <button
            disabled={page * 24 >= (products.data?.total ?? 0)}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </button>
        </div>
      )}
    </section>
  );
}
function Account({
  session,
  reload,
}: {
  session: Session;
  reload: () => void;
}) {
  const test = useData<User[]>(session.development ? "dev-users" : null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h1>Личный кабинет</h1>
      {session.user ? (
        <>
          <p>{session.user.displayName}</p>
          <p className="muted">
            {session.user.role === "ADMIN"
              ? "Администратор"
              : session.user.role === "SELLER"
                ? "Продавец"
                : "Покупатель"}
          </p>
          <Link className="button" href="/orders">
            Мои заказы
          </Link>
          <Action
            className="text-button"
            run={() => api("logout", "POST")}
            onDone={reload}
          >
            Выйти
          </Action>
        </>
      ) : (
        <p className="notice">
          Откройте WEARO через Telegram-бота, чтобы войти.
        </p>
      )}
      {session.development && (
        <div className="panel">
          <p className="eyebrow">ЛОКАЛЬНЫЙ ТЕСТОВЫЙ РЕЖИМ</p>
          <p>
            Демонстрационные профили и оплаты. Денежные операции не выполняются.
          </p>
          {test.data?.map((u) => (
            <Action
              key={u.id}
              run={() => api("auth/dev", "POST", { id: u.id })}
              onDone={reload}
            >
              {u.displayName}
            </Action>
          ))}
        </div>
      )}
      {session.user && session.memberships.length === 0 && (
        <div className="panel">
          <h2>Открыть магазин на WEARO</h2>
          <form
            className="form-grid"
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setMessage("");
              try {
                await api("seller-applications", "POST", Object.fromEntries(f));
                setMessage(
                  "Заявка отправлена. Дождитесь одобрения администратора.",
                );
                reload();
              } catch (err) {
                setMessage((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {[
              ["name", "Название магазина"],
              ["slug", "Адрес магазина (латиницей)"],
              ["city", "Город"],
              ["contact", "Контакт для подключения"],
              ["description", "Описание"],
            ].map(([name, label]) => (
              <Field label={label} key={name}>
                <input required name={name} />
              </Field>
            ))}
            <button className="button" disabled={busy}>
              {busy ? "Отправка…" : "Подать заявку"}
            </button>
            {message && <p role="status">{message}</p>}
          </form>
        </div>
      )}
      {session.memberships.map((m) => (
        <div className="panel" key={m.seller.id}>
          <h2>{m.seller.name}</h2>
          <span className="badge">{statusLabel[m.seller.status]}</span>
          {m.seller.status === "ACTIVE" && (
            <Link className="button" href="/seller">
              Управлять магазином
            </Link>
          )}
        </div>
      ))}
    </section>
  );
}
type Dashboard = {
  seller: Seller;
  products: Product[];
  orders: unknown[];
  images: Image[];
  stats: {
    realSalesCount: number;
    realRevenueMinor: number;
    testOrders: number;
  };
};
function ProductForm({
  sellerId,
  product,
  onDone,
}: {
  sellerId: string;
  product?: Product;
  onDone: () => void;
}) {
  const categories = useData<Category[]>("categories");
  const [images, setImages] = useState<Image[]>(product?.images || []);
  const [variants, setVariants] = useState([
    { sku: "", size: "M", color: "Чёрный", available: 0 },
  ]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        const f = new FormData(e.currentTarget);
        const data = {
          title: f.get("title"),
          description: f.get("description"),
          priceMinor: Math.round(Number(f.get("price")) * 100),
          categoryId: f.get("categoryId"),
          brand: f.get("brand"),
          imageIds: images.map((i) => i.id),
          ...(product ? {} : { variants }),
        };
        try {
          await api(
            `sellers/${sellerId}/products${product ? `/${product.id}` : ""}`,
            product ? "PATCH" : "POST",
            data,
          );
          onDone();
        } catch (err) {
          setMessage((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Название">
        <input
          name="title"
          defaultValue={product?.title}
          required
          minLength={3}
          maxLength={160}
        />
      </Field>
      <Field label="Цена ₸">
        <input
          name="price"
          type="number"
          min="0.01"
          max="1000000"
          step="0.01"
          defaultValue={product ? product.priceMinor / 100 : undefined}
          required
        />
      </Field>
      <Field label="Категория">
        <select name="categoryId" defaultValue={product?.categoryId} required>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.gender === "WOMEN" ? "Женщина" : "Мужчина"} / {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Бренд">
        <input
          name="brand"
          defaultValue={product?.brand?.name || ""}
          maxLength={80}
        />
      </Field>
      <Field label="Описание">
        <textarea
          name="description"
          defaultValue={product?.description}
          required
          minLength={10}
          maxLength={5000}
        />
      </Field>
      <Field label="Фотографии (JPEG, PNG, WebP, до 5 МБ)">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || images.length >= 8}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const data = new FormData();
              data.set("file", file);
              const image = await api<Image>(
                `sellers/${sellerId}/images`,
                "POST",
                data,
              );
              setImages([...images, image]);
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      <div className="image-list">
        {images.map((i) => (
          <button
            type="button"
            key={i.id}
            onClick={() => setImages(images.filter((x) => x.id !== i.id))}
          >
            <img src={i.url} alt="Фото товара" />
            <X size={14} />
          </button>
        ))}
      </div>
      {!product && (
        <div className="full-width">
          <h3>Размеры и цвета</h3>
          {variants.map((v, i) => (
            <div className="variant-row" key={i}>
              {(["sku", "size", "color", "available"] as const).map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      sku: "SKU",
                      size: "Размер",
                      color: "Цвет",
                      available: "Остаток",
                    }[k]
                  }
                >
                  <input
                    required
                    type={k === "available" ? "number" : "text"}
                    min={0}
                    value={v[k]}
                    onChange={(e) =>
                      setVariants(
                        variants.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                [k]:
                                  k === "available"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setVariants(variants.filter((_, j) => j !== i))
                  }
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setVariants([
                ...variants,
                { sku: "", size: "L", color: "Чёрный", available: 0 },
              ])
            }
          >
            <Plus size={16} /> Добавить вариант
          </button>
        </div>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Сохранение…" : "Отправить на модерацию"}
      </button>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
function SellerPanel({ session }: { session: Session }) {
  const sellerId = session.memberships.find((m) => m.seller.status === "ACTIVE")
    ?.seller.id;
  const result = useData<Dashboard>(sellerId ? `sellers/${sellerId}` : null);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [profile, setProfile] = useState(false);
  if (!sellerId)
    return (
      <p className="notice">
        Нужен одобренный магазин. <Link href="/account">Подать заявку</Link>
      </p>
    );
  const d = result.data;
  return (
    <section>
      <div className="section-heading">
        <h1>{d?.seller.name || "Магазин"}</h1>
        <button className="button" onClick={() => setEditing(null)}>
          Добавить товар <Plus size={16} />
        </button>
      </div>
      <State loading={result.loading} error={result.error} />
      {d && (
        <>
          <div className="stats">
            <div>
              <small>Реальные продажи</small>
              <strong>{d.stats.realSalesCount}</strong>
            </div>
            <div>
              <small>Реальная выручка</small>
              <strong>{money(d.stats.realRevenueMinor)}</strong>
            </div>
            <div>
              <small>Комиссия магазина</small>
              <strong>{d.seller.commissionBps / 100}%</strong>
            </div>
            <div>
              <small>Тестовые заказы</small>
              <strong>{d.stats.testOrders}</strong>
            </div>
          </div>
          <button className="text-button" onClick={() => setProfile(!profile)}>
            Редактировать магазин
          </button>
          {profile && (
            <form
              className="form-grid panel"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await api(
                    `sellers/${sellerId}`,
                    "PATCH",
                    Object.fromEntries(f),
                  );
                  result.reload();
                  setProfile(false);
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            >
              {(["name", "city", "description"] as const).map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      name: "Название",
                      city: "Город",
                      description: "Описание",
                    }[k]
                  }
                >
                  <input name={k} defaultValue={d.seller[k]} required />
                </Field>
              ))}
              <button className="button">Сохранить</button>
            </form>
          )}
          {editing !== undefined && (
            <div className="panel">
              <div className="section-heading">
                <h2>{editing ? "Редактировать товар" : "Новый товар"}</h2>
                <button
                  onClick={() => setEditing(undefined)}
                  aria-label="Закрыть форму"
                >
                  <X />
                </button>
              </div>
              <ProductForm
                key={editing?.id || "new"}
                sellerId={sellerId}
                product={editing || undefined}
                onDone={() => {
                  setEditing(undefined);
                  result.reload();
                }}
              />
            </div>
          )}
          <h2>Товары и остатки</h2>
          <State empty={d.products.length === 0} />
          {d.products.map((p) => (
            <div className="panel" key={p.id}>
              <div className="section-heading">
                <h3>
                  {p.title} · {money(p.priceMinor)}
                </h3>
                <span className="badge">{statusLabel[p.status]}</span>
                <button className="text-button" onClick={() => setEditing(p)}>
                  Редактировать
                </button>
              </div>
              {p.variants.map((v) => (
                <div className="stock-row" key={v.id}>
                  <span>
                    {v.sku} / {v.size} / {v.color}
                  </span>
                  <span>Резерв: {v.inventory.reserved}</span>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      try {
                        await api(
                          `sellers/${sellerId}/inventory/${v.id}`,
                          "PATCH",
                          { available: Number(f.get("available")) },
                        );
                        result.reload();
                      } catch (err) {
                        alert((err as Error).message);
                      }
                    }}
                  >
                    <input
                      aria-label={`Доступный остаток ${v.size}`}
                      name="available"
                      type="number"
                      min={0}
                      max={100000}
                      defaultValue={v.inventory.available}
                    />
                    <button>Сохранить</button>
                  </form>
                </div>
              ))}
              <details>
                <summary>Добавить размер / цвет</summary>
                <form
                  className="variant-row"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      await api(
                        `sellers/${sellerId}/products/${p.id}/variants`,
                        "POST",
                        {
                          ...Object.fromEntries(f),
                          available: Number(f.get("available")),
                        },
                      );
                      result.reload();
                    } catch (err) {
                      alert((err as Error).message);
                    }
                  }}
                >
                  {[
                    ["sku", "SKU"],
                    ["size", "Размер"],
                    ["color", "Цвет"],
                    ["available", "Остаток"],
                  ].map(([k, label]) => (
                    <Field key={k} label={label}>
                      <input
                        name={k}
                        type={k === "available" ? "number" : "text"}
                        required
                      />
                    </Field>
                  ))}
                  <button>Добавить</button>
                </form>
              </details>
            </div>
          ))}
          <SellerOrders sellerId={sellerId} />
        </>
      )}
    </section>
  );
}
function SellerOrders({ sellerId }: { sellerId: string }) {
  return <Orders sellerId={sellerId} />;
}
function Favorites() {
  const result = useData<{ product: Product }[]>("favorites");
  return (
    <section>
      <h1>Избранное</h1>
      <State
        loading={result.loading}
        error={result.error}
        empty={result.data?.length === 0}
      />
      <div className="product-grid">
        {result.data?.map((f) => (
          <div key={f.product.id}>
            <ProductCard product={f.product} />
            <Action
              className="text-button"
              run={() => api(`favorites/${f.product.id}`, "DELETE")}
              onDone={result.reload}
            >
              Убрать из избранного
            </Action>
          </div>
        ))}
      </div>
    </section>
  );
}
export default function Marketplace() {
  const demo = useData<{ enabled: boolean }>("demo-status");
  const pathname = usePathname();
  const router = useRouter();
  const session = useData<Session>("session");
  const [menu, setMenu] = useState(false);
  const [telegramError, setTelegramError] = useState("");
  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    import("@twa-dev/sdk")
      .then(async ({ default: webapp }) => {
        if (!alive || !webapp.initData) return;
        webapp.ready();
        webapp.expand();
        webapp.setHeaderColor("bg_color");
        const back = () => router.back();
        webapp.BackButton.onClick(back);
        if (pathname !== "/") webapp.BackButton.show();
        else webapp.BackButton.hide();
        const applyTheme = () => {
          const root = document.documentElement;
          root.dataset.telegram = "true";
          root.dataset.telegramTheme = webapp.colorScheme;
          for (const [k, v] of Object.entries(webapp.themeParams))
            if (v) root.style.setProperty(`--tg-${k}`, v);
          for (const side of ["top", "bottom", "left", "right"] as const)
            root.style.setProperty(
              `--tg-safe-${side}`,
              `${Math.max(webapp.safeAreaInset?.[side] ?? 0, webapp.contentSafeAreaInset?.[side] ?? 0)}px`,
            );
        };
        applyTheme();
        webapp.onEvent("themeChanged", applyTheme);
        webapp.onEvent("safeAreaChanged", applyTheme);
        webapp.onEvent("contentSafeAreaChanged", applyTheme);
        cleanup = () => {
          webapp.BackButton.offClick(back);
          webapp.offEvent("themeChanged", applyTheme);
          webapp.offEvent("safeAreaChanged", applyTheme);
          webapp.offEvent("contentSafeAreaChanged", applyTheme);
        };
        const current = await api<Session>("session");
        if (!current.user) {
          try {
            await api("auth/telegram", "POST", { initData: webapp.initData });
            if (alive) session.reload();
          } catch (e) {
            if (alive) setTelegramError((e as Error).message);
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      cleanup();
    };
  }, [pathname]);
  const user = session.data?.user;
  const links = [
    ["/", "Каталог"],
    ["/favorites", "Избранное"],
    ["/cart", "Корзина"],
    ["/account", "Кабинет"],
    ...(session.data?.memberships.some((m) => m.seller.status === "ACTIVE")
      ? [["/seller", "Мой магазин"]]
      : []),
    ...(user?.role === "ADMIN" ? [["/admin", "Администрирование"]] : []),
  ];
  const view =
    pathname === "/" ? (
      <Catalog />
    ) : pathname.startsWith("/product/") ? (
      <ProductDetail id={pathname.split("/")[2]} />
    ) : pathname.startsWith("/store/") ? (
      <Storefront id={pathname.split("/")[2]} />
    ) : pathname === "/account" ? (
      session.data ? (
        <Account session={session.data} reload={session.reload} />
      ) : (
        <State loading={session.loading} error={session.error} />
      )
    ) : pathname === "/seller" ? (
      session.data ? (
        <SellerPanel session={session.data} />
      ) : (
        <State loading={session.loading} error={session.error} />
      )
    ) : pathname === "/favorites" ? (
      <Favorites />
    ) : (
      <FuturePanel pathname={pathname} session={session.data} />
    );
  return (
    <>
      <div className="top-note">
        {demo.data?.enabled
          ? "Демонстрационный каталог — заказы и оплата тестовые"
          : "Казахстан / независимые магазины / цены в ₸"}
      </div>
      <header>
        <Link href="/" className="logo">
          WEARO<span>MARKETPLACE</span>
        </Link>
        <nav className={menu ? "open" : ""}>
          {links.map(([href, label]) => (
            <Link
              href={href}
              key={href}
              onClick={() => setMenu(false)}
              className={pathname === href ? "active" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/favorites" aria-label="Избранное">
            <Heart size={20} />
          </Link>
          <Link href="/cart" aria-label="Корзина">
            <ShoppingBag size={20} />
          </Link>
          <button
            className="menu-button"
            aria-label="Меню"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {session.data?.development && (
        <div className="dev-note">
          Тестовая среда · реальные деньги не принимаются ·{" "}
          <Link href="/account">выбрать профиль</Link>
        </div>
      )}
      <main className="container">
        {pathname !== "/" && (
          <button className="text-button back" onClick={() => router.back()}>
            <ArrowLeft size={16} /> Назад
          </button>
        )}
        {telegramError && <p className="notice error">{telegramError}</p>}
        {view}
      </main>
      <footer>
        <span className="logo">WEARO</span>
        <p>Независимые магазины. Один гардероб.</p>
        <Link href="/account">
          Стать продавцом <ArrowUpRight size={16} />
        </Link>
        <small>
          Сервис находится в тестовом режиме. Приём реальных платежей отключён.
        </small>
      </footer>
      <div className="mobile-nav">
        <Link href="/">
          <Search size={20} />
          Каталог
        </Link>
        <Link href="/favorites">
          <Heart size={20} />
          Избранное
        </Link>
        <Link href="/cart">
          <ShoppingBag size={20} />
          Корзина
        </Link>
        <Link href="/account">
          <UserRound size={20} />
          Кабинет
        </Link>
      </div>
    </>
  );
}
function FuturePanel({
  pathname,
  session,
}: {
  pathname: string;
  session: Session | null;
}) {
  return pathname === "/cart" ? (
    <Cart />
  ) : pathname === "/orders" ? (
    <Orders />
  ) : pathname === "/admin" ? (
    <AdminPlaceholder session={session} />
  ) : (
    <p className="notice">
      Страница не найдена. <Link href="/">Каталог</Link>
    </p>
  );
}
function AdminPlaceholder({ session }: { session: Session | null }) {
  return session?.user?.role === "ADMIN" ? (
    <AdminPanel />
  ) : (
    <p className="notice">Нужны права администратора</p>
  );
}
type CartResult = {
  items: {
    id: string;
    quantity: number;
    available: boolean;
    lineTotalMinor: number;
    variant: Variant & { product: Product };
  }[];
  totalMinor: number;
};
type OrderView = {
  id: string;
  status: string;
  totalMinor: number;
  isTest: boolean;
  seller: { id: string; name: string };
  items: {
    id: string;
    title: string;
    size: string;
    color: string;
    quantity: number;
    priceMinor: number;
  }[];
  payment: { status: string } | null;
  commission: {
    amountMinor: number;
    sellerNetMinor: number;
    payableMinor: number;
  };
  address: { name: string; phone: string; city: string; street: string };
  shipment: { carrier: string; trackingNumber: string } | null;
  history: { id: string; toStatus: string; createdAt: string }[];
  returnRequest: { status: string } | null;
};
function Cart() {
  const result = useData<CartResult>("cart");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const d = result.data;
  return (
    <section>
      <h1>Корзина</h1>
      <State
        loading={result.loading}
        error={result.error}
        empty={d?.items.length === 0}
      />
      {d?.items.map((i) => (
        <div className="panel cart-row" key={i.id}>
          <div>
            <p className="eyebrow">{i.variant.product.seller.name}</p>
            <h3>{i.variant.product.title}</h3>
            <p>
              {i.variant.size} / {i.variant.color} ·{" "}
              {money(i.variant.product.priceMinor)}
            </p>
            {!i.available && (
              <p className="error">
                Позиция недоступна. Измените количество или удалите.
              </p>
            )}
          </div>
          <div className="quantity">
            <Action
              className="text-button"
              run={() =>
                api("cart", "POST", {
                  variantId: i.variant.id,
                  quantity: i.quantity - 1,
                })
              }
              onDone={result.reload}
            >
              −
            </Action>
            <span>{i.quantity}</span>
            <Action
              className="text-button"
              run={() =>
                api("cart", "POST", {
                  variantId: i.variant.id,
                  quantity: i.quantity + 1,
                })
              }
              onDone={result.reload}
            >
              +
            </Action>
          </div>
          <strong>{money(i.lineTotalMinor)}</strong>
          <Action
            className="text-button"
            run={() =>
              api("cart", "POST", { variantId: i.variant.id, quantity: 0 })
            }
            onDone={result.reload}
          >
            Удалить
          </Action>
        </div>
      ))}
      {!!d?.items.length && (
        <div className="panel">
          <h2>
            {d.items.some((i) => i.variant.product.demoDataset)
              ? "Тестовое оформление"
              : "Доставка и оформление"}
          </h2>
          <p className="muted">
            {d.items.some((i) => i.variant.product.demoDataset)
              ? "Каждый вымышленный магазин получит отдельный тестовый заказ. Доставка и денежные операции не выполняются. Используйте вымышленные контактные данные."
              : "Каждый магазин получит отдельный заказ. Указана стоимость товаров; доставка согласуется с продавцом."}
          </p>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const address = Object.fromEntries(new FormData(e.currentTarget));
              const stored = localStorage.getItem("wearo_checkout");
              let pending: { idempotencyKey: string; address: unknown } | null =
                null;
              try {
                pending = stored ? JSON.parse(stored) : null;
              } catch {}
              if (
                !pending ||
                JSON.stringify(pending.address) !== JSON.stringify(address)
              ) {
                pending = { idempotencyKey: crypto.randomUUID(), address };
                localStorage.setItem("wearo_checkout", JSON.stringify(pending));
              }
              try {
                await api("checkout", "POST", pending);
                localStorage.removeItem("wearo_checkout");
                router.push("/orders");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {[
              ["name", "Получатель"],
              ["phone", "Телефон (+7…)"],
              ["city", "Город"],
              ["street", "Улица, дом, квартира"],
            ].map(([k, label]) => (
              <Field label={label} key={k}>
                <input
                  name={k}
                  required
                  type={k === "phone" ? "tel" : "text"}
                />
              </Field>
            ))}
            <div className="full-width">
              <h2>Итого: {money(d.totalMinor)}</h2>
              <button
                className="button"
                disabled={busy || d.items.some((i) => !i.available)}
              >
                {busy
                  ? "Оформление…"
                  : d.items.some((i) => i.variant.product.demoDataset)
                    ? "Создать тестовые заказы"
                    : "Создать заказы"}
              </button>
              <p className="muted">
                Приём реальных платежей отключён. Тестовая оплата доступна
                только в тестовой среде.
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
function OrderCard({
  order: o,
  sellerId,
  admin,
  onDone,
}: {
  order: OrderView;
  sellerId?: string;
  admin?: boolean;
  onDone: () => void;
}) {
  const path = sellerId
    ? `sellers/${sellerId}/orders/${o.id}`
    : `orders/${o.id}`;
  const [returnForm, setReturnForm] = useState(false);
  const next: Record<string, string[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
  };
  const actions =
    sellerId || admin
      ? next[o.status] || []
      : ["PENDING", "CONFIRMED"].includes(o.status)
        ? ["CANCELLED"]
        : [];
  return (
    <div className="panel order-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {o.seller.name} / {o.id.slice(-8).toUpperCase()}
          </p>
          <h3>
            {money(o.totalMinor)}{" "}
            {o.isTest && <span className="badge">ТЕСТОВЫЙ ЗАКАЗ</span>}
          </h3>
        </div>
        <span className="badge">{statusLabel[o.status]}</span>
      </div>
      {o.items.map((i) => (
        <p key={i.id}>
          {i.title} · {i.size} / {i.color} · {i.quantity} шт. ·{" "}
          {money(i.priceMinor * i.quantity)}
        </p>
      ))}
      <p className="muted">
        Оплата: {statusLabel[o.payment?.status || "PENDING"]}.{" "}
        {o.shipment &&
          `Доставка: ${o.shipment.carrier}, ${o.shipment.trackingNumber}`}
      </p>
      <p className="muted">
        {o.address.name} · {o.address.phone} · {o.address.city},{" "}
        {o.address.street}
      </p>
      {(sellerId || admin) && (
        <p>
          Комиссия: {money(o.commission.amountMinor)} · Расчёт продавцу:{" "}
          {money(o.commission.sellerNetMinor)} · Реальное обязательство:{" "}
          {money(o.commission.payableMinor)}
        </p>
      )}
      {!sellerId &&
        !admin &&
        o.isTest &&
        o.status === "PENDING" &&
        o.payment?.status === "PENDING" && (
          <Action
            run={() =>
              api(`payments/test/${o.id}`, "POST", {
                eventId: crypto.randomUUID(),
              })
            }
            onDone={onDone}
          >
            Провести тестовую оплату
          </Action>
        )}
      {actions.map((status) =>
        status === "SHIPPED" ? (
          <form
            className="variant-row"
            key={status}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await api(path, "PATCH", { status, ...data });
                onDone();
              } catch (err) {
                alert((err as Error).message);
              }
            }}
          >
            <input name="carrier" required placeholder="Служба доставки" />
            <input name="trackingNumber" required placeholder="Трек-номер" />
            <button className="button">Отправить</button>
          </form>
        ) : (
          <Action
            key={status}
            className="text-button"
            run={() => api(path, "PATCH", { status })}
            onDone={onDone}
          >
            {statusLabel[status]}
          </Action>
        ),
      )}
      {!sellerId && !admin && o.status === "DELIVERED" && !o.returnRequest && (
        <button
          className="text-button"
          onClick={() => setReturnForm(!returnForm)}
        >
          Запросить возврат
        </button>
      )}
      {returnForm && (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason");
            try {
              await api(`returns/${o.id}`, "POST", { reason });
              onDone();
              setReturnForm(false);
            } catch (err) {
              alert((err as Error).message);
            }
          }}
        >
          <Field label="Причина возврата">
            <textarea name="reason" minLength={10} maxLength={2000} required />
          </Field>
          <button className="button">Отправить обращение</button>
        </form>
      )}
      <details>
        <summary>История статусов</summary>
        {o.history.map((h) => (
          <p className="muted" key={h.id}>
            {new Date(h.createdAt).toLocaleString("ru-RU")} ·{" "}
            {statusLabel[h.toStatus]}
          </p>
        ))}
      </details>
    </div>
  );
}
function Orders({ sellerId }: { sellerId?: string }) {
  const result = useData<OrderView[]>(
    sellerId ? `sellers/${sellerId}/orders` : "orders",
  );
  return (
    <section>
      <h2>{sellerId ? "Заказы магазина" : "Мои заказы"}</h2>
      <State
        loading={result.loading}
        error={result.error}
        empty={result.data?.length === 0}
      />
      {result.data?.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          sellerId={sellerId}
          onDone={result.reload}
        />
      ))}
    </section>
  );
}
function ReviewActions({
  path,
  statuses,
  onDone,
}: {
  path: string;
  statuses: string[];
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="review-actions">
      <Field label="Комментарий к решению">
        <input
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {statuses.map((status) => (
        <Action
          key={status}
          className="text-button"
          run={() => api(path, "PATCH", { status, note })}
          onDone={onDone}
        >
          {statusLabel[status] || status}
        </Action>
      ))}
    </div>
  );
}
function CategoryForm({
  category,
  categories,
  onDone,
}: {
  category?: Category & { slug: string };
  categories: Category[];
  onDone: () => void;
}) {
  const [gender, setGender] = useState(category?.gender || "WOMEN");
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api(
            `admin/categories${category ? `/${category.id}` : ""}`,
            category ? "PATCH" : "POST",
            {
              name: f.get("name"),
              slug: f.get("slug"),
              gender,
              parentId: f.get("parentId") || null,
            },
          );
          onDone();
        } catch (err) {
          setMessage((err as Error).message);
        }
      }}
    >
      <Field label="Название">
        <input name="name" defaultValue={category?.name} required />
      </Field>
      <Field label="Адрес категории (латиницей)">
        <input
          name="slug"
          defaultValue={category?.slug}
          required
          pattern="[a-z0-9-]{2,80}"
        />
      </Field>
      <Field label="Раздел">
        <select value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="WOMEN">Женщина</option>
          <option value="MEN">Мужчина</option>
        </select>
      </Field>
      <Field label="Родительская категория">
        <select name="parentId" defaultValue={category?.parentId || ""}>
          <option value="">Нет</option>
          {categories
            .filter((c) => c.gender === gender && c.id !== category?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </Field>
      <button className="button">Сохранить категорию</button>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
    </form>
  );
}
function AdminPanel() {
  const [section, setSection] = useState("overview");
  const [page, setPage] = useState(1);
  const result = useData<unknown>(`admin/${section}?page=${page}`);
  const [categoryEdit, setCategoryEdit] = useState<
    (Category & { slug: string }) | undefined
  >();
  const sections = [
    ["overview", "Обзор"],
    ["applications", "Заявки"],
    ["sellers", "Продавцы"],
    ["products", "Модерация товаров"],
    ["categories", "Категории"],
    ["orders", "Заказы"],
    ["commissions", "Комиссии"],
    ["returns", "Возвраты"],
    ["audit", "Журнал действий"],
  ];
  const rows = Array.isArray(result.data) ? result.data : [];
  const stats = result.data as {
    sellers: number;
    products: number;
    orders: number;
    realSales: number;
    realRevenueMinor: number;
    payableMinor: number;
  } | null;
  return (
    <section>
      <h1>Администрирование</h1>
      <div className="admin-tabs">
        {sections.map(([id, label]) => (
          <button
            className={section === id ? "selected" : ""}
            key={id}
            onClick={() => {
              setSection(id);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <State
        loading={result.loading}
        error={result.error}
        empty={section !== "overview" && rows.length === 0}
      />
      {section === "overview" && stats && !result.loading && (
        <div className="stats">
          {[
            ["Магазинов", stats.sellers],
            ["Товаров", stats.products],
            ["Всего заказов", stats.orders],
            ["Реальные продажи", stats.realSales],
            ["Реальная выручка", money(stats.realRevenueMinor)],
            ["Обязательства перед продавцами", money(stats.payableMinor)],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {section === "applications" &&
        (
          rows as {
            id: string;
            seller: Seller;
            contact: string;
            status: string;
            user: { displayName: string };
          }[]
        ).map((a) => (
          <div key={a.id} className="panel">
            <h2>{a.seller.name}</h2>
            <p>
              {a.user.displayName} · {a.contact} · {a.seller.city}
            </p>
            <p>{a.seller.description}</p>
            <span className="badge">{statusLabel[a.status]}</span>
            {a.status === "PENDING" && (
              <ReviewActions
                path={`admin/sellers/${a.seller.id}`}
                statuses={["ACTIVE", "REJECTED"]}
                onDone={result.reload}
              />
            )}
          </div>
        ))}
      {section === "sellers" &&
        (rows as Seller[]).map((s) => (
          <div className="panel" key={s.id}>
            <h2>{s.name}</h2>
            <p>
              {s.city} · {s.description}
            </p>
            <span className="badge">{statusLabel[s.status]}</span>
            {["ACTIVE", "BLOCKED"].includes(s.status) && (
              <ReviewActions
                path={`admin/sellers/${s.id}`}
                statuses={s.status === "ACTIVE" ? ["BLOCKED"] : ["ACTIVE"]}
                onDone={result.reload}
              />
            )}
            <form
              className="variant-row"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(`admin/sellers/${s.id}/commission`, "PATCH", {
                    commissionBps: Math.round(
                      Number(new FormData(e.currentTarget).get("commission")) *
                        100,
                    ),
                  });
                  result.reload();
                } catch (err) {
                  alert((err as Error).message);
                }
              }}
            >
              <Field label="Комиссия для новых заказов, %">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  name="commission"
                  defaultValue={s.commissionBps / 100}
                />
              </Field>
              <button className="button">Сохранить</button>
            </form>
          </div>
        ))}
      {section === "products" &&
        (rows as Product[]).map((p) => (
          <div className="panel" key={p.id}>
            <p className="eyebrow">{p.seller.name}</p>
            <h2>
              {p.title} · {money(p.priceMinor)}
            </h2>
            <p>{p.description}</p>
            <span className="badge">{statusLabel[p.status]}</span>
            <div className="image-list">
              {p.images.map((i) => (
                <img key={i.id} src={i.url} alt={p.title} />
              ))}
            </div>
            {p.variants.map((v) => (
              <p key={v.id} className="muted">
                {v.sku} · {v.size} / {v.color} · Остаток {v.inventory.available}
                , резерв {v.inventory.reserved}
              </p>
            ))}
            <ReviewActions
              path={`admin/products/${p.id}`}
              statuses={["APPROVED", "REJECTED"]}
              onDone={result.reload}
            />
          </div>
        ))}
      {section === "categories" && (
        <>
          <div className="panel">
            <h2>{categoryEdit ? "Изменить категорию" : "Новая категория"}</h2>
            <CategoryForm
              key={categoryEdit?.id || "new"}
              category={categoryEdit}
              categories={rows as Category[]}
              onDone={() => {
                setCategoryEdit(undefined);
                result.reload();
              }}
            />
          </div>
          {(rows as (Category & { slug: string })[]).map((c) => (
            <div className="panel" key={c.id}>
              <h3>
                {c.gender === "WOMEN" ? "Женщина" : "Мужчина"} / {c.name}
              </h3>
              <button
                className="text-button"
                onClick={() => setCategoryEdit(c)}
              >
                Изменить
              </button>
              <Action
                className="text-button"
                run={() => api(`admin/categories/${c.id}`, "DELETE")}
                onDone={result.reload}
              >
                Удалить пустую категорию
              </Action>
            </div>
          ))}
        </>
      )}
      {section === "orders" &&
        (rows as OrderView[]).map((o) => (
          <OrderCard key={o.id} order={o} admin onDone={result.reload} />
        ))}
      {section === "commissions" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Магазин / заказ</th>
                <th>Комиссия</th>
                <th>Расчёт продавцу</th>
                <th>Реальное обязательство</th>
                <th>Состояние</th>
              </tr>
            </thead>
            <tbody>
              {(
                rows as {
                  id: string;
                  amountMinor: number;
                  sellerNetMinor: number;
                  payableMinor: number;
                  reversedAt: string | null;
                  order: {
                    id: string;
                    isTest: boolean;
                    status: string;
                    seller: { name: string };
                  };
                }[]
              ).map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.order.seller.name} / {c.order.id.slice(-8)}{" "}
                    {c.order.isTest ? "(тест)" : ""}
                  </td>
                  <td>{money(c.amountMinor)}</td>
                  <td>{money(c.sellerNetMinor)}</td>
                  <td>{money(c.payableMinor)}</td>
                  <td>
                    {c.reversedAt
                      ? "Сторнировано"
                      : statusLabel[c.order.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section === "returns" &&
        (
          rows as {
            id: string;
            reason: string;
            status: string;
            order: OrderView;
          }[]
        ).map((r) => (
          <div className="panel" key={r.id}>
            <h2>
              Возврат · {r.order.seller.name} · {r.order.id.slice(-8)}
            </h2>
            <p>{r.reason}</p>
            <span className="badge">{statusLabel[r.status]}</span>
            {["REQUESTED", "APPROVED"].includes(r.status) && (
              <ReviewActions
                path={`admin/returns/${r.id}`}
                statuses={
                  r.status === "REQUESTED"
                    ? ["APPROVED", "REJECTED"]
                    : ["RECEIVED"]
                }
                onDone={result.reload}
              />
            )}
          </div>
        ))}
      {section === "audit" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Пользователь</th>
                <th>Действие</th>
                <th>Объект</th>
              </tr>
            </thead>
            <tbody>
              {(
                rows as {
                  id: string;
                  createdAt: string;
                  actor: { displayName: string } | null;
                  action: string;
                  entityId: string;
                }[]
              ).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString("ru-RU")}</td>
                  <td>{log.actor?.displayName || "Система"}</td>
                  <td>{log.action}</td>
                  <td>{log.entityId.slice(-10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!["overview", "categories"].includes(section) && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span>Страница {page}</span>
          <button disabled={rows.length < 50} onClick={() => setPage(page + 1)}>
            Далее
          </button>
        </div>
      )}
    </section>
  );
}
