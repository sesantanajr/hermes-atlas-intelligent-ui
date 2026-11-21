type Base = { id: string; title: string };
export type Photo = { alt: string; caption?: string; src: string };
type Named = { id: string; label: string };
type Place = Named & { lat: number; lon: number; detail?: string };
export type ExperienceBlock = Base &
  (
    | { type: "image"; photo: Photo }
    | { type: "gallery"; photos: Photo[] }
    | {
        type: "video";
        src: string;
        transcript: string;
        captions_url?: string | null;
      }
    | { type: "audio"; src: string; transcript: string }
    | { type: "map"; pins: Place[] }
    | {
        type: "places";
        places: (Place & { address: string; category: string })[];
      }
    | {
        type: "product";
        description: string;
        currency: string;
        variants: (Named & { price_cents: number; available?: boolean })[];
        source_url?: string | null;
      }
    | {
        type: "kanban";
        columns: Named[];
        tasks: (Named & { column: string })[];
      }
    | {
        type: "decision_tree";
        start: string;
        nodes: (Named & { choices?: { label: string; target: string }[] })[];
      }
    | {
        type: "budget_planner";
        currency: string;
        limit_cents: number;
        items: (Named & { price_cents: number; quantity?: number })[];
      }
  );
export const experienceTypes = new Set([
  "image",
  "gallery",
  "video",
  "audio",
  "map",
  "places",
  "product",
  "kanban",
  "decision_tree",
  "budget_planner",
]);
export function isExperienceBlock(block: {
  type: string;
}): block is ExperienceBlock {
  return experienceTypes.has(block.type);
}
