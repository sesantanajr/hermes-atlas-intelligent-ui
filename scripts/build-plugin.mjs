import { build } from "esbuild";
await build({
  entryPoints: ["src/plugin.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "dashboard/dist/index.js",
  loader: { ".webp": "dataurl", ".mp3": "dataurl", ".mp4": "dataurl" },
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  plugins: [
    {
      name: "host-react",
      setup(b) {
        b.onResolve({ filter: /^react$/ }, () => ({
          path: "react",
          namespace: "host",
        }));
        b.onLoad({ filter: /.*/, namespace: "host" }, () => ({
          contents:
            "const R=window.__HERMES_PLUGIN_SDK__.React; export default R; export const {useState,useEffect,useMemo,useRef,createElement,forwardRef,createContext,useContext,useCallback,useId}=R;",
          loader: "js",
        }));
      },
    },
  ],
});

import { readFile, appendFile } from "node:fs/promises";
await build({
  entryPoints: ["src/desktop.tsx"],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: "desktop/plugin.js",
  loader: { ".webp": "dataurl", ".mp3": "dataurl", ".mp4": "dataurl" },
  external: ["react", "react/jsx-runtime", "@hermes/plugin-sdk"],
  jsx: "automatic",
});
await appendFile(
  "desktop/plugin.js",
  "\nconst ATLAS_STYLES=" +
    JSON.stringify(await readFile("desktop/plugin.css", "utf8")) +
    ";\n",
);
