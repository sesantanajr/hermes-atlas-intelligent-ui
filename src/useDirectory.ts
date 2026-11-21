import { useCallback, useEffect, useRef, useState } from "react";
import type { createClient } from "./client";

const pageSize = 50;
/** Fetch one extra row so the last page never shows a dead "load more" button. */
export function useDirectory<T extends { id: string }>(
  api: ReturnType<typeof createClient>["request"],
  path: string,
  scope: string,
) {
  const [rows, setRows] = useState<T[]>([]);
  const [query, setQuery] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const nextOffset = useRef(0);
  const fetching = useRef(false);
  const search = useRef("");
  const refresh = useCallback(
    async (append = false) => {
      if (!scope || (append && fetching.current)) return;
      const id = ++generation.current;
      const offset = append ? nextOffset.current : 0;
      fetching.current = true;
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({
          offset: String(offset),
          limit: String(pageSize + 1),
        });
        if (search.current.trim()) params.set("q", search.current.trim());
        const result = await api<T[]>(path + "?" + params);
        if (generation.current !== id) return;
        const page = result.slice(0, pageSize);
        nextOffset.current = offset + page.length;
        setMore(result.length > pageSize);
        setRows((old) =>
          append
            ? [...old, ...page.filter((r) => !old.some((x) => x.id === r.id))]
            : page,
        );
      } catch (cause) {
        if (id === generation.current)
          setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (id === generation.current) {
          fetching.current = false;
          setBusy(false);
        }
      }
    },
    [api, path, scope],
  );
  useEffect(() => {
    search.current = query;
    generation.current++;
    nextOffset.current = 0;
    fetching.current = false;
    setRows([]);
    setMore(false);
    setError("");
    setBusy(!!scope);
    if (!scope) return;
    const timer = query ? setTimeout(() => void refresh(), 200) : undefined;
    if (!query) void refresh();
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [query, refresh, scope]);
  return { rows, query, setQuery, more, busy, refresh, error };
}
