import { readdir, unlink, cp } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(".next/standalone");
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.name === ".env" || entry.name.startsWith(".env.")) {
    if (!entry.isFile() && !entry.isSymbolicLink())
      throw new Error("Unexpected environment directory in build");
    await unlink(resolve(root, entry.name));
  }
}
console.log("Standalone build sanitized: environment files excluded.");
await cp("public", resolve(root, "public"), { recursive: true });
await cp(".next/static", resolve(root, ".next/static"), { recursive: true });
