/**
 * Hermes web dashboard tab.
 *
 * Built into `dashboard/dist/index.js`: a classic script that registers one component with the
 * dashboard's plugin registry. React is the dashboard's own instance (taken from
 * `window.__HERMES_PLUGIN_SDK__`, never bundled), requests go through the SDK's authenticated
 * helpers, and colours come from the dashboard theme variables.
 */
import React, { useEffect } from "react";
import "../theme";
import { App } from "../app/App";
import { detectLocale, setLocale } from "../i18n";
import type { Host } from "./context";

type DashboardSdk = {
  sdkVersion?: string;
  useI18n?: () => { locale?: string };
};
declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__?: DashboardSdk & { [key: string]: unknown };
    __HERMES_PLUGINS__?: {
      register: (name: string, component: React.ComponentType) => void;
    };
  }
}

const host: Host = { kind: "dashboard" };

function DashboardAtlas() {
  // Follow the dashboard's language when its SDK exposes one (SDK 1.1+).
  const locale = window.__HERMES_PLUGIN_SDK__?.useI18n?.().locale;
  useEffect(() => {
    setLocale(detectLocale(locale));
  }, [locale]);
  return <App host={host} />;
}

// The name must equal `name` in dashboard/manifest.json.
window.__HERMES_PLUGINS__?.register("hermes-atlas", DashboardAtlas);
