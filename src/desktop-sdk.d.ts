declare module "@hermes/plugin-sdk" {
  export type Atom<T> = {
    get(): T;
    subscribe(fn: (value: T) => void): () => void;
  };
  export const host: {
    state: {
      profile: Atom<string>;
      gateway: Atom<string>;
      focusedSessionId: Atom<string | null>;
      focusedSessionProfile: Atom<string>;
    };
    request: (method: string, params?: unknown) => Promise<unknown>;
  };
  export function useValue<T>(atom: Atom<T>): T;
  export function gatewayActivationEpoch(): number;
  export const ROUTES_AREA: string;
  export const SIDEBAR_NAV_AREA: string;
  export interface PluginContext {
    rest: (
      path: string,
      options?: { method?: string; body?: unknown; timeoutMs?: number },
    ) => Promise<unknown>;
    register: (entry: {
      id: string;
      area: string;
      title?: string;
      data?: unknown;
      render?: () => React.ReactNode;
    }) => () => void;
    onDispose: (fn: () => void) => void;
  }
}
