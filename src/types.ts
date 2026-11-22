import type { SeriesBlock, SeriesState } from "./blocks/seriesTypes";
import type { ExploreBlock, ExploreInteraction } from "./blocks/exploreTypes";
import type { SpatialBlock } from "./blocks/spatial";
import type { FlashcardsBlock, StudyInteraction } from "./blocks/study";
import type { EditorialBlock } from "./blocks/editorial";
import type { AnalyticsBlock } from "./blocks/analytics";
import type { ControlBlock } from "./blocks/controls";
import type { ExperienceBlock } from "./blocks/experienceBlocks";
export type Input = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
};
type Base = { id: string; title: string };
export type CollectionItem = {
  id: string;
  title: string;
  description?: string;
  metadata?: { [label: string]: string };
  score?: number | null;
  source?: { title: string; url: string } | null;
  image_url?: string | null;
  illustration?: "coast" | "orbit" | "rain" | "dining" | null;
};
export type Block = Base &
  (
    | SeriesBlock
    | EditorialBlock
    | AnalyticsBlock
    | ControlBlock
    | ExperienceBlock
    | ExploreBlock
    | SpatialBlock
    | FlashcardsBlock
    | { type: "text"; text: string }
    | { type: "metric"; value: string; detail?: string }
    | {
        type: "chart";
        unit?: string;
        points: { label: string; value: number }[];
      }
    | { type: "table"; columns: string[]; rows: string[][] }
    | { type: "checklist"; items: string[] }
    | { type: "collection"; items: CollectionItem[] }
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
          kind:
            | "text"
            | "number"
            | "select"
            | "textarea"
            | "radio"
            | "checkbox"
            | "date";
          options?: string[];
          required?: boolean;
        }[];
        submit_label?: string;
      }
  );
export type Interaction = SeriesState &
  ExploreInteraction &
  StudyInteraction & {
    values?: { [key: string]: string };
    checked?: number[];
    selected?: number | null;
    query?: string;
    sort_column?: number | null;
    sort_reverse?: boolean;
    fields?: { [key: string]: string };
    selected_ids?: string[];
    collection_sort?: "original" | "score" | "title";
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
export type ActivityStep = {
  kind: "tool" | "subagent";
  name: string;
  status: "running" | "succeeded" | "failed" | "unknown";
  duration?: number;
  reason?: "timeout" | "denied" | "cancelled" | "nonzero_exit";
};
export type RunActivity = { steps: ActivityStep[]; limited: boolean };
export type Message = {
  id: string;
  role: "user" | "assistant";
  delivery?: "silent";
  activity?: RunActivity;
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
  cursor?: string;
  delivery?: "silent";
  activity?: RunActivity;
  preview?: Canvas | null;
  conversation_id: string;
  remote_id?: string;
  status: string;
  text: string;
  events: {
    event?: string;
    type?: string;
    tool?: string;
    error?: boolean;
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
    choices?: string[];
    multi_select?: boolean;
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
  version?: string;
  model?: string;
  detail?: string;
  features: { [key: string]: unknown };
  exports?: { html: boolean; markdown: boolean; json: boolean };
  clients?: { desktop: boolean; dashboard: boolean; standalone: boolean };
};
export type Workspace = {
  chat_id: string | null;
  canvas: Canvas | null;
  revision: number;
  theme: "system" | "light" | "dark";
  locale?: "auto" | "pt-BR" | "en";
};
export type Draft = {
  id: string;
  base_revision: number;
  canvas: Canvas;
  updated: string;
  token: string;
};
export type ExportedFile = {
  filename: string;
  media_type: string;
  content: string;
};
export type Transport = (path: string, init?: RequestInit) => Promise<unknown>;
