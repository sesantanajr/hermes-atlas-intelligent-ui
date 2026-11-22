// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { backgroundBehind, isDark, luminance, parseColor, useResolvedTheme } from "./theme";
import type { HostKind } from "./context";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
});

describe("reading colours", () => {
  it("parses the forms computed styles report", () => {
    expect(parseColor("rgb(20, 28, 23)")).toEqual({ r: 20, g: 28, b: 23, a: 1 });
    expect(parseColor("rgba(255, 255, 255, 0.5)")).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    expect(parseColor("color(srgb 1 0.5 0 / 50%)")).toEqual({ r: 255, g: 127.5, b: 0, a: 0.5 });
    expect(parseColor("transparent")).toBeNull();
  });

  it("measures luminance on the WCAG scale", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1);
  });

  it("tells dark from light, and refuses to judge what is see-through", () => {
    expect(isDark("rgb(4, 28, 28)")).toBe(true); // Hermes dashboard default
    expect(isDark("rgb(245, 247, 243)")).toBe(false);
    expect(isDark("oklch(0.21 0.03 190)")).toBe(true);
    expect(isDark("oklch(92% 0.01 90)")).toBe(false);
    expect(isDark("lab(30 10 10)")).toBe(true);
    expect(isDark("rgba(0, 0, 0, 0.04)")).toBeNull();
    expect(isDark("rgba(0, 0, 0, 0)")).toBeNull();
    expect(isDark("oklch(0.2 0.03 190 / 0.3)")).toBeNull();
  });
});

describe("the background behind Atlas", () => {
  it("walks up past transparent ancestors to the first painted one", () => {
    const outer = document.createElement("div");
    outer.style.backgroundColor = "rgb(12, 14, 20)";
    const middle = document.createElement("div");
    middle.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
    const inner = document.createElement("div");
    outer.append(middle);
    middle.append(inner);
    document.body.append(outer);
    expect(backgroundBehind(inner)).toBe("dark");
    outer.style.backgroundColor = "rgb(250, 250, 250)";
    expect(backgroundBehind(inner)).toBe("light");
    outer.remove();
    expect(backgroundBehind(null)).toBeNull();
  });
});

function Probe({ host, preference = "system" }: { host: HostKind; preference?: "system" | "light" | "dark" }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const theme = useResolvedTheme(preference, host, element);
  return (
    <div ref={setElement} data-testid="probe">
      {theme}
    </div>
  );
}

describe("useResolvedTheme", () => {
  it("follows the person's choice on its own", () => {
    render(<Probe host="standalone" preference="dark" />);
    expect(screen.getByTestId("probe").textContent).toBe("dark");
  });

  it("follows the host's painted background when embedded, and its theme switches", async () => {
    document.body.style.backgroundColor = "rgb(250, 249, 245)";
    render(<Probe host="desktop" preference="dark" />);
    expect(screen.getByTestId("probe").textContent).toBe("light");
    // A host theme switch rewrites attributes on <html>; the observer picks it up.
    await act(async () => {
      document.body.style.backgroundColor = "rgb(15, 17, 21)";
      document.documentElement.setAttribute("data-theme", "dark");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId("probe").textContent).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
  });
});
