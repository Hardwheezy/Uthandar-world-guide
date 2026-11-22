# PROJECT HANDOFF — Build the Uthandar Worldbuilding Wiki & TTRPG Platform

## 1. The project

I want you (Astra) to help me **design and build a functioning website** for creating, documenting, exploring, and running fantasy tabletop RPG settings. This should be a custom product, not a website assembled inside an existing worldbuilding service.

The first setting the website will support is **Uthandar**.

### Canon naming decision — do not overwrite
- **Uthandar** is the name of the **world** (exact spelling: U-T-H-A-N-D-A-R).
- **The main continent is intentionally unnamed.** We chose not to establish a single universal continental name at this stage (Option B).
- In-world peoples can refer to territories by kingdoms, regions, rivers, cultures, and traditional lands; these specific names and their geography are not yet established.
- **Estara** was discussed as another name, but it is **not** the world name and **not** an approved continent name.
- Do **not** invent a continent name as a required database field, placeholder, navigation label, or branding element.
- Distinguish canonical lore from preliminary concepts, research, imported inspiration, and illustrative UI examples.

The principal immediate objective is a **usable, text-first website**. We can add artwork, sophisticated maps, and extensive customization later.

## 2. Product vision

The product draws inspiration from:
- **Obsidian**: connected notes, backlinks, local knowledge graphs, exploration of related ideas.
- **LegendKeeper**: fast, approachable writing, uncomplicated navigation, simple linking.
- **World Anvil**: encyclopedia-style worldbuilding, structured content and relationships, deep RPG support, customization.

I do not want a clone or an incoherent bundle of features. I want **World Anvil's depth, LegendKeeper's usability, and Obsidian's connections**, presented with substantially less friction.

Core statement: **An encyclopedia for discovering a world, and a workspace for bringing that world to life.**

The site must be an enjoyable experience for a curious player and a practical workspace for a busy Dungeon Master.

## 3. One database; two primary experiences

### Public / player experience
Public pages explain what a reader or ordinary inhabitant could reasonably know: places, peoples, families, rulers, institutions, faiths, events, traditions, and the apparent role of important characters. Articles should be inviting, readable, and interconnected without burying visitors in background minutiae.

### Private / DM experience
Authorized DMs see the public information **plus** the reasons behind events: secrets, plans, resentment, conflicting loyalties, true motives, sensitive historical knowledge, hidden relationships, adventure prompts, and possible future developments.

These must be **two permission-aware views of the same content records**, not two disconnected wikis that must be kept in sync.

**Critical security requirement:** Keep private data private on the server. Do not ship DM-only material in public responses and merely hide it with CSS or toggles. Protect search indexes, API responses, previews, relationship edges, and article metadata as carefully as full article bodies.

A DM should be able to preview the real public view, and ideally inspect private notes alongside a public article without navigating to a different application.

## 4. Concrete example: Tallwater / Mercer family

Use **Tallwater**, the **Mercer family**, and **Harlan** to illustrate the public/DM distinction.

A public Mercer family entry should explain the family's visible significance in Tallwater and link to related pages. It should **not** disclose personal resentments or Harlan's concealed agenda.

The DM view should eventually record the motivations, ambitions, grievances, resources, relationships, plans, and possible actions that influence Harlan. The author has indicated that Harlan is deeply committed to an objective and willing to go very far to pursue it.

**Do not make up details** about the family's business, political role, precise objective, history, or other unprovided lore. Use clearly labeled placeholders until the author provides or confirms them.

## 5. The article-reading experience

Design articles for *progressive disclosure*:
1. **At a glance:** What is this and why should I care?
2. **Main article:** A readable, coherent explanation with sections and well-placed internal links.
3. **Explore further:** Contextual related entries, glossary, backlinks, and optional deeper sections.
4. **DM intelligence:** Additional permissioned information within the same article experience.

Not every entry must fill in a giant standardized template. Provide *optional* structured templates for characters, settlements, families, factions, religions, events, and locations, while retaining flexibility.

Prioritize good typography, comfortable line lengths, breadcrumbs, intuitive search, accessible mobile layouts, context previews, and lightweight page loads.

Public homepages should orient a first-time visitor, with simple pathways into places, peoples, religions, history, and organizations. The continent should **not** need a name for navigation to work.

