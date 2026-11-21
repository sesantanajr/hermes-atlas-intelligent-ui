import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
const root = resolve(".");
for (const relative of ["atlas/static", "atlas/plugin"]) {
  const target = resolve(root, relative);
  if (
    !target.startsWith(root + sep) ||
    !["static", "plugin"].includes(target.split(sep).at(-1))
  )
    throw new Error("Unsafe generated asset path");
  await rm(target, { recursive: true, force: true });
}
await mkdir("atlas/static", { recursive: true });
await cp("dist", "atlas/static", { recursive: true });
await mkdir("atlas/plugin/atlas", { recursive: true });
for (const name of ["plugin.yaml", "__init__.py", "dashboard", "desktop"])
  await cp(name, `atlas/plugin/${name}`, {
    recursive: true,
    filter: (source) =>
      !source.includes("__pycache__") && !source.endsWith(".pyc"),
  });
for (const name of await readdir("atlas"))
  if (name.endsWith(".py"))
    await cp(`atlas/${name}`, `atlas/plugin/atlas/${name}`);
