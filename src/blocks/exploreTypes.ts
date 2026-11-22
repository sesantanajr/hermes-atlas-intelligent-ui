export type ExploreItem = {
  id: string;
  title: string;
  body: string;
  points?: string[];
};

export type TimelineStatus = "done" | "current" | "upcoming";

export type TimelineItem = ExploreItem & {
  when?: string;
  status?: TimelineStatus | null;
};

export type ExploreBlock = { id: string; title: string } & (
  | { type: "tabs"; items: ExploreItem[] }
  | { type: "timeline"; items: TimelineItem[] }
);

export type ExploreInteraction = { active_item?: string | null };
