/**
 * Test double of Hermes Desktop's `@hermes/plugin-sdk`, aliased in vite.config.ts for tests
 * only. It has the members Atlas feature-detects; `setHost` simulates older or newer hosts.
 */
import { useSyncExternalStore } from "react";

type Listener<T> = (value: T) => void;

export function atom<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener(value));
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const composerCalls: { method: string; args: unknown[] }[] = [];

export const state = {
  profile: atom("default"),
  gateway: atom("local"),
  focusedSessionId: atom<string | null>("session-1"),
};

export let ROUTES_AREA: string | undefined = "routes";
export let SIDEBAR_NAV_AREA: string | undefined = "sidebar.nav";
export let TRANSCRIPT_DIRECTIVE_AREA: string | undefined = "transcript.directive";
export let TOOL_MEDIA_RENDERER_AREA: string | undefined = "transcript.toolMedia";

let epoch = 0;
export let gatewayActivationEpoch: (() => number) | undefined = () => epoch;

export const host = {
  state,
  navigate: (path: string) => composerCalls.push({ method: "navigate", args: [path] }),
  notify: (message: unknown) => composerCalls.push({ method: "notify", args: [message] }),
  composer: {
    insertText: async (sessionId: string | null, text: string, options?: unknown) => {
      composerCalls.push({ method: "insertText", args: [sessionId, text, options] });
      return true;
    },
    submit: (sessionId: string | null, text: string) => {
      composerCalls.push({ method: "submit", args: [sessionId, text] });
      return true;
    },
    focus: (sessionId: string | null) => composerCalls.push({ method: "focus", args: [sessionId] }),
  },
};

export function useValue<T>(value: { get(): T; subscribe(fn: Listener<T>): () => void }): T {
  return useSyncExternalStore((notify) => value.subscribe(notify), value.get, value.get);
}

/** Simulate another host: drop the transcript directive area (older Desktop), bump the epoch… */
export function setHost(options: { directives?: boolean; media?: boolean; epoch?: number; epochApi?: boolean }) {
  if (options.directives !== undefined)
    TRANSCRIPT_DIRECTIVE_AREA = options.directives ? "transcript.directive" : undefined;
  if (options.media !== undefined) TOOL_MEDIA_RENDERER_AREA = options.media ? "transcript.toolMedia" : undefined;
  if (options.epoch !== undefined) epoch = options.epoch;
  if (options.epochApi !== undefined)
    gatewayActivationEpoch = options.epochApi ? () => epoch : undefined;
}

export function resetHost() {
  ROUTES_AREA = "routes";
  SIDEBAR_NAV_AREA = "sidebar.nav";
  TRANSCRIPT_DIRECTIVE_AREA = "transcript.directive";
  TOOL_MEDIA_RENDERER_AREA = "transcript.toolMedia";
  epoch = 0;
  gatewayActivationEpoch = () => epoch;
  composerCalls.length = 0;
  state.focusedSessionId.set("session-1");
}
