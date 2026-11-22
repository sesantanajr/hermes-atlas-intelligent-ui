/**
 * Talking to the Atlas backend (`/api/plugins/atlas-intelligent-ui/...`).
 *
 * A transport takes a path relative to that prefix and returns the decoded JSON. Each host has
 * its own: the standalone app uses `fetch`; the Hermes dashboard supplies authenticated helpers
 * on `window.__HERMES_PLUGIN_SDK__`; Hermes Desktop passes `ctx.rest`. Credentials never reach
 * this code.
 */
import { serverText, t } from "../i18n";
import type { Transport } from "../types";

export const API_BASE = "/api/plugins/atlas-intelligent-ui";

export class ApiError extends Error {
  status: number;
  /** What the Atlas server (or Hermes in front of it) wrote as `detail`, untranslated; "" if none. */
  detail: string;
  constructor(message: string, status: number, detail = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** The server's answer for a canvas (or revision) that is not in the library. Hermes answers 404
 *  too when the plugin's backend is not mounted or not enabled, with its own detail. */
export const CANVAS_NOT_FOUND = "Canvas não encontrado.";
/** The server's answer when a draft names a revision that no longer exists. */
export const REVISION_NOT_FOUND = "Versão do canvas não encontrada.";

/** Whether `error` says the canvas itself is gone, as opposed to a backend that is unreachable,
 *  not enabled, or addressed under another plugin name. */
export function isCanvasMissing(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.detail === CANVAS_NOT_FOUND;
}

/** The `detail` an error body carries: FastAPI's JSON, or a short plain-text body. */
function detailOf(body: string): string {
  const text = body.trim();
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
      if (typeof parsed.detail === "string") return parsed.detail;
      return typeof parsed.error === "string" ? parsed.error : "";
    } catch {
      /* not JSON after all */
    }
  }
  return text.startsWith("<") ? "" : text;
}

/**
 * An error a host transport threw, as an ApiError with the HTTP status and the server's `detail`.
 * Hermes Desktop rejects `ctx.rest` with `Error invoking remote method 'hermes:api': Error: 409:
 * {"detail":"…"}` (no status property survives IPC); its Webapp and older dashboard SDKs throw
 * `409: {"detail":"…"}`; newer dashboard SDKs and the harness attach `status` (and `body`).
 */
export function hostError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^[A-Za-z]*Error:\s*/, "");
  const extra = (error ?? {}) as { status?: unknown; body?: unknown };
  const http = /^([1-5]\d\d):\s*([\s\S]*)$/.exec(message);
  let status = 0;
  let detail = "";
  if (http) {
    status = Number(http[1]);
    detail = detailOf(http[2]);
  } else if (typeof extra.status === "number") {
    status = extra.status;
    detail = typeof extra.body === "string" ? detailOf(extra.body) : message;
  } else status = Number(/\b([45]\d\d)\b/.exec(message)?.[1] ?? 0);
  const text = detail || (http ? t("Não foi possível concluir ({status}).", { status }) : message);
  return new ApiError(serverText(text), status, detail);
}

type DashboardSdk = {
  fetchJSON?: (url: string, init?: RequestInit) => Promise<unknown>;
  authedFetch?: (url: string, init?: RequestInit) => Promise<Response>;
};

async function decode(response: Response): Promise<unknown> {
  if (response.ok) return response.status === 204 ? null : response.json();
  const body = await response.json().catch(() => ({}));
  const detail = typeof body?.detail === "string" ? body.detail : "";
  throw new ApiError(
    detail
      ? serverText(detail)
      : t("Não foi possível concluir ({status}).", { status: response.status }),
    response.status,
    detail,
  );
}

export const defaultTransport: Transport = async (path, init) => {
  const sdk = (window as { __HERMES_PLUGIN_SDK__?: DashboardSdk })
    .__HERMES_PLUGIN_SDK__;
  // `authedFetch` returns the raw response, so the server's own explanation reaches the person.
  if (sdk?.authedFetch) return decode(await sdk.authedFetch(API_BASE + path, init));
  if (sdk?.fetchJSON)
    return sdk.fetchJSON(API_BASE + path, init).catch((error: unknown) => {
      throw hostError(error);
    });
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
