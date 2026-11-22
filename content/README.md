# Uthandar content folder

This folder is how collaborators (Vee, Claude, anyone else the DM invites) contribute to the
Uthandar guide through GitHub, without needing access to the running site.

| Folder | What it is | Who writes it |
| --- | --- | --- |
| `starter-wiki/` | The original starter notes, imported once as DM-only working notes. | Nobody (historical record) |
| `world/` | A snapshot of everything in the site, **including DM-only material**. Regenerated from the DM Ledger ("Write snapshot"). | The site |
| `inbox/` | New material proposed by collaborators. Imported from the DM Ledger ("Check the inbox"). | Collaborators |

**This repository must stay private.** `world/` contains the DM Ledger: secrets, plans, and hidden connections.

## Rules for collaborators

These come from the setting's Canon and Status Policy. They are not optional.

1. **Nothing you write is canon.** Every inbox file is imported as `proposed` and DM-only, signed with your name. Only the DM promotes material to the guide or to canon.
2. **Read before you write.** Check `world/` (start with `world/_index.md`) so you don't duplicate an entry or contradict established canon. Entries marked `canon` are settled; work with them, not against them.
3. **Never fill gaps by inventing established facts.** If a detail is unknown, say so, or offer it explicitly as a suggestion ("One possibility: …"). "To be established" is a valid answer.
4. **Keep outside inspiration labelled.** Material from *Forsaken Gods*, Warcraft, or real history is research, not Uthandar lore. If you draw on it, say where it came from in `source:`.
5. **Uthandar is the world (U-T-H-A-N-D-A-R). The main continent deliberately has no single name.** Do not name it. Estara is not an approved name.
6. **Write in the guide's voice for player-facing text, and keep secrets out of it.** Mark hearsay as hearsay. Put motives, plans, and hidden truths in sections the DM can keep in the Ledger.
7. **One subject per file.** Name files clearly, e.g. `inbox/vee-tallwater-market-day.md`. Never edit or delete other people's inbox files; add a new file instead.

## Inbox file format

```markdown
---
title: Mercer family        # an existing entry's title (or use slug:) → your material is ADDED to it
author: Vee                 # required: who wrote this
note: Why you are proposing this   # shown to the DM in the entry's history
# For a NEW entry (title not found), also give:
# type: family              # world, place, person, family, culture, faction, institution, faith, deity, event, history, note
# summary: One or two sentences on what this is and why it matters.
facts:                      # optional, become at-a-glance facts
  - label: Business
    value: <your suggestion, or leave empty>
connections:                # optional, typed relationships to existing entries
  - type: active_in         # member_of, belongs_to, located_in, active_in, governs, serves, funds,
    target: Tallwater       # opposes, caused, participated_in, worships, allied_with, rival_of, related_to
source: Vee, session notes 2026-11-30
---

## <Section heading>

Each `##` heading becomes its own section. Link other entries with [[Tallwater]]
or [[Tallwater|the town]]. Links to entries that don't exist yet are kept and
light up once someone writes that entry.
```

What happens on import:

- If `title:` (or `slug:`) matches an existing entry, your sections, facts, and connections are **appended** to it. Nothing already there is changed.
- Otherwise a **new entry** is created, DM-only and `proposed`.
- Each version of a file is imported once. If you edit the file later, the changes arrive as an additional round of proposals; earlier ones are not rewritten. Prefer adding a new file.
- Files starting with `_` or `.` are ignored (see `inbox/_example.md`).

## For the DM

1. Merge a collaborator's pull request on GitHub (that's your first review).
2. `git pull` on the machine running the site.
3. DM Ledger → **Check the inbox**. New proposals appear under "Recent proposals from collaborators".
4. Open each one, then promote, rewrite, or reject sections in the editor (status and Guide/DM Ledger toggles per section).
5. DM Ledger → **Write snapshot**, then commit and push `content/world/` so collaborators see the current state.
