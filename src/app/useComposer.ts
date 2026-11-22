import { useRef, useState } from "react";
import type { Canvas } from "../types";

export type Attachment = { name: string; text: string };
type RunPayload = {
  request_id: string;
  conversation_id: string;
  input: string;
  context: { canvas: Canvas; revision: number } | null;
  attachments: Attachment[];
};
type Draft = {
  text: string;
  attachments: Attachment[];
  pending: RunPayload | null;
};
const empty = (): Draft => ({ text: "", attachments: [], pending: null });

/** The tab owns the editor. Navigation selects a separate draft per Hermes scope and chat. */
export function useComposer() {
  const key = useRef("");
  const cache = useRef(new Map<string, Draft>());
  const active = useRef<Draft>(empty());
  const [value, setValue] = useState(active.current);
  function save(next: Draft) {
    if (key.current) {
      cache.current.set(key.current, next);
      try {
        if (next.text || next.attachments.length || next.pending)
          sessionStorage.setItem(key.current, JSON.stringify(next));
        else sessionStorage.removeItem(key.current);
      } catch {
        // The editor stays usable when tab storage is unavailable or full.
        try {
          sessionStorage.removeItem(key.current);
        } catch {
          /* unavailable */
        }
      }
    }
    active.current = next;
    setValue(next);
  }
  function select(scope: string, conversationId: string | null) {
    const nextKey = scope
      ? `atlas.composer.v1/${scope}/${conversationId || "new"}`
      : "";
    if (key.current === nextKey) return;
    key.current = nextKey;
    let next = cache.current.get(nextKey);
    if (!next && nextKey) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(nextKey) || "null");
        if (
          stored &&
          typeof stored.text === "string" &&
          Array.isArray(stored.attachments)
        )
          next = stored;
      } catch {
        /* A stale draft must not prevent opening a conversation. */
      }
    }
    active.current = next || empty();
    setValue(active.current);
  }
  function prepare(
    conversationId: string | null,
    context: RunPayload["context"],
  ) {
    const { text, attachments, pending } = active.current;
    const input = text.trim();
    const id =
      conversationId || pending?.conversation_id || crypto.randomUUID();
    if (
      pending &&
      pending.conversation_id === id &&
      pending.input === input &&
      JSON.stringify(pending.attachments) === JSON.stringify(attachments) &&
      JSON.stringify(pending.context) === JSON.stringify(context)
    )
      return pending;
    const payload = {
      request_id: crypto.randomUUID(),
      conversation_id: id,
      input,
      context,
      attachments,
    };
    save({ ...active.current, pending: payload });
    return payload;
  }
  return {
    ...value,
    select,
    prepare,
    key,
    setText: (text: string) => save({ ...active.current, text }),
    setFiles: (change: (old: Attachment[]) => Attachment[]) =>
      save({
        ...active.current,
        attachments: change(active.current.attachments),
      }),
    clear: () => save(empty()),
  };
}
