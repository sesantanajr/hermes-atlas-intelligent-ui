/**
 * A stand-in for Hermes Desktop's `@hermes/plugin-sdk`, for looking at the built extension
 * (`desktop/plugin.js`) in a browser: `npm run dev`, then open /harness/desktop.html. vite.config.ts
 * points the module name here while serving. It implements the members Atlas uses, nothing more.
 */
import { useSyncExternalStore } from "react";

type Listener<T> = (value: T) => void;
export type Atom<T> = { get(): T; set(value: T): void; subscribe(fn: Listener<T>): () => void };

export function atom<T>(initial: T): Atom<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((listener) => listener(value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type Contribution = {
  id: string;
  area: string;
  title?: string;
  data?: unknown;
  render?: () => unknown;
};

export const ROUTES_AREA = "routes";
export const SIDEBAR_NAV_AREA = "sidebar.nav";
export const TRANSCRIPT_DIRECTIVE_AREA = "transcript.directive";
export const TOOL_MEDIA_RENDERER_AREA = "transcript.toolMedia";

/** Harness state, shown by harness/desktop.tsx. */
export const contributions = atom<Contribution[]>([]);
export const route = atom("/chat");
export const composer = atom("");
export const toasts = atom<string[]>([]);
const listeners = new Map<string, Set<(event: { type: string; payload?: unknown }) => void>>();

export const host = {
  state: {
    profile: atom("default"),
    gateway: atom("local"),
    focusedSessionId: atom<string | null>("harness-session"),
  },
  navigate: (path: string) => route.set(path),
  notify: ({ message }: { message: string }) => toasts.set([...toasts.get(), message].slice(-3)),
  composer: {
    insertText: async (_sessionId: string | null, text: string) => {
      composer.set(composer.get() ? `${composer.get()}\n\n${text}` : text);
      return true;
    },
    submit: (_sessionId: string | null, text: string) => {
      toasts.set([...toasts.get(), `submit: ${text.slice(0, 60)}`]);
      return true;
    },
    focus: () => document.querySelector<HTMLTextAreaElement>("#harness-composer")?.focus(),
  },
};

export function useValue<T>(value: { get(): T; subscribe(fn: Listener<T>): () => void }): T {
  return useSyncExternalStore((notify) => value.subscribe(notify), value.get, value.get);
}

export const gatewayActivationEpoch = () => 0;

/** What Desktop hands a plugin's `register(ctx)`; `rest` reaches the Atlas backend through Vite's proxy. */
export function pluginContext() {
  return {
    rest: async (path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? "GET";
      const response = await fetch(`/api/plugins/hermes-atlas${path}`, {
        method,
        headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body.detail ?? `HTTP ${response.status}`), { status: response.status });
      }
      return response.status === 204 ? null : response.json();
    },
    register: (entry: Contribution) => {
      contributions.set([...contributions.get(), entry]);
      return () => contributions.set(contributions.get().filter((item) => item !== entry));
    },
    onDispose: () => undefined,
    onEvent: (type: string, listener: (event: { type: string; payload?: unknown }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
      return () => void listeners.get(type)?.delete(listener);
    },
  };
}

/** Deliver a backend event the way Desktop relays `broadcast_plugin_event`. */
export function emit(type: string, payload: unknown) {
  listeners.get(type)?.forEach((listener) => listener({ type, payload }));
}
