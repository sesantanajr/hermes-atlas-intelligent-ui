/**
 * Tell the backend which Atlas front end is in use, and what it can draw.
 *
 * The agent's tools read this before choosing how a reply shows a canvas: as a `MEDIA:` page the
 * Desktop extension turns into the live canvas (`tool_media`), as the `::atlas{...}` directive
 * (Desktop releases without tool media renderers), or as text.
 */
import { VERSION } from "../version";
import type { Api } from "./client";
import type { HostKind } from "./context";

const announced = new Set<HostKind>();
const capabilities = new Map<HostKind, string[]>();

/** What a front end can draw, sent with every handshake of that kind (`tool_media`, `directive`). */
export function declareFeatures(kind: HostKind, features: string[]) {
  capabilities.set(kind, [...new Set(features)].sort());
}

/**
 * Once per page and kind. `onLocale` receives the language the person chose in Hermes (the
 * plugin's `locale` setting or Hermes's `display.language`), when they chose one.
 */
export function sayHello(api: Api, kind: HostKind, onLocale?: (locale: string) => void) {
  if (announced.has(kind)) return;
  announced.add(kind);
  api<{ locale?: unknown } | null>(`/clients/${kind}`, {
    version: VERSION,
    features: capabilities.get(kind) ?? [],
  })
    .then((reply) => {
      const locale = reply?.locale;
      if (typeof locale === "string" && locale !== "auto") onLocale?.(locale);
    })
    .catch(() => {
      announced.delete(kind); // the backend was not reachable yet: try again on the next occasion
    });
}
