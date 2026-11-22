/**
 * Verify the committed bundles against the rules their hosts enforce. Run by `npm run build`
 * and by CI; exits non-zero on the first broken rule.
 *
 * Hermes Desktop loader and catalogue lint (hermes_cli/plugin_validate_desktop.py,
 * apps/desktop/src/contrib/runtime-loader.ts):
 *   - every .js under desktop/ (what the lint covers) uses no dynamic import, eval, new Function,
 *     script injection or reach into the app's own DOM, in its comment-stripped text (the lint's
 *     view) and in its raw text (the lint's stripper is not a lexer and blanks whole lines);
 *   - plugin.js imports only react, react/jsx-runtime, react/jsx-dev-runtime and
 *     @hermes/plugin-sdk, the SDK as a namespace;
 *   - it is one file, read whole (16 MiB cap; shells without the readPluginSource bridge stop at
 *     512 KiB, reported as a warning), and the host loads no stylesheet beside it.
 * Hermes dashboard: one classic script that registers under the manifest's name and brings no
 * React of its own.
 * One plugin id everywhere Hermes reads it: plugin.yaml `name` (the install folder), the
 * manifest `name` (backend route, dashboard tab, `plugins.enabled` gate), the Desktop extension's
 * `id` (the namespace `ctx.rest` calls), `API_BASE` and the dashboard registration.
 * Install-time scanner (hermes_cli/plugins_install_scan.py): a file over 1 MiB is reported, so
 * every bundle stays under that.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

const failures = [];
const fail = (message) => failures.push(message);
const warnings = [];
const warn = (message) => warnings.push(message);
const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : (fail(`${path} is missing: run npm run build`), ""));
const size = (path) => (existsSync(path) ? statSync(path).size : 0);
const SCANNER_FILE_LIMIT = 1024 * 1024;
const OLD_SHELL_READ_LIMIT = 512 * 1024;

// ---- Desktop -------------------------------------------------------------------------------
// The same expressions Hermes's admission lint applies to comment-stripped source.
const FORBIDDEN = [
  ["dynamic code evaluation", /(?<![\w$.])eval\(|\bnew\s+Function\(/g],
  ["dynamic import outside the SDK", /\bimport\(\s*(?!['"](?:@hermes\/plugin-sdk|react)(?:\/[\w/-]*)?['"]\s*\))/g],
  ["remote import outside the SDK", /\bimport\s+(?:[^;'"]*?\bfrom\s*)?['"][a-zA-Z][\w+.-]*:/g],
  ["script injection", /createElement\(\s*['"]script['"]\s*\)|<script\b/g],
  ["app DOM reach", /\bdocument\.(?:querySelector(?:All)?|getElementsBy\w+|getElementById)\(\s*[`'"][^`'"]*\[data-(?:slot|tour|sidebar|testid)\b/g],
  ["app DOM reach", /\.observe\(\s*document\.body\s*,\s*\{[^}]*\b(?:childList|subtree)\b/g],
  ["preview guest reach", /\b(?:querySelector(?:All)?|closest|getElementsByTagName|createElement)\(\s*[`'"]webview\b/g],
];
const REVIEW = [
  ["raw bridge window.hermesDesktop", /\b(?:window|globalThis|self)\s*(?:\?\.|\.)\s*hermesDesktop\b/g],
  ["app markup selector", /\[data-(?:slot|tour|sidebar|testid|tree-[\w-]+|pane-host|titlebar-cluster)\b/g],
];
const COMMENT = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|(?<![:\w])\/\/[^\n]*/g;
const REGEX_LITERAL = /(?<![\w)\]])\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[a-z]*/g;
const ALLOWED_IMPORTS = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime", "@hermes/plugin-sdk"]);

