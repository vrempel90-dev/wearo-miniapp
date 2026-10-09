export const DATASET = "wearo-fashion-v1";
export const DEMO_NOTICE =
  "Демонстрационный каталог — заказы и оплата тестовые";
export const stores = [
  [
    "urban-mode",
    "URBAN MODE",
    "Повседневные сочетания и свободные силуэты",
    "Алматы",
    "UM",
    "#566252",
  ],
  [
    "north-line",
    "NORTH LINE",
    "Мужской гардероб для города и путешествий",
    "Астана",
    "NL",
    "#354b5c",
  ],
  [
    "elyra",
    "ELYRA",
    "Женственная коллекция с мягкими фактурами",
    "Алматы",
    "E",
    "#9b786e",
  ],
  [
    "streetform",
    "STREETFORM",
    "Уличный стиль, объём и комфорт",
    "Шымкент",
    "SF",
    "#4d5049",
  ],
  [
    "vela-shoes",
    "VELA SHOES",
    "Женская обувь для разных ритмов жизни",
    "Астана",
    "VS",
    "#9b6e64",
  ],
  [
    "motion-lab",
    "MOTION LAB",
    "Спортивные силуэты на каждый день",
    "Алматы",
    "ML",
    "#687b64",
  ],
  [
    "atelier-nova",
    "ATELIER NOVA",
    "Лаконичная одежда для особых дней",
    "Караганда",
    "AN",
    "#79746f",
  ],
  [
    "denim-district",
    "DENIM DISTRICT",
    "Деним, чистые линии и свободный крой",
    "Алматы",
    "DD",
    "#4a6174",
  ],
  [
    "sora-edit",
    "SORA EDIT",
    "Минимализм и спокойная цветовая палитра",
    "Астана",
    "SE",
    "#868270",
  ],
  [
    "almara-form",
    "ALMARA FORM",
    "Женский гардероб с выразительными деталями",
    "Шымкент",
    "AF",
    "#947b8b",
  ],
  [
    "step-atelier",
    "STEP ATELIER",
    "Городская обувь и сдержанные формы",
    "Караганда",
    "SA",
    "#6e5f54",
  ],
  [
    "qara-studio",
    "QARA STUDIO",
    "Мужская одежда с архитектурным силуэтом",
    "Астана",
    "QS",
    "#424641",
  ],
  [
    "lume-wardrobe",
    "LUME WARDROBE",
    "Базовые вещи и лёгкие многослойные образы",
    "Алматы",
    "LW",
    "#968b71",
  ],
  [
    "stride-room",
    "STRIDE ROOM",
    "Кеды, кроссовки и обувь для прогулок",
    "Актобе",
    "SR",
    "#68747c",
  ],
  [
    "terra-thread",
    "TERRA THREAD",
    "Тактильные ткани и природные оттенки",
    "Павлодар",
    "TT",
    "#807963",
  ],
] as const;
// Counts refer to products, never to variants. All amounts below are fictional KZT.
const kinds = {
  jacket: [
    "Куртка",
    "cotton jacket with buttons and patch pockets",
    19990,
    79990,
    "Плотный хлопок",
    "minimal",
  ],
  tee: [
    "Футболка",
    "short sleeve cotton crew neck t-shirt",
    3990,
    12990,
    "Хлопковый джерси",
    "minimal",
  ],
  shirt: [
    "Рубашка",
    "long sleeve button front cotton shirt",
    7990,
    24990,
    "Хлопковый поплин",
    "minimal",
  ],
  hoodie: [
    "Худи",
    "oversized cotton hoodie with kangaroo pocket",
    9990,
    29990,
    "Хлопковый футер",
    "street",
  ],
  sweatshirt: [
    "Свитшот",
    "crew neck cotton sweatshirt with ribbed cuffs",
    9990,
    29990,
    "Мягкий футер",
    "sport",
  ],
  jeans: [
    "Джинсы",
    "straight leg five pocket denim jeans",
    9990,
    34990,
    "Хлопковый деним",
    "denim",
  ],
  trousers: [
    "Брюки",
    "tailored straight leg trousers with belt loops",
    8990,
    29990,
    "Костюмная ткань",
    "minimal",
  ],
  dress: [
    "Платье",
    "midi dress with short sleeves and defined waist",
    9990,
    49990,
    "Смесовая вискоза",
    "elegant",
  ],
  skirt: [
    "Юбка",
    "a-line midi skirt with a neat waistband",
    7990,
    29990,
    "Плотная вискоза",
    "elegant",
  ],
  suit: [
    "Костюм",
    "two piece matching tailored blazer and trousers suit",
    24990,
    89990,
    "Костюмная ткань",
    "elegant",
  ],
  coat: [
    "Пальто",
    "long wool blend single breasted coat with notch lapels",
    29990,
    119990,
    "Смесовая шерсть",
    "elegant",
  ],
  sneakers: [
    "Кроссовки",
    "pair of minimalist mesh and leather low top sneakers",
    12990,
    59990,
    "Текстиль и искусственная кожа",
    "sport",
  ],
  canvas: [
    "Кеды",
    "pair of low top canvas sneakers with white rubber soles",
    9990,
    39990,
    "Хлопковый канвас",
    "street",
  ],
  boots: [
    "Ботинки",
    "pair of leather lace up ankle boots with chunky sole",
    19990,
    69990,
    "Искусственная кожа",
    "street",
  ],
  pumps: [
    "Туфли",
    "pair of elegant leather pointed toe pumps with moderate block heel",
    14990,
    59990,
    "Искусственная кожа",
    "elegant",
  ],
  tallboots: [
    "Сапоги",
    "pair of knee high leather boots with low block heels",
    24990,
    79990,
    "Искусственная кожа",
    "elegant",
  ],
  dressshoes: [
    "Туфли",
    "pair of classic leather derby dress shoes with low heel",
    14990,
    59990,
    "Искусственная кожа",
    "elegant",
  ],
} as const;
export const allocation = [
  [
    "WOMEN",
    "clothing",
    {
      jacket: 10,
      tee: 25,
      hoodie: 15,
      sweatshirt: 15,
      jeans: 20,
      trousers: 20,
      dress: 20,
      skirt: 10,
      suit: 5,
      coat: 10,
    },
  ],
  [
    "WOMEN",
    "shoes",
    { sneakers: 30, canvas: 20, boots: 20, pumps: 15, tallboots: 15 },
  ],
  [
    "MEN",
    "clothing",
    {
      tee: 30,
      shirt: 20,
      hoodie: 20,
      sweatshirt: 15,
      jeans: 20,
      trousers: 20,
      suit: 5,
      jacket: 10,
      coat: 10,
    },
  ],
  ["MEN", "shoes", { sneakers: 35, canvas: 25, boots: 25, dressshoes: 15 }],
] as const;
const colors = [
  ["Песочный", "sand beige"],
  ["Молочный", "warm ivory"],
  ["Графит", "charcoal grey"],
  ["Чёрный", "black"],
  ["Оливковый", "muted olive green"],
  ["Шоколадный", "dark chocolate brown"],
  ["Синий", "deep blue"],
  ["Серый", "medium grey"],
  ["Пудровый", "dusty rose"],
  ["Белый", "white"],
] as const;
const models = [
  "Forma",
  "Haze",
  "Arc",
  "Linea",
  "Flow",
  "Dune",
  "Tempo",
  "Aster",
  "Vista",
  "Frame",
  "Echo",
  "Orbit",
  "Muse",
  "Silva",
  "Calm",
  "Rise",
  "Lino",
  "Cove",
  "Riva",
  "Trace",
];
const eligible: Record<string, number[]> = {
  "WOMEN-clothing": [0, 2, 3, 5, 6, 7, 8, 9, 12, 14],
  "MEN-clothing": [0, 1, 3, 5, 6, 7, 8, 11, 12, 14],
  "WOMEN-shoes": [4, 5, 10, 13],
  "MEN-shoes": [5, 10, 13],
};
export function makeDemoCatalog() {
  let index = 0;
  const products = [];
  for (const [gender, group, counts] of allocation) {
    for (const [kind, count] of Object.entries(counts)) {
      const spec = kinds[kind as keyof typeof kinds];
      for (let n = 0; n < count; n++) {
        const serial = String(++index).padStart(3, "0");
        const pool = eligible[`${gender}-${group}`];
        const storeIndex = pool[(index - 1) % pool.length];
        const colorIndex =
          kind === "jeans" ? [6, 3, 7][n % 3] : (index - 1) % colors.length;
        const color = colors[colorIndex];
        const alternate =
          kind === "jeans"
            ? colors[[3, 7, 6][n % 3]]
            : colors[(colorIndex + 3) % colors.length];
        const percent =
          index % 4 === 0 ? [10, 20, 25, 30][Math.floor(index / 4) % 4] : null;
        const min = spec[2],
          max = spec[3];
        const lowestOld = percent
          ? Math.ceil(min / (1 - percent / 100) / 100) * 100
          : 0;
        const oldKzt = percent
          ? lowestOld +
            ((index * 137) % (Math.floor((max - lowestOld) / 100) + 1)) * 100
          : null;
        const priceMinor =
          oldKzt && percent
            ? oldKzt * (100 - percent)
            : (min +
                ((index * 17) % (Math.floor((max - min) / 100) + 1)) * 100) *
              100;
        const sizes =
          group === "shoes"
            ? gender === "WOMEN"
              ? ["36", "37", "38", "39", "40", "41"]
              : ["40", "41", "42", "43", "44", "45"]
            : gender === "WOMEN"
              ? ["XS", "S", "M", "L", "XL"]
              : ["S", "M", "L", "XL", "XXL"];
        const model = `${models[(index - 1) % models.length]} ${serial}`;
        const product = {
          id: `wearo-demo-${serial}`,
          demoKey: `${DATASET}/${serial}`,
          serial,
          gender,
          group,
          kind,
          storeIndex,
          categorySlug: `${gender.toLowerCase()}-${group}-${kind}`,
          categoryName: spec[0],
          title: `${spec[0]} ${model} · ${color[0]}`,
          description: `${spec[0]} ${model} из коллекции ${stores[storeIndex][1]}. Материал: ${spec[4]}. Основной цвет: ${color[0].toLowerCase()}; альтернативный: ${alternate[0].toLowerCase()}. ${group === "shoes" ? "Размерная сетка EU. Модель для повседневных сочетаний." : "Силуэт для современного городского гардероба. Размерная сетка буквенная."} Артикул WEA-${serial}. Все характеристики, материалы, цены и остатки вымышлены. Это демонстрационный товар, доставка и денежные операции не выполняются. Фото показывает только основной цвет; альтернативный цвет отдельно не сфотографирован.`,
          priceMinor,
          oldPriceMinor: oldKzt ? oldKzt * 100 : null,
          discountPercent: percent,
          styleTag: spec[5],
          primaryColor: color[0],
          photo: `/demo/products/${serial}.jpg`,
          prompt: `Use case: product-mockup. Asset type: unique fashion ecommerce product photograph, demo SKU WEA-${serial}. One unbranded ${gender === "WOMEN" ? "women's" : "men's"} ${spec[1]} in ${color[1]}, model variation ${model}. ${group === "shoes" ? "A complete matching pair of shoes, three quarter product view." : "Entire garment visible, front view ghost mannequin product photography, no human."} Consistent warm off-white seamless studio background, soft diffused lighting, subtle natural shadow, crisp realistic ${spec[4]} texture, high end ecommerce catalog photography. Portrait 3:4 framing, subject centered with generous margin, correct proportions. No text, brand logos, watermarks, extra objects, collage or decorations.`,
          variants: [color[0], alternate[0]].flatMap((c, ci) =>
            sizes.map((size, si) => ({
              id: `wearo-demo-${serial}-${ci}-${size}`,
              sku: `WEA-${serial}-${ci}-${size}`,
              size,
              color: c,
              available: 3 + ((index * 7 + si * 3 + ci * 5) % 18),
            })),
          ),
        };
        products.push(product);
      }
    }
  }
  return products;
}
