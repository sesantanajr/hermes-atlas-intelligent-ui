/**
 * Light or dark?
 *
 * On its own, Atlas follows the person's choice or the system setting. Inside Hermes it takes its
 * colours from the host's theme variables (see theme/tokens.css) and only needs to know whether
 * that theme is light or dark, to pick chart colours that contrast with it. Hermes themes are
 * arbitrary palettes, so that is measured from the background actually painted behind Atlas.
 */
import { useEffect, useState } from "react";
import type { HostKind } from "./context";

export type Theme = "light" | "dark";
export type ThemePreference = "system" | "light" | "dark";

/** Parse `rgb(…)`, `rgba(…)` and `color(srgb …)` as computed styles report them. */
export function parseColor(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const numbers = value.match(/-?\d*\.?\d+(?:e-?\d+)?%?/g);
  if (!numbers || numbers.length < 3) return null;
  const unit = value.trim().startsWith("color(") ? 255 : 1;
  const channel = (raw: string, scale: number) =>
    raw.endsWith("%") ? (parseFloat(raw) / 100) * 255 : parseFloat(raw) * scale;
  const alpha = numbers[3];
  return {
    r: channel(numbers[0], unit),
    g: channel(numbers[1], unit),
    b: channel(numbers[2], unit),
    a:
      alpha === undefined
        ? 1
        : alpha.endsWith("%")
          ? parseFloat(alpha) / 100
          : parseFloat(alpha),
  };
}

/** Relative luminance (WCAG) of an sRGB colour, 0 = black, 1 = white. */
export function luminance(color: { r: number; g: number; b: number }): number {
  const linear = (c: number) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b)
  );
}

/**
 * Whether a computed colour is dark, or `null` when it is (mostly) transparent or unreadable.
 * Browsers report perceptual spaces as written (`oklch(0.21 0.03 190)`), so their lightness
 * component is read directly instead of being mistaken for RGB.
 */
export function isDark(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  const perceptual = /^(oklch|oklab|lch|lab)\(/.exec(text);
  if (perceptual) {
    const numbers = text.match(/-?\d*\.?\d+%?/g);
    if (!numbers) return null;
    const alpha = text.includes("/") ? parseFloat(numbers[numbers.length - 1]) : 1;
    if ((numbers[numbers.length - 1].endsWith("%") ? alpha / 100 : alpha) <= 0.5)
      return null;
    const first = numbers[0];
    const scale = perceptual[1].startsWith("ok") ? 1 : 100;
    const lightness = first.endsWith("%")
      ? parseFloat(first) / 100
      : parseFloat(first) / scale;
    return lightness < 0.6;
  }
  const color = parseColor(text);
  if (!color || color.a <= 0.5) return null;
  return luminance(color) < 0.4;
}

/** The first opaque background painted behind `element`, walking up to the page. */
export function backgroundBehind(element: Element | null): Theme | null {
  for (let node = element; node; node = node.parentElement) {
    const dark = isDark(getComputedStyle(node).backgroundColor);
    if (dark !== null) return dark ? "dark" : "light";
  }
  return null;
}

const edge = (style: CSSStyleDeclaration) =>
  (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);

/**
 * How tall `element` may be: from its top edge to the bottom of the nearest box around it that
 * has a height of its own (a Hermes Desktop pane), or of the window, less the padding of the
 * boxes in between. A box whose height follows its content (a dashboard page section) bounds
 * nothing: measuring against it would keep Atlas at whatever height it had, even after the
 * window grows. To tell the two apart, Atlas briefly changes its own height and sees which
 * boxes follow. Everything is restored before the browser paints.
 */
export function measureAvailableHeight(element: HTMLElement): number {
  const top = element.getBoundingClientRect().top;
  const chain: HTMLElement[] = [];
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement)
    chain.push(node);
  const before = chain.map((node) => node.getBoundingClientRect().height);
  const { height, minHeight } = element.style;
  element.style.minHeight = "0px";
  element.style.height = `${element.getBoundingClientRect().height + 97}px`;
  let bottom = window.innerHeight;
  let inset = 0;
  for (const [index, node] of chain.entries()) {
    const box = node.getBoundingClientRect();
    if (Math.abs(box.height - before[index]) < 0.5) {
      bottom = Math.min(bottom, box.top + node.clientHeight - (parseFloat(getComputedStyle(node).paddingBottom) || 0));
      break;
    }
    inset += edge(getComputedStyle(node));
  }
  element.style.height = height;
  element.style.minHeight = minHeight;
  return Math.max(420, Math.floor(bottom - inset - top));
}

/**
 * Height the workspace may take when it is embedded (see `measureAvailableHeight`). On its own
 * Atlas simply fills the window.
 */
export function useAvailableHeight(element: HTMLElement | null, host: HostKind): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!element || host === "standalone") {
      setHeight(null);
      return;
    }
    const measure = () => setHeight(measureAvailableHeight(element));
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver !== "undefined" && element.parentElement
        ? new ResizeObserver(measure)
        : null;
    if (element.parentElement) observer?.observe(element.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [element, host]);
  return height;
}

function systemTheme(): Theme {
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useResolvedTheme(
  preference: ThemePreference,
  host: HostKind,
  element: Element | null,
): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    preference === "system" ? systemTheme() : preference,
  );
  useEffect(() => {
    const embedded = host !== "standalone";
    const measure = () => {
      if (embedded) setTheme(backgroundBehind(element) ?? systemTheme());
      else setTheme(preference === "system" ? systemTheme() : preference);
    };
    measure();
    const media =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-color-scheme: dark)")
        : null;
    media?.addEventListener?.("change", measure);
    // A host theme switch rewrites attributes on <html>; nothing inside Atlas changes.
    const observer =
      embedded && typeof MutationObserver !== "undefined"
        ? new MutationObserver(measure)
        : null;
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-theme", "data-layout-variant"],
    });
    return () => {
      media?.removeEventListener?.("change", measure);
      observer?.disconnect();
    };
  }, [preference, host, element]);
  return theme;
}
