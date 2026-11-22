/** Shared vocabulary. Plain data — safe to import from client components. */

export const STATUSES = ["canon", "draft", "proposed", "research", "reference", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_INFO: Record<Status, { label: string; help: string }> = {
  canon: { label: "Canon", help: "Explicitly approved as true in this setting." },
  draft: { label: "Draft", help: "Working text. Not yet approved as setting truth." },
  proposed: { label: "Proposed", help: "A suggested direction under consideration." },
  research: { label: "Research", help: "Outside reference or inspiration. Not setting fact." },
  reference: { label: "Reference", help: "Process, source, or workflow documentation." },
  rejected: { label: "Rejected", help: "Kept for the record. Not part of the setting." },
};

export const VISIBILITIES = ["public", "dm"] as const;
export type Vis = (typeof VISIBILITIES)[number];
export const VISIBILITY_INFO: Record<Vis, { label: string; help: string }> = {
  public: { label: "Guide", help: "Visible to every reader of the guide." },
  dm: { label: "DM Ledger", help: "Only signed-in DMs and editors can see this." },
};

export const FRAMINGS = ["account", "hearsay", "contested", "belief"] as const;
export type FramingKind = (typeof FRAMINGS)[number];
export const FRAMING_INFO: Record<FramingKind, { label: string; note: string | null }> = {
  account: { label: "Guild account", note: null },
  hearsay: { label: "Hearsay", note: "Hearsay. The guild has not confirmed this account." },
  contested: { label: "Contested", note: "Contested. Accounts of this disagree." },
  belief: { label: "Belief", note: "What people believe, not necessarily what is so." },
};

export const ARTICLE_TYPES = [
  "world",
  "place",
  "person",
  "family",
  "culture",
  "faction",
  "institution",
  "faith",
  "deity",
  "event",
  "history",
  "note",
] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const TYPE_LABEL: Record<ArticleType, string> = {
  world: "World",
  place: "Place",
  person: "Person",
  family: "Family",
  culture: "People & culture",
  faction: "Faction",
  institution: "Institution",
  faith: "Faith",
  deity: "Deity",
  event: "Event",
  history: "History",
  note: "Working note",
};

/** Public navigation categories. These are reading paths, not claims that lore exists. */
export const CATEGORIES = [
  { slug: "places", label: "Places", types: ["place"], empty: "No places have been entered in the guide yet." },
  {
    slug: "people",
    label: "People",
    types: ["person", "family", "culture"],
    empty: "No people, families, or peoples have been entered yet.",
  },
  {
    slug: "factions",
    label: "Factions & Institutions",
    types: ["faction", "institution"],
    empty: "No factions or institutions have been entered yet.",
  },
  { slug: "faiths", label: "Faiths", types: ["faith", "deity"], empty: "No faiths have been entered in the guide yet." },
  { slug: "history", label: "History", types: ["event", "history"], empty: "No history has been entered yet." },
] as const satisfies ReadonlyArray<{ slug: string; label: string; types: readonly ArticleType[]; empty: string }>;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export function categoryForType(type: string) {
  return CATEGORIES.find((c) => (c.types as readonly string[]).includes(type)) ?? null;
}

/**
 * Relationship types. `label` reads source → target, `inverse` reads target → source.
 * Symmetric types read the same in both directions.
 */
export const RELATIONSHIP_TYPES = {
  member_of: { label: "member of", inverse: "has member", symmetric: false },
  belongs_to: { label: "belongs to", inverse: "includes", symmetric: false },
  located_in: { label: "located in", inverse: "location of", symmetric: false },
  active_in: { label: "active in", inverse: "home to", symmetric: false },
  governs: { label: "governs", inverse: "governed by", symmetric: false },
  serves: { label: "serves", inverse: "served by", symmetric: false },
  funds: { label: "funds", inverse: "funded by", symmetric: false },
  opposes: { label: "opposes", inverse: "opposed by", symmetric: false },
  caused: { label: "caused", inverse: "caused by", symmetric: false },
  participated_in: { label: "participated in", inverse: "involved", symmetric: false },
  worships: { label: "worships", inverse: "worshipped by", symmetric: false },
  allied_with: { label: "allied with", inverse: "allied with", symmetric: true },
  rival_of: { label: "rival of", inverse: "rival of", symmetric: true },
  related_to: { label: "related to", inverse: "related to", symmetric: true },
} as const;
export type RelType = keyof typeof RELATIONSHIP_TYPES;
export const REL_TYPE_KEYS = Object.keys(RELATIONSHIP_TYPES) as RelType[];

export function relLabel(type: string, outgoing: boolean) {
  const t = RELATIONSHIP_TYPES[type as RelType];
  if (!t) return type.replace(/_/g, " ");
  return outgoing ? t.label : t.inverse;
}

export const TBE = "To be established";
