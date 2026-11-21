import React, { useMemo } from "react";
import {
  host,
  useValue,
  gatewayActivationEpoch,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type PluginContext,
} from "@hermes/plugin-sdk";
import { App } from "./App";
import { Transport } from "./types";
declare const ATLAS_STYLES: string;

function DesktopAtlas({ ctx }: { ctx: PluginContext }) {
  const profile = useValue(host.state.profile);
  const connection = useValue(host.state.gateway);
  const sessionId = useValue(host.state.focusedSessionId);
  const epoch = gatewayActivationEpoch();
  const transport = useMemo<Transport>(
    () => async (path, init) => {
      if (gatewayActivationEpoch() !== epoch)
        throw new Error("A conexão do Desktop mudou. Reabra o Atlas.");
      const scope = new Headers(init?.headers).get("X-Atlas-Workspace");
      const query = scope
        ? `${path.includes("?") ? "&" : "?"}atlas_scope=${encodeURIComponent(scope)}`
        : "";
      const result = await ctx.rest(path + query, {
        method: init?.method,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        timeoutMs: 30000,
      });
      if (gatewayActivationEpoch() !== epoch)
        throw new Error("Resposta descartada porque a conexão mudou.");
      return result;
    },
    [ctx, epoch, profile, connection],
  );
  const nativeContext = useMemo(() => {
    let pending: { text: string; submission_id: string } | null = null;
    return {
      sessionId,
      send: async (text: string) => {
        if (
          !sessionId ||
          host.state.focusedSessionId.get() !== sessionId ||
          gatewayActivationEpoch() !== epoch ||
          host.state.focusedSessionProfile.get() !== host.state.profile.get()
        )
          throw new Error(
            "Ative a sessão e o perfil de destino antes de enviar.",
          );
        if (!pending || pending.text !== text)
          pending = { text, submission_id: crypto.randomUUID() };
        await host.request("prompt.submit", {
          session_id: sessionId,
          submission_id: pending.submission_id,
          text,
        });
        pending = null;
      },
    };
  }, [sessionId, epoch]);
  return (
    <App
      key={`${profile}:${epoch}`}
      transport={transport}
      nativeContext={nativeContext}
    />
  );
}

export default {
  id: "hermes-atlas",
  name: "Hermes Atlas Intelligent UI",
  register(ctx: PluginContext) {
    const style = document.createElement("style");
    style.dataset.hermesAtlas = "true";
    style.textContent = ATLAS_STYLES;
    document.head.appendChild(style);
    ctx.onDispose(() => style.remove());
    ctx.register({
      id: "page",
      area: ROUTES_AREA,
      title: "Atlas",
      data: { path: "/atlas" },
      render: () => React.createElement(DesktopAtlas, { ctx }),
    });
    ctx.register({
      id: "navigation",
      area: SIDEBAR_NAV_AREA,
      data: { path: "/atlas", label: "Atlas", codicon: "sparkle" },
    });
  },
};
