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
/** Kept per kind, so a handshake retried by a caller that passes none still delivers the language. */
const localeListeners = new Map<HostKind, (locale: string) => void>();

/** What a front end can draw, sent with every handshake of that kind (`tool_media`, `directive`). */
export function declareFeatures(kind: HostKind, features: string[]) {
  capabilities.set(kind, [...new Set(features)].sort());
}

/**
 * Once per page and kind. `onLocale` receives the language the person chose in Hermes (the
 * plugin's `locale` setting or Hermes's `display.language`), when they chose one; it is remembered
 * for the kind, so it still runs when the first attempt failed and a later caller retries.
 */
export function sayHello(api: Api, kind: HostKind, onLocale?: (locale: string) => void) {
  if (onLocale) localeListeners.set(kind, onLocale);
  if (announced.has(kind)) return;
  announced.add(kind);
  api<{ locale?: unknown } | null>(`/clients/${kind}`, {
    version: VERSION,
    features: capabilities.get(kind) ?? [],
  })
    .then((reply) => {
      const locale = reply?.locale;
      if (typeof locale === "string" && locale !== "auto") localeListeners.get(kind)?.(locale);
    })
    .catch(() => {
      announced.delete(kind); // the backend was not reachable yet: try again on the next occasion
    });
}
