/**
 * What the application hosting Atlas offers. The workspace and the inline canvas are the same
 * components in every host; the differences are passed in through this object.
 */
export type HostKind = "standalone" | "dashboard" | "desktop";

export type Host = {
  kind: HostKind;
  /**
   * Put text in the composer of the chat the person is using in the host application
   * (Hermes Desktop). Resolves `false` when no visible composer took it.
   */
  insertIntoChat?: (
    text: string,
    sessionId?: string | null,
  ) => Promise<boolean>;
  /** The native chat session Atlas can send to directly, when the host exposes one. */
  native?: { sessionId: string | null; send: (text: string) => Promise<void> };
  /** Open the Atlas workspace on a canvas (from an inline canvas in the host's chat). */
  openWorkspace?: (canvasId: string, revision?: number) => void;
  /** Show a brief message through the host's own notification surface. */
  notify?: (message: string, kind?: "info" | "warning" | "error") => void;
  /** The host's clipboard door (Hermes Desktop's `ctx.os.writeClipboard`): resolves false when it
   *  could not copy. Without one, the browser's Clipboard API is used. */
  writeClipboard?: (text: string) => Promise<boolean>;
};

export const standaloneHost: Host = { kind: "standalone" };

/** Copy `text` through the host when it offers a clipboard, else the browser's. */
export async function copyText(host: Host, text: string): Promise<boolean> {
  if (host.writeClipboard) return host.writeClipboard(text).catch(() => false);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A canvas the workspace should open as soon as it has booted (deep link or inline card). */
export type CanvasTarget = { id: string; revision?: number };

let pending: CanvasTarget | null = null;
const waiting = new Set<(target: CanvasTarget) => void>();

/** Ask the workspace to open a canvas: now if it is mounted, otherwise when it mounts. */
export function requestCanvas(target: CanvasTarget) {
  if (waiting.size) waiting.forEach((listener) => listener(target));
  else pending = target;
}

export function takeRequestedCanvas(): CanvasTarget | null {
  const target = pending;
  pending = null;
  return target;
}

export function onCanvasRequested(listener: (target: CanvasTarget) => void) {
  waiting.add(listener);
  return () => {
    waiting.delete(listener);
  };
}

/** `?canvas=<id>&rev=<n>` in the page address, the form the tools hand to the model. */
export function canvasFromLocation(search: string): CanvasTarget | null {
  const params = new URLSearchParams(search);
  const id = params.get("canvas") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const revision = Number(params.get("rev"));
  return Number.isInteger(revision) && revision > 0 ? { id, revision } : { id };
}
