import type { Message, Run } from "./types";

// Older Atlas servers return raw assistant text without a delivery verdict.
const markers = [
  "[SILENT]",
  "SILENT",
  "NO_REPLY",
  "NO REPLY",
  "[静默]",
  "静默",
  "[沉默]",
  "沉默",
];

function insideFence(text: string) {
  let delimiter = "";
  for (const match of text.matchAll(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/gm)) {
    const [, fence, rest] = match;
    if (!delimiter) {
      if (fence[0] !== "`" || !rest.includes("`")) delimiter = fence;
    } else if (
      fence[0] === delimiter[0] &&
      fence.length >= delimiter.length &&
      !rest.trim()
    ) {
      delimiter = "";
    }
  }
  return !!delimiter;
}

export function assistantText(text: string, streaming = false): string {
  const trimmed = text.trimEnd();
  const last = trimmed.lastIndexOf("\n") + 1;
  const line = trimmed.slice(last);
  if (!line.length || line.length > 64 || /^(?: {4}|[ \t]*\t)/.test(line))
    return text;
  const marker = line.trim().replace(/\s+/g, " ").toUpperCase();
  if (!marker) return text;
  const matches = streaming
    ? markers.some((known) => known.startsWith(marker))
    : markers.includes(marker);
  if (!matches) return text;
  const head = trimmed.slice(0, last);
  if (insideFence(head)) return text;
  return head.trimEnd();
}

const endStatus: Record<string, string> = {
  failed: "O Hermes não concluiu a execução.",
  cancelled: "Execução interrompida.",
  interrupted: "O gateway foi interrompido.",
};

export function conversationMessages(messages: Message[]) {
  const result: Message[] = [];
  let waitingForReply = false;
  let receipt: Message | undefined;
  for (const row of messages) {
    if (row.role === "user") {
      if (receipt) result.push(receipt);
      receipt = undefined;
      waitingForReply = true;
      result.push(row);
      continue;
    }
    const content = assistantText(row.content);
    const warning =
      row.warning ||
      (!content.trim() ? endStatus[row.status ?? ""] : undefined);
    if (row.artifact || content.trim() || warning) {
      result.push({ ...row, content, warning });
      receipt = undefined;
      waitingForReply = false;
    } else if (
      waitingForReply &&
      (row.delivery === "silent" || (row.content.trim() && !content))
    ) {
      // A direct request gets one receipt. A useful reply in that turn supersedes it.
      receipt ??= { ...row, content: "", delivery: "silent" };
    }
  }
  if (receipt) result.push(receipt);
  return result;
}

export function activityEvents(events: Run["events"]) {
  return events.flatMap((event) => {
    if ((event.type || event.event) !== "message.interim") return [event];
    const text = assistantText(event.text || ""),
      preview = assistantText(event.preview || "");
    return text.trim() || preview.trim() ? [{ ...event, text, preview }] : [];
  });
}
