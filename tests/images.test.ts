import { it, expect } from "vitest";
import sharp from "sharp";
import { optimizeImage } from "../src/server/uploads";
it("decodes, resizes, recompresses and strips EXIF from uploaded images", async () => {
  const input = await sharp({
    create: { width: 2400, height: 2400, channels: 3, background: "#556b48" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "Private metadata" } } })
    .toBuffer();
  const output = await optimizeImage(input);
  const metadata = await sharp(output).metadata();
  expect(metadata.format).toBe("jpeg");
  expect(metadata.width).toBe(1600);
  expect(metadata.exif).toBeUndefined();
});
it("rejects active SVG content", async () => {
  await expect(
    optimizeImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script></svg>',
      ),
    ),
  ).rejects.toThrow("JPEG");
});
it("rejects malformed image bytes", async () => {
  await expect(optimizeImage(Buffer.from("not an image"))).rejects.toThrow(
    "повреждено",
  );
});
