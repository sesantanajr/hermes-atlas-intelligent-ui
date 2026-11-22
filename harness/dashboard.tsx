/**
 * The built dashboard tab (`dashboard/dist/index.js`) inside a dashboard-like page: the plugin
 * SDK globals the Hermes web dashboard provides, its theme variables and its language. Development
 * only: `npm run dev`, then open /harness/dashboard.html (?lang=en, ?theme=light).
 */
import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get("theme") ?? "dark";
const locale = params.get("lang") ?? "pt";

// (The Window typings for these globals come from src/host/dashboard.tsx.)
window.__HERMES_PLUGIN_SDK__ = {
  sdkVersion: "1.1.0",
  React,
  hooks: { useSyncExternalStore },
  // The dashboard adds its session token; the harness talks to the loopback backend directly.
  authedFetch: (url: string, init?: RequestInit) => fetch(url, init),
  fetchJSON: async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  useI18n: () => ({ locale, setLocale: () => undefined, t: {} }),
};

window.__HERMES_PLUGINS__ = {
  register(name, Component) {
    if (name !== "hermes-atlas") throw new Error(`registered as ${name}, expected hermes-atlas`);
    createRoot(document.getElementById("root")!).render(
      <div className="dashboard-page">
        <header>Hermes · Atlas</header>
        <section>
          <Component />
        </section>
      </div>,
    );
  },
};

const script = document.createElement("script");
script.src = "/dashboard/dist/index.js";
document.body.appendChild(script);
