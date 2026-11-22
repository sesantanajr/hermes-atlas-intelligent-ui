import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../types";
import type { createClient } from "../host/client";

export type WorkspaceSnapshot = Workspace & { workspace_token?: string };
const initial: Workspace = {
  chat_id: null,
  canvas: null,
  revision: 0,
  theme: "system",
};
type LocalDraft = { value: Workspace; token?: string };
type Session = LocalDraft & {
  scope: string;
  dirty: boolean;
  writing: boolean;
  error: string;
  conflict: WorkspaceSnapshot | null;
};

export function useWorkspace(api: ReturnType<typeof createClient>["request"]) {
  const session = useRef<Session | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cache = useRef(new Map<string, LocalDraft>());
  const [current, setCurrent] = useState<Session | null>(null);
  const publish = (s: Session) => setCurrent({ ...s });
  const storageKey = (scope: string) => "atlas.workspace.v1/" + scope;
  function remember(s: Session) {
    const key = storageKey(s.scope);
    const draft: LocalDraft = { value: s.value, token: s.token };
    if (s.dirty) cache.current.set(key, draft);
    else cache.current.delete(key);
    try {
      if (s.dirty) sessionStorage.setItem(key, JSON.stringify(draft));
      else sessionStorage.removeItem(key);
    } catch {
      /* The in-memory draft remains available. */
    }
  }
  function schedule(s: Session) {
    clearTimeout(timer.current);
    if (s.dirty && !s.conflict && !s.error && !s.writing)
      timer.current = setTimeout(() => {
        void flush(s);
      }, 180);
  }
  async function flush(s: Session) {
    if (session.current !== s || !s.dirty || s.conflict || s.writing) return;
    const sent = s.value;
    s.writing = true;
    s.error = "";
    publish(s);
    try {
      const saved = await api<WorkspaceSnapshot>(
        "/workspace",
        { ...sent, expected_workspace_token: s.token },
        "PUT",
      );
      if (session.current !== s) return;
      s.token = saved.workspace_token;
      s.dirty = s.value !== sent;
      remember(s);
    } catch (e) {
      if (session.current !== s) return;
      s.error = e instanceof Error ? e.message : String(e);
      // Desktop and Dashboard SDKs may expose a 409 only as a generic Error.
      // Read back the token to distinguish a concurrent edit from an outage.
      if (s.token) {
        try {
          const remote = await api<WorkspaceSnapshot>("/workspace");
          if (
            session.current === s &&
            remote.workspace_token &&
            remote.workspace_token !== s.token
          )
            s.conflict = remote;
        } catch {
          /* Retry stays available offline. */
        }
      }
    } finally {
      if (session.current === s) {
        s.writing = false;
        publish(s);
        schedule(s);
      }
    }
  }
  function hydrate(scope: string, remote: WorkspaceSnapshot, discard = false) {
    clearTimeout(timer.current);
    const { workspace_token, ...serverValue } = remote;
    const key = storageKey(scope);
    let draft: LocalDraft | undefined;
    if (!discard) {
      draft = cache.current.get(key);
      if (!draft) {
        try {
          const saved = JSON.parse(sessionStorage.getItem(key) || "null");
          if (saved?.value && typeof saved.value.theme === "string")
            draft = saved;
        } catch {
          /* Ignore a stale tab cache. */
        }
      }
    }
    const s: Session = {
      scope,
      value: draft?.value ?? serverValue,
      token: draft ? draft.token : workspace_token,
      dirty: !!draft,
      writing: false,
      error: "",
      conflict:
        draft && workspace_token && workspace_token !== draft.token
          ? remote
          : null,
    };
    session.current = s;
    remember(s);
    publish(s);
    schedule(s);
    return s.value;
  }
  function setWorkspace(change: (value: Workspace) => Workspace) {
    const s = session.current;
    if (!s) return;
    const w = s.value;
    const next = change(w);
    if (
      w.chat_id === next.chat_id &&
      w.canvas === next.canvas &&
      w.revision === next.revision &&
      w.theme === next.theme
    )
      return;
    s.value = next;
    s.dirty = true;
    s.error = "";
    remember(s);
    publish(s);
    schedule(s);
  }
  function disconnect() {
    clearTimeout(timer.current);
    session.current = null;
    setCurrent(null);
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      session.current = null;
    },
    [api],
  );
  function keepLocal() {
    const s = session.current;
    if (!s || s.writing) return;
    if (s.conflict) s.token = s.conflict.workspace_token;
    s.conflict = null;
    s.error = "";
    remember(s);
    void flush(s);
  }
  function acceptRemote() {
    const s = session.current;
    if (s?.conflict) return hydrate(s.scope, s.conflict, true);
  }
  return {
    workspace: current?.value || initial,
    hydrate,
    setWorkspace,
    disconnect,
    saving: !!current?.dirty && !current?.conflict && !current?.error,
    error: current?.error,
    conflict: current?.conflict,
    keepLocal,
    acceptRemote,
  };
}
