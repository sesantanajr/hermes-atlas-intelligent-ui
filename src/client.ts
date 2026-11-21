import { Transport } from "./types";
const base = "/api/plugins/hermes-atlas";
export const defaultTransport: Transport = async (path, init) => {
  if (window.__HERMES_PLUGIN_SDK__)
    return window.__HERMES_PLUGIN_SDK__.fetchJSON(base + path, init);
  const response = await fetch(base + path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Não foi possível concluir (${response.status}).`,
    );
  }
  return response.json();
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
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
