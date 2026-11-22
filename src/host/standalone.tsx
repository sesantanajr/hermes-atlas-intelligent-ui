/** The standalone app: `hermes atlas serve` (or `atlas-intelligent-ui serve`) on http://127.0.0.1:7331. */
import React from "react";
import { createRoot } from "react-dom/client";
import "../theme";
import { App } from "../app/App";
import { detectLocale, setLocale } from "../i18n";
import { standaloneHost } from "./context";

document.body.style.margin = "0";
setLocale(detectLocale(new URLSearchParams(location.search).get("lang")));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App host={standaloneHost} />
  </React.StrictMode>,
);