/** Every `.js` file under desktop/: the files Hermes's lint reads (`_desktop_surface_files`). */
function desktopFiles(dir = "desktop") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return desktopFiles(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

function lintDesktop(path, source) {
  const stripped = source.replace(COMMENT, (whole, literal) => literal ?? whole.replace(/[^\n]/g, ""));
  // The lint's comment stripper is not a JavaScript lexer: a `//` inside a regular expression or
  // base64 text makes it drop the rest of the line (a tenth of plugin.js). The raw text is read
  // as well, so nothing the lint would refuse can sit unseen in what it skipped.
  for (const [view, text] of [["comment-stripped", stripped], ["raw", source]]) {
    const masked = text.replace(REGEX_LITERAL, (whole) => " ".repeat(whole.length));
    for (const [rule, pattern] of FORBIDDEN) {
      const haystack = rule === "script injection" ? masked : text;
      for (const match of haystack.matchAll(pattern))
        fail(`${path} (${view}): ${rule}: …${haystack.slice(Math.max(0, match.index - 40), match.index + 60)}…`);
    }
    // `search` ignores the patterns' `g` state, which `test` would carry from one text to the next.
    for (const [cue, pattern] of REVIEW)
      if (text.search(pattern) !== -1) fail(`${path} (${view}): catalogue review cue "${cue}"`);
  }
}

/**
 * The `id` of plugin.js's default export, as esbuild writes it: `export default {id:"…"}`, or
 * `export{X as default}` with `X={id:"…"}`, or `X={id:Y}` and `Y="…"`.
 */
function defaultExportId(source) {
  const named = (name) => name.replace(/\$/g, "\\$");
  const value = (expression) =>
    /^["']([^"']+)["']$/.exec(expression)?.[1] ??
    new RegExp(`(?:^|[^\\w$])${named(expression)}\\s*=\\s*["']([^"']+)["']`).exec(source)?.[1];
  const ID = `\\{\\s*id\\s*:\\s*("[^"]*"|'[^']*'|[\\w$]+)`;
  const inline = new RegExp(`export\\s+default\\s*${ID}`).exec(source);
  if (inline) return value(inline[1]);
  const alias = /export\s*\{[^}]*?([\w$]+)\s+as\s+default\b/.exec(source)?.[1];
  const object = alias && new RegExp(`(?:^|[^\\w$])${named(alias)}\\s*=\\s*${ID}`).exec(source);
  return object ? value(object[1]) : undefined;
}

const desktop = read("desktop/plugin.js");
for (const path of desktopFiles()) lintDesktop(path, path === "desktop/plugin.js" ? desktop : readFileSync(path, "utf8"));
if (desktop) {
  const imports = [...desktop.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);
  for (const specifier of new Set(imports))
    if (!ALLOWED_IMPORTS.has(specifier)) fail(`desktop/plugin.js imports "${specifier}", which the Desktop loader refuses`);
  if (!imports.includes("@hermes/plugin-sdk")) fail("desktop/plugin.js does not import @hermes/plugin-sdk");
  if (/import\s*\{[^}]*\}\s*from\s*["']@hermes\/plugin-sdk["']/.test(desktop))
    fail("desktop/plugin.js uses named imports from @hermes/plugin-sdk: a name an older host lacks would fail the whole module; import the namespace");
  if (!/export\s*\{[^}]*\bas default\b|export default/.test(desktop)) fail("desktop/plugin.js has no default export");
  if (existsSync("desktop/plugin.css")) fail("desktop/plugin.css exists, but the Desktop host never loads it: styles must be inlined");
  const bytes = size("desktop/plugin.js");
  if (bytes > OLD_SHELL_READ_LIMIT)
    warn(
      `desktop/plugin.js is ${(bytes / 1024).toFixed(0)} KB: Hermes Desktop shells without the readPluginSource ` +
        "bridge read at most 512 KB of a plugin and refuse to load a larger one (runtime-loader.ts readPluginSourceText)",
    );
}

// ---- Dashboard -----------------------------------------------------------------------------
const dashboard = read("dashboard/dist/index.js");
const manifest = JSON.parse(read("dashboard/manifest.json") || "{}");
if (dashboard) {
  if (!dashboard.includes(`register("${manifest.name}"`)) fail(`dashboard bundle does not register under the manifest name "${manifest.name}"`);
  if (!dashboard.includes("__HERMES_PLUGIN_SDK__")) fail("dashboard bundle does not use the host SDK");
}
for (const key of ["entry", "css", "api"])
  if (manifest[key] && !existsSync(`dashboard/${manifest[key]}`)) fail(`dashboard/manifest.json ${key} points at a missing file: ${manifest[key]}`);
for (const [name, bundle] of [["dashboard/dist/index.js", dashboard], ["desktop/plugin.js", desktop]])
  // Every copy of react, react-dom and React's JSX runtime registers its element symbols.
  if (/Symbol\.for\(["']react\./.test(bundle)) fail(`${name} bundles its own React; it must use the host's`);

// ---- Plugin id -----------------------------------------------------------------------------
// Hermes installs the package in plugins/<plugin.yaml name> and copies its Desktop half to
// desktop-plugins/<that name>; it mounts the backend at /api/plugins/<manifest name>, only when
// that name is in `plugins.enabled`; the Desktop extension calls /api/plugins/<its id>. A
// mismatch is a 404 on every call, so all of them must be the same name.
const pluginNames = {
  "plugin.yaml name": /^name:\s*["']?([^"'\s#]+)/m.exec(read("plugin.yaml"))?.[1],
  "dashboard/manifest.json name": manifest.name,
  "desktop/plugin.js default export id": desktop ? defaultExportId(desktop) : undefined,
  "API_BASE (src/host/client.ts)": /export const API_BASE = "\/api\/plugins\/([^"]+)"/.exec(read("src/host/client.ts"))?.[1],
  "dashboard bundle register()": /__HERMES_PLUGINS__\?\.register\(\s*"([^"]+)"/.exec(dashboard)?.[1],
};
const distinctNames = new Set(Object.values(pluginNames));
if (distinctNames.size !== 1 || distinctNames.has(undefined))
  fail(
    "the plugin id is not the same everywhere Hermes reads it: " +
      Object.entries(pluginNames).map(([where, name]) => `${where} = ${name ?? "(not found)"}`).join("; "),
  );
else {
  // The dashboard bundle calls the route of that name (a stale build still calls the old one);
  // the Desktop extension reaches it through `ctx.rest` and its id, checked above.
  const [name] = distinctNames;
  if (dashboard && !dashboard.includes(`"/api/plugins/${name}"`))
    fail(`dashboard/dist/index.js does not call /api/plugins/${name}: rebuild it`);
}

// ---- Export template -----------------------------------------------------------------------
const viewer = read("hermes_atlas/assets/viewer.html");
if (viewer) {
  for (const marker of ["__ATLAS_EXPORT_DATA__", "__ATLAS_EXPORT_TITLE__", "__ATLAS_EXPORT_LANG__"])
    if (viewer.split(marker).length !== 2) fail(`viewer.html must contain ${marker} exactly once`);
  if (viewer.split("</script>").length !== 3) fail("viewer.html must contain exactly two script elements");
  if (viewer.split("</style>").length !== 2) fail("viewer.html must contain exactly one style element");
  // The element after the data block: the bundle's own text mentions "<script>" too.
  const opening = "</script>\n<script>";
  const script = viewer.slice(viewer.indexOf(opening) + opening.length, viewer.lastIndexOf("</script>"));
  const hash = createHash("sha256").update(script).digest("base64");
  if (!viewer.includes(`script-src 'sha256-${hash}'`)) fail("viewer.html Content-Security-Policy does not pin its script");
  if (/\bsrc=["']https?:|<link\b/i.test(viewer.slice(0, viewer.indexOf("<style>")))) fail("viewer.html must not load anything remote");
}

// ---- Standalone app ------------------------------------------------------------------------
if (!existsSync("hermes_atlas/static/index.html")) fail("hermes_atlas/static/index.html is missing: run vite build");

// ---- Sizes and versions --------------------------------------------------------------------
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (manifest.version !== version) fail(`dashboard/manifest.json is ${manifest.version}, package.json is ${version}`);
const report = [];
for (const path of ["dashboard/dist/index.js", "dashboard/dist/index.css", "desktop/plugin.js", "hermes_atlas/assets/viewer.html"]) {
  const bytes = size(path);
  report.push(`${path} ${(bytes / 1024).toFixed(0)} KB`);
  if (bytes >= SCANNER_FILE_LIMIT) fail(`${path} is ${(bytes / 1024).toFixed(0)} KB; Hermes's install scan reports files over 1024 KB`);
}

for (const message of warnings) console.warn("warning: " + message);
if (failures.length) {
  console.error("Bundle check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("bundles ok: " + report.join(" · "));