## 6. Relationships and the 'story web'

I want a graph inspired by Obsidian, but with **typed and meaningful connections** rather than only unlabelled document links.

Examples: a person belongs to a family; a family is active in a settlement; a ruler governs a territory; two people are rivals; a temple serves a deity; a faction secretly funds another; an event caused an institution to form.

Keep ordinary article hyperlinks and **structured relationships** separate where useful. The graph should support:
- Local, article-centered exploration first.
- Expand/collapse adjacent nodes.
- Labeled relationship edges.
- Filtering by type or category.
- Direct navigation into article pages.
- Visibility enforcement for both the nodes **and edges**.

A massive global graph is secondary; an overwhelming tangle of lines isn't useful to a player.

## 7. DM campaign workspace (phase after fundamentals)

The long-term goal includes:
- NPC notes: goals, fears, loyalties, grievances, resources, next moves.
- Faction notes: objectives, power, conflicts, internal divisions, plans.
- Session prep: active locations, relevant people, adventure hooks, notes.
- Campaign journal: player decisions, changes to the setting, consequences.
- Living world: what happens if the PCs do not intervene.
- Campaign-specific discoveries and information access.

Eventually one campaign's players should be able to learn a secret without automatically exposing that secret to every other group using the same setting.

**Do not implement all of this before we have a good wiki.**

## 8. Data ownership and editorial discipline

This project is partly motivated by the limitations of keeping all worldbuilding knowledge inside long ChatGPT conversations.

The site must therefore provide durable content storage, editing, revision history, usable backups, and portable exports (preferably Markdown and JSON).

Track editorial provenance and status:
- **Canon** — explicitly approved setting truth.
- **Draft** — working material.
- **Proposed** — possible direction.
- **Research** — external references and inspiration; not canon.
- **Rejected** — retained for context, not current lore.

Preserve author decisions, don't silently substitute your own lore, and don't mistake material from *Forsaken Gods*, Warcraft, or historical research for established Uthandar facts.

The accompanying starter wiki ZIP contains Markdown notes and an excerpt of previous work, but **it is not a complete export of the old conversation**. Its research notes are not automatically world canon.

## 9. Technical approach

Please recommend a practical, maintainable stack, then **build** rather than spending all our time producing documentation. A TypeScript/React or Next.js stack, PostgreSQL, a good rich-text editor, and a well-chosen graph library may fit, but explain any important trade-offs and use sensible defaults.

Prioritize:
- Server-enforced authentication and authorization.
- An elegant, reliable article editor.
- One coherent article/relationship data model.
- Readable and fast public pages.
- Responsive design and accessibility.
- Backups, migrations, and portable data.
- A simple deployment and maintenance story.
- Clean separation between content, app logic, and presentation.

Don't add complicated infrastructure simply to appear 'enterprise-grade.'

## 10. Initial MVP — what to build first

Build and demonstrate the following:
1. Public wiki home and article reading pages.
2. Authenticated DM/editor access.
3. Create/edit article flow with internal links.
4. Public article plus DM-only sections in a shared content model.
5. Safe public preview for DMs.
6. Search, categories, backlinks, and related entries.
7. Structured article-to-article relationship types.
8. A simple, readable, focused relationship graph.
9. A handful of sample records featuring Tallwater, the Mercer family, Harlan, and **Uthandar** (with unknown lore clearly labeled as placeholders).
10. Basic revision or content-recovery strategy, even if advanced history comes after the first working version.

Everything else—maps, art, public profiles, elaborate page themes, and a full campaign suite—can be staged for later releases.

## 11. How to work with me

Act as a collaborative product designer and experienced full-stack developer. Question unnecessary complexity while respecting my vision. Make sensible decisions instead of repeatedly requesting information already in this handoff.

Show real UI, working behavior, and testable code. Be transparent about what is a prototype, what is implemented, and what is still planned. Prioritize smooth reading, simple authoring, meaningful relationships, and a single integrated player/DM experience.

**Begin by establishing the minimal content model and a readable end-to-end prototype.** Don't stop at a feature list or a pile of mockups.

The goal is simple: **players understand what matters; DMs understand why it matters, what is secretly happening, and what happens next.**
