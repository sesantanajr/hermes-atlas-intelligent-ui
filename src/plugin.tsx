import React from "react";
import { App } from "./App";
declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__?: {
      React: typeof React;
      fetchJSON: (url: string, init?: RequestInit) => Promise<unknown>;
    };
    __HERMES_PLUGINS__: {
      register: (name: string, component: typeof App) => void;
    };
  }
}
window.__HERMES_PLUGINS__.register("hermes-atlas", App);
