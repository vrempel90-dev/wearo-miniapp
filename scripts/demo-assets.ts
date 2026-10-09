import { mkdir, writeFile, readFile, readdir, access } from "node:fs/promises";
import { makeDemoCatalog, DATASET } from "../prisma/demo-data";
import sharp from "sharp";
// This consumes individually generated original files. It only exports a web-sized JPEG; no content synthesis or editing.
const mode = process.argv[2];
await mkdir("work", { recursive: true });
await mkdir("public/demo/products", { recursive: true });
if (mode === "prompts") {
  await writeFile(
    "work/demo-prompts.json",
    JSON.stringify(
      makeDemoCatalog().map((p) => ({
        serial: p.serial,
        prompt: p.prompt,
        title: p.title,
      })),
      null,
      2,
    ),
  );
} else if (mode === "import") {
  const initial: { serial: string; path: string; prompt: string }[] =
    JSON.parse(await readFile("work/generated-assets.json", "utf8"));
  const records = new Map(initial.map((record) => [record.serial, record]));
  for (const name of await readdir("work/generated").catch(() => [])) {
    if (!/^\d{3}\.json$/.test(name)) continue;
    const record = JSON.parse(await readFile(`work/generated/${name}`, "utf8"));
    records.set(record.serial, record);
  }
  const files = [...records.values()].sort((a, b) =>
    a.serial.localeCompare(b.serial),
  );
  const first = files.find((file) => file.serial === "001");
  if (first)
    first.prompt =
      "Use case: product-mockup. Asset type: unique photograph for a fictional Kazakhstan fashion marketplace demo. Primary request: one unbranded women's oversized sand beige cotton jacket with two large patch pockets and ivory buttons, long sleeves, clean front view ghost mannequin product photography, garment only no person. Background warm off-white seamless studio, soft diffused light and subtle shadow, crisp textile details, elegant high end ecommerce fashion photograph. Entire jacket fully visible with generous margin, portrait 3:4 composition. No text, no logos, no watermark, no collage, no additional products.";
  for (const asset of files) {
    const destination = `public/demo/products/${asset.serial}.jpg`;
    try {
      await access(destination);
      continue;
    } catch {}
    await sharp(asset.path)
      .resize({
        width: 900,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 87, mozjpeg: true })
      .toFile(destination);
  }
  await writeFile(
    "public/demo/assets.json",
    JSON.stringify(
      {
        dataset: DATASET,
        source: "OpenAI image_gen built-in",
        license:
          "Individually generated unbranded fictional product photographs for this project",
        images: files.map(({ serial, prompt }) => ({
          serial,
          file: `${serial}.jpg`,
          prompt,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`Imported ${files.length} individually generated photographs`);
} else throw new Error("Use prompts or import");
