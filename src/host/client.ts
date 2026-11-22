/**
 * Talking to the Atlas backend (`/api/plugins/hermes-atlas/...`).
 *
 * A transport takes a path relative to that prefix and returns the decoded JSON. Each host has
 * its own: the standalone app uses `fetch`; the Hermes dashboard supplies authenticated helpers
 * on `window.__HERMES_PLUGIN_SDK__`; Hermes Desktop passes `ctx.rest`. Credentials never reach
 * this code.
 */
import { serverText, t } from "../i18n";
import type { Transport } from "../types";

export const API_BASE = "/api/plugins/hermes-atlas";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type DashboardSdk = {
  fetchJSON?: (url: string, init?: RequestInit) => Promise<unknown>;
  authedFetch?: (url: string, init?: RequestInit) => Promise<Response>;
};

async function decode(response: Response): Promise<unknown> {
  if (response.ok) return response.status === 204 ? null : response.json();
  const body = await response.json().catch(() => ({}));
  throw new ApiError(
    typeof body?.detail === "string"
      ? serverText(body.detail)
      : t("Não foi possível concluir ({status}).", { status: response.status }),
    response.status,
  );
}

export const defaultTransport: Transport = async (path, init) => {
  const sdk = (window as { __HERMES_PLUGIN_SDK__?: DashboardSdk })
    .__HERMES_PLUGIN_SDK__;
  // `authedFetch` returns the raw response, so the server's own explanation reaches the person.
  if (sdk?.authedFetch) return decode(await sdk.authedFetch(API_BASE + path, init));
  if (sdk?.fetchJSON) return sdk.fetchJSON(API_BASE + path, init);
  return decode(await fetch(API_BASE + path, init));
};

export function createClient(transport: Transport = defaultTransport) {
  let scope = "";
  return {
    scope(value: string) {
      scope = value;
    },
    async request<T>(
      path: string,
      data?: unknown,
      method?: string,
    ): Promise<T> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (scope && path !== "/status") headers["X-Atlas-Workspace"] = scope;
      return transport(path, {
        method: method || (data === undefined ? "GET" : "POST"),
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      }) as Promise<T>;
    },
  };
}
export type Api = ReturnType<typeof createClient>["request"];

export function downloadText(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function download(name: string, data: unknown) {
  downloadText(name, JSON.stringify(data, null, 2));
}
