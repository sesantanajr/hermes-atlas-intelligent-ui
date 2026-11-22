import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
const bundle = await build({
  entryPoints: ["src/blocks/catalogData.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { catalog } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].contents).toString("base64")
);
await writeFile("hermes_atlas/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
