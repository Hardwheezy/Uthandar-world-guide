/**
 * Optional article templates. They only scaffold headings and fact labels —
 * never content. Faction / deity / setting-article structures come from the
 * starter wiki's own templates; person and family DM sections come from the
 * site handoff (§4 and §6).
 */
import type { ArticleType, Vis } from "./vocab";

export type TemplateDef = {
  key: string;
  label: string;
  type: ArticleType;
  facts: { label: string; visibility: Vis }[];
  sections: { heading: string; visibility: Vis }[];
};

const g = (heading: string) => ({ heading, visibility: "public" as const });
const d = (heading: string) => ({ heading, visibility: "dm" as const });
const f = (label: string, visibility: Vis = "public") => ({ label, visibility });

export const TEMPLATES: TemplateDef[] = [
  {
    key: "freeform",
    label: "Freeform entry",
    type: "note",
    facts: [],
    sections: [g("Overview")],
  },
  {
    key: "person",
    label: "Person / NPC",
    type: "person",
    facts: [f("Known as"), f("Role"), f("Home")],
    sections: [
      g("Who they are"),
      g("Reputation"),
      d("Goals and motivations"),
      d("Fears and obligations"),
      d("Loyalties and grievances"),
      d("Resources"),
      d("Concealed relationships"),
      d("Possible next moves"),
      d("Adventure use"),
    ],
  },
  {
    key: "place",
    label: "Place / settlement",
    type: "place",
    facts: [f("Kind of place"), f("Region"), f("Ruled by")],
    sections: [
      g("At first sight"),
      g("Everyday life"),
      g("Notable people and families"),
      d("What the locals don't say"),
      d("Pressures and trajectory"),
      d("Adventure use"),
    ],
  },
  {
    key: "family",
    label: "Family / house",
    type: "family",
    facts: [f("Seat"), f("Standing"), f("Known members")],
    sections: [
      g("Standing in the community"),
      g("Known members"),
      d("Internal tensions"),
      d("Ambitions and grievances"),
      d("Resources"),
      d("What happens if nobody intervenes"),
    ],
  },
  {
    key: "faction",
    label: "Faction / institution",
    type: "faction",
    facts: [f("Public purpose"), f("Leadership"), f("Base of operations")],
    sections: [
      g("Public purpose"),
      d("Real interests and pressures"),
      d("Leaders and succession"),
      d("Resources and limitations"),
      d("Allies, rivals, dependencies"),
      d("Current trajectory if nobody acts"),
      d("Ways people or player characters can change it"),
    ],
  },
  {
    key: "deity",
    label: "Deity",
    type: "deity",
    facts: [f("Realms and symbols"), f("Worshipped by")],
    sections: [
      g("Associated realms and symbols"),
      g("Worship and institutions"),
      g("Festivals, rites, and taboos"),
      g("Competing interpretations"),
      d("Divine intervention: known, claimed, or disputed"),
      d("Political and economic impact"),
    ],
  },
  {
    key: "faith",
    label: "Faith / religion",
    type: "faith",
    facts: [f("Followers"), f("Centres of worship")],
    sections: [g("Beliefs"), g("Practice"), g("Competing interpretations"), d("Institutional politics"), d("Hidden truths")],
  },
  {
    key: "event",
    label: "Event",
    type: "event",
    facts: [f("When"), f("Where")],
    sections: [g("What is told"), g("Competing accounts"), d("What actually happened"), d("Consequences still unfolding")],
  },
  {
    key: "setting",
    label: "Setting article",
    type: "note",
    facts: [f("One-sentence summary")],
    sections: [
      g("What is established"),
      g("History and origins"),
      g("Everyday life and material basis"),
      d("Consequences and story potential"),
      d("Sources and decision history"),
    ],
  },
];

export function getTemplate(key: string | null | undefined) {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}
