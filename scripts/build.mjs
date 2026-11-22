/**
 * Build the three bundles Hermes loads, plus the export template. (`vite build` makes the
 * standalone app; `npm run build` runs both.)
 *
 *   dashboard/dist/index.js + index.css   classic script for the web dashboard tab; React is
 *                                          the dashboard's own, taken from its plugin SDK
 *   desktop/plugin.js                      one ES module for Hermes Desktop / Webapp; imports
 *                                          only react, react/jsx-runtime and @hermes/plugin-sdk,
 *                                          stylesheet inlined (the host loads no CSS file)
 *   hermes_atlas/assets/viewer.html        self-contained page used by "export as HTML"
 *
 * The outputs are committed, so installing the plugin from Git needs no Node.
 */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const loader = { ".webp": "dataurl", ".mp3": "dataurl", ".mp4": "dataurl", ".svg": "dataurl" };
const common = {
  bundle: true,
  minify: true,
  legalComments: "none",
  target: "es2022",
  jsx: "automatic",
  loader,
  define: { __ATLAS_VERSION__: JSON.stringify(version), "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
};

/** A second React renderer inside a host breaks hooks: make pulling one in a build error. */
const noBundledRenderer = {
  name: "no-bundled-renderer",
  setup(b) {
    b.onResolve({ filter: /^react-dom(\/.*)?$/ }, (args) => ({
      errors: [{ text: `${args.importer} imports ${args.path}; host bundles must use the host's React only` }],
    }));
  },
};

/** `react` and its JSX runtime, served from the dashboard's own React instance. */
const dashboardReact = {
  name: "dashboard-react",
  setup(b) {
    const names = Object.keys(require("react")).filter((name) => /^[A-Za-z$][\w$]*$/.test(name) && name !== "default"); // no `__internals`
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "host-react" }));
    b.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, () => ({ path: "jsx", namespace: "host-react" }));
    b.onLoad({ filter: /^react$/, namespace: "host-react" }, () => ({
      loader: "js",
      contents:
        "const R = window.__HERMES_PLUGIN_SDK__.React;\nexport default R;\n" +
        `export const { ${names.join(", ")} } = R;\n`,
    }));
    b.onLoad({ filter: /^jsx$/, namespace: "host-react" }, () => ({
      loader: "js",
      // The automatic JSX runtime expressed with createElement, so elements are created by the
      // host's React whatever its version.
      contents: `
        const R = window.__HERMES_PLUGIN_SDK__.React;
        export const Fragment = R.Fragment;
        function element(type, props, key, spread) {
          const { children, ...rest } = props ?? {};
          if (key !== undefined) rest.key = key;
          if (children === undefined) return R.createElement(type, rest);
          return spread && Array.isArray(children)
            ? R.createElement(type, rest, ...children)
            : R.createElement(type, rest, children);
        }
        export const jsx = (type, props, key) => element(type, props, key, false);
        export const jsxs = (type, props, key) => element(type, props, key, true);
        export const jsxDEV = (type, props, key, isStatic) => element(type, props, key, isStatic);
      `,
    }));
  },
};

async function dashboard() {
  await build({
    ...common,
    entryPoints: ["src/host/dashboard.tsx"],
    format: "iife",
    outfile: "dashboard/dist/index.js",
    plugins: [noBundledRenderer, dashboardReact],
  });
}

async function desktop() {
  const options = {
    ...common,
    entryPoints: ["src/host/desktop.tsx"],
    format: "esm",
    outfile: "desktop/plugin.js",
    external: ["react", "react/jsx-runtime", "@hermes/plugin-sdk"],
    plugins: [noBundledRenderer],
    write: false,
  };
  // First pass only to collect the stylesheet; the second inlines it as a constant.
  const styles = (await build(options)).outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  const result = await build({ ...options, define: { ...common.define, ATLAS_STYLES: JSON.stringify(styles) } });
  const script = result.outputFiles.find((file) => file.path.endsWith(".js")).text;
  await mkdir("desktop", { recursive: true });
  await rm("desktop/plugin.css", { force: true });
  await writeFile("desktop/plugin.js", script);
}

async function viewer() {
  const result = await build({
    ...common,
    entryPoints: ["src/host/viewer.tsx"],
    format: "iife",
    outfile: "viewer.js",
    write: false,
  });
  const text = (suffix) => result.outputFiles.find((file) => file.path.endsWith(suffix))?.text ?? "";
  // Nothing in the page may close the element it sits in.
  const script = text(".js").replaceAll("</script", "<\\/script").replaceAll("<!--", "<\\!--");
  const style = text(".css").replaceAll("</style", "<\\/style");
  const hash = createHash("sha256").update(script).digest("base64");
  // The exported page talks to nobody: scripts are pinned by hash, and only images and media a
  // canvas names over HTTPS may load.
  const policy = [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "style-src 'unsafe-inline'",
    "img-src data: https:",
    "media-src data: https:",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const page = `<!doctype html>
<html lang="__ATLAS_EXPORT_LANG__">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="generator" content="Hermes Atlas ${version}">
<title>__ATLAS_EXPORT_TITLE__</title>
<style>${style}</style>
</head>
<body>
<div id="root"></div>
<script type="application/json" id="atlas-data">__ATLAS_EXPORT_DATA__</script>
<script>${script}</script>
</body>
</html>
`;
  await mkdir("hermes_atlas/assets", { recursive: true });
  await writeFile("hermes_atlas/assets/viewer.html", page);
}

const started = Date.now();
await Promise.all([dashboard(), desktop(), viewer()]);
console.log(`bundles built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
