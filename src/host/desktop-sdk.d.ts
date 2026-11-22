/**
 * The part of the Hermes Desktop plugin SDK that Atlas uses.
 *
 * The SDK has no version handshake: a host keeps the exports it had and adds new ones over time,
 * and a *named* import of an export the running host lacks fails the whole module. Atlas
 * therefore imports the namespace (`import * as sdk`) and feature-detects, which is why every
 * member here is optional. Source of truth: apps/desktop/src/sdk in NousResearch/hermes-agent
 * and website/docs/developer-guide/desktop-plugin-sdk.md.
 */
declare module "@hermes/plugin-sdk" {
  import type { ReactNode } from "react";

  export type Atom<T> = {
    get(): T;
    subscribe(fn: (value: T) => void): () => void;
  };
  export type GatewayEvent = {
    type: string;
    payload?: { [key: string]: unknown };
    session_id?: string;
  };
  export type Contribution = {
    id: string;
    area: string;
    title?: string;
    order?: number;
    data?: unknown;
    render?: () => ReactNode;
  };
  export interface PluginContext {
    readonly source?: string;
    rest: (
      path: string,
      options?: { method?: string; body?: unknown; timeoutMs?: number },
    ) => Promise<unknown>;
    register: (entry: Contribution) => () => void;
    onDispose: (fn: () => void) => void;
    onEvent?: (type: string, listener: (event: GatewayEvent) => void) => () => void;
  }
  export type TranscriptDirectiveProps = {
    attrs: Readonly<{ [key: string]: string }>;
    source: string;
    streaming: boolean;
    sessionId?: string | null;
  };

  export const host:
    | {
        state?: {
          profile?: Atom<string>;
          gateway?: Atom<string>;
          focusedSessionId?: Atom<string | null>;
          focusedSessionProfile?: Atom<string>;
        };
        request?: (method: string, params?: unknown) => Promise<unknown>;
        navigate?: (path: string) => void;
        notify?: (message: {
          kind: "info" | "warning" | "error" | "success";
          message: string;
          title?: string;
        }) => void;
        composer?: {
          insertText?: (
            sessionId: string | null,
            text: string,
            options?: { mode?: "block" | "inline" | "prefix" },
          ) => Promise<boolean>;
          submit?: (sessionId: string | null, text: string) => boolean;
          focus?: (sessionId: string | null) => void;
        };
      }
    | undefined;
  /** A file an Atlas tool produced, attached to a reply with a `MEDIA:` line. */
  export type ToolMediaRendererProps = {
    file: {
      path: string;
      name: string;
      kind: string;
      mime: string;
      resolveUrl: () => Promise<string>;
    };
    toolName: string;
    toolCallId: string;
    args: Readonly<{ [key: string]: unknown }>;
    result: unknown;
    sessionId: string | null;
    /** Desktop's own file card, for anything the plugin does not draw. */
    fallback: ReactNode;
  };

  export const useValue: (<T>(atom: Atom<T>) => T) | undefined;
  export const gatewayActivationEpoch: (() => number) | undefined;
  export const ROUTES_AREA: string | undefined;
  export const SIDEBAR_NAV_AREA: string | undefined;
  export const TRANSCRIPT_DIRECTIVE_AREA: string | undefined;
  /** `transcript.toolMedia`: draw the files the package's own tools produced. */
  export const TOOL_MEDIA_RENDERER_AREA: string | undefined;
}
