/** The Atlas version this bundle was built from (package.json, injected by the build). */
declare const __ATLAS_VERSION__: string | undefined;

export const VERSION: string =
  typeof __ATLAS_VERSION__ === "string" ? __ATLAS_VERSION__ : "dev";
