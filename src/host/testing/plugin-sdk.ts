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
  connectionId: atom<string | null>("local"),
  // The WebSocket's state, as Desktop reports it: not an identity.
  gateway: atom("open"),
  focusedSessionId: atom<string | null>("session-1"),
};

// The values Hermes Desktop exports (apps/desktop/src/sdk).
export let ROUTES_AREA: string | undefined = "routes";
export let SIDEBAR_NAV_AREA: string | undefined = "sidebar.nav";
export let TRANSCRIPT_DIRECTIVE_AREA: string | undefined = "transcript.directives";
export let TOOL_MEDIA_RENDERER_AREA: string | undefined = "transcript.toolMedia";

const epoch = atom(0);
export let gatewayActivationEpoch: (() => number) | undefined = () => epoch.get();
export let useGatewayActivationEpoch: (() => number) | undefined = () => useValue(epoch);

let submitted = true;
const request = async (method: string, params?: unknown) => {
  composerCalls.push({ method: "request", args: [method, params] });
  return { ok: true };
};
// Desktop answers only through a composer on screen: `false` when the chat is not visible.
const submit = (sessionId: string | null, text: string) => {
  composerCalls.push({ method: "submit", args: [sessionId, text] });
  return submitted;
};

export const host: {
  state: typeof state;
  navigate: (path: string) => void;
  notify: (message: unknown) => void;
  request?: (method: string, params?: unknown) => Promise<unknown>;
  composer: {
    insertText: (sessionId: string | null, text: string, options?: unknown) => Promise<boolean>;
    submit?: (sessionId: string | null, text: string) => boolean;
    focus: (sessionId: string | null) => void;
  };
} = {
  state,
  navigate: (path: string) => void composerCalls.push({ method: "navigate", args: [path] }),
  notify: (message: unknown) => void composerCalls.push({ method: "notify", args: [message] }),
  request,
  composer: {
    insertText: async (sessionId: string | null, text: string, options?: unknown) => {
      composerCalls.push({ method: "insertText", args: [sessionId, text, options] });
      return true;
    },
    submit,
    focus: (sessionId: string | null) => void composerCalls.push({ method: "focus", args: [sessionId] }),
  },
};

export function useValue<T>(value: { get(): T; subscribe(fn: Listener<T>): () => void }): T {
  return useSyncExternalStore((notify) => value.subscribe(notify), value.get, value.get);
}

/** Simulate another host: drop an area (older Desktop), move the route activation, hide the chat… */
export function setHost(options: {
  directives?: boolean;
  media?: boolean;
  /** A new activation of the gateway route (same-profile source swaps included). */
  epoch?: number;
  epochApi?: boolean;
  /** Whether the host exports `useGatewayActivationEpoch`. */
  epochHook?: boolean;
  /** What `composer.submit` answers: false while the chat's composer is not on screen. */
  submit?: boolean;
  /** Whether the host has `composer.submit` at all (Desktop releases before the composer API). */
  submitApi?: boolean;
  /** Whether the host has `host.request` (the gateway JSON-RPC door). */
  request?: boolean;
}) {
  if (options.submitApi !== undefined) host.composer.submit = options.submitApi ? submit : undefined;
  if (options.directives !== undefined)
    TRANSCRIPT_DIRECTIVE_AREA = options.directives ? "transcript.directives" : undefined;
  if (options.media !== undefined) TOOL_MEDIA_RENDERER_AREA = options.media ? "transcript.toolMedia" : undefined;
  if (options.epoch !== undefined) epoch.set(options.epoch);
  if (options.epochApi !== undefined)
    gatewayActivationEpoch = options.epochApi ? () => epoch.get() : undefined;
  if (options.epochHook !== undefined)
    useGatewayActivationEpoch = options.epochHook ? () => useValue(epoch) : undefined;
  if (options.submit !== undefined) submitted = options.submit;
  if (options.request !== undefined) host.request = options.request ? request : undefined;
}

export function resetHost() {
  ROUTES_AREA = "routes";
  SIDEBAR_NAV_AREA = "sidebar.nav";
  TRANSCRIPT_DIRECTIVE_AREA = "transcript.directives";
  TOOL_MEDIA_RENDERER_AREA = "transcript.toolMedia";
  epoch.set(0);
  gatewayActivationEpoch = () => epoch.get();
  useGatewayActivationEpoch = () => useValue(epoch);
  submitted = true;
  host.composer.submit = submit;
  host.request = request;
  composerCalls.length = 0;
  state.profile.set("default");
  state.connectionId.set("local");
  state.gateway.set("open");
  state.focusedSessionId.set("session-1");
}
