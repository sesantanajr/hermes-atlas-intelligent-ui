import { describe, expect, it, vi } from "vitest";
import type { Api } from "./client";

describe("sayHello", () => {
  it("delivers the language chosen in Hermes even when a later caller without a callback retries", async () => {
    // The handshake is sent once per page: a fresh copy of the module for this test.
    vi.resetModules();
    const { sayHello } = await import("./hello");
    let reachable = false;
    const calls: string[] = [];
    const api = (async (path: string) => {
      calls.push(path);
      if (!reachable) throw new Error("the gateway is not up yet");
      return { locale: "en" };
    }) as unknown as Api;
    const onLocale = vi.fn();
    sayHello(api, "desktop", onLocale); // at registration, before the backend answers
    await new Promise((resolve) => setTimeout(resolve, 0));
    reachable = true;
    sayHello(api, "desktop"); // the first inline canvas drawn
    await vi.waitFor(() => expect(onLocale).toHaveBeenCalledWith("en"));
    sayHello(api, "desktop");
    expect(calls).toEqual(["/clients/desktop", "/clients/desktop"]); // once it succeeded, no more
  });
});
