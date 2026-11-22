/**
 * Verify the committed bundles against the rules their hosts enforce. Run by `npm run build`
 * and by CI; exits non-zero on the first broken rule.
 *
 * Hermes Desktop loader and catalogue lint (hermes_cli/plugin_validate_desktop.py,
 * apps/desktop/src/contrib/runtime-loader.ts):
 *   - plugin.js may import only react, react/jsx-runtime, react/jsx-dev-runtime and
 *     @hermes/plugin-sdk; no dynamic import, eval, new Function, script injection or reach into
 *     the app's own DOM;
 *   - it is one file, read whole (16 MiB cap), and the host loads no stylesheet beside it.
 * Hermes dashboard: one classic script that registers under the manifest's name and brings no
 * React of its own.
 * Install-time scanner (hermes_cli/plugins_install_scan.py): a file over 1 MiB is reported, so
 * every bundle stays under that.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : (fail(`${path} is missing: run npm run build`), ""));
const size = (path) => (existsSync(path) ? statSync(path).size : 0);
const SCANNER_FILE_LIMIT = 1024 * 1024;

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

const desktop = read("desktop/plugin.js");
if (desktop) {
  const stripped = desktop.replace(COMMENT, (whole, literal) => literal ?? whole.replace(/[^\n]/g, ""));
  const masked = stripped.replace(REGEX_LITERAL, (whole) => " ".repeat(whole.length));
  for (const [rule, pattern] of FORBIDDEN) {
    const haystack = rule === "script injection" ? masked : stripped;
    for (const match of haystack.matchAll(pattern))
      fail(`desktop/plugin.js: ${rule}: …${haystack.slice(Math.max(0, match.index - 40), match.index + 60)}…`);
  }
  for (const [cue, pattern] of REVIEW)
    if (pattern.test(stripped)) fail(`desktop/plugin.js: catalogue review cue "${cue}"`);
  const imports = [...desktop.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);
  for (const specifier of new Set(imports))
    if (!ALLOWED_IMPORTS.has(specifier)) fail(`desktop/plugin.js imports "${specifier}", which the Desktop loader refuses`);
  if (!imports.includes("@hermes/plugin-sdk")) fail("desktop/plugin.js does not import @hermes/plugin-sdk");
  if (/import\s*\{[^}]*\}\s*from\s*["']@hermes\/plugin-sdk["']/.test(desktop))
    fail("desktop/plugin.js uses named imports from @hermes/plugin-sdk: a name an older host lacks would fail the whole module; import the namespace");
  if (!/export\s*\{[^}]*\bas default\b|export default/.test(desktop)) fail("desktop/plugin.js has no default export");
  if (!desktop.includes('id:"hermes-atlas"')) fail('desktop/plugin.js default export must carry id "hermes-atlas" (the folder name)');
  if (existsSync("desktop/plugin.css")) fail("desktop/plugin.css exists, but the Desktop host never loads it: styles must be inlined");
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

if (failures.length) {
  console.error("Bundle check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("bundles ok: " + report.join(" · "));
