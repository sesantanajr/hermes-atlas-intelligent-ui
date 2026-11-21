export type Input = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
};
type Base = { id: string; title: string };
export type Block = Base &
  (
    | { type: "text"; text: string }
    | { type: "metric"; value: string; detail?: string }
    | {
        type: "chart";
        unit?: string;
        points: { label: string; value: number }[];
      }
    | { type: "table"; columns: string[]; rows: string[][] }
    | { type: "checklist"; items: string[] }
    | {
        type: "comparison";
        options: { name: string; description: string; features: string[] }[];
      }
    | {
        type: "calculator";
        operation: "sum" | "product" | "split" | "compound";
        inputs: Input[];
        unit?: string;
      }
    | {
        type: "form";
        fields: {
          id: string;
          label: string;
          kind: "text" | "number" | "select";
          options?: string[];
          required?: boolean;
        }[];
        submit_label?: string;
      }
  );
export type Interaction = {
  checked?: number[];
  selected?: number | null;
  query?: string;
  sort_column?: number | null;
  sort_reverse?: boolean;
  fields?: { [key: string]: string };
};
export type Canvas = {
  schema_version: "1.0";
  id: string;
  title: string;
  description: string;
  blocks: Block[];
  state?: { [key: string]: Interaction };
  sources?: { title: string; url: string }[];
};
export type Record = {
  id: string;
  revision: number;
  updated: string;
  canvas: Canvas;
};
export type Summary = {
  id: string;
  revision: number;
  title: string;
  updated: string;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifact?: { id: string; revision: number };
  created: string;
  status?: string;
  warning?: string;
  usage?: { total_tokens?: number };
};
export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  active_run?: string | null;
};
export type ChatSummary = Omit<Conversation, "messages">;
export type Run = {
  id: string;
  conversation_id: string;
  remote_id?: string;
  status: string;
  text: string;
  events: {
    event?: string;
    type?: string;
    tool?: string;
    text?: string;
    preview?: string;
    seq?: number;
  }[];
  pending_controls?: {
    kind: string;
    prompt_id: string;
    execution_generation: number;
    prompt?: string;
    description?: string;
    question?: string;
    command?: string;
  }[];
  artifact?: Record;
  warning?: string;
  connection_error?: string;
  admission_id?: string;
  execution_generation?: number;
};
export type Status = {
  connected: boolean;
  scope: string;
  model?: string;
  detail?: string;
  features: { [key: string]: unknown };
};
export type Workspace = {
  chat_id: string | null;
  canvas: Canvas | null;
  revision: number;
  theme: "system" | "light" | "dark";
};
export type Transport = (path: string, init?: RequestInit) => Promise<unknown>;
