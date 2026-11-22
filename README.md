# Uthandar: the Adventurer's Guild guide and DM Ledger

*An encyclopedia for discovering a world, and a workspace for bringing that world to life.*

One website, one set of records. Visitors read the Adventurer's Guild guide. A signed-in DM opens the same entries and sees the DM Ledger inside them: secrets, motives, plans, hidden connections. The server never sends DM material to anyone else.

## Run it

You need **Node.js 20.9 or newer** (built and tested on Node 22). No database install: it uses PGlite, a real Postgres engine that runs inside the app and saves to `.data/pglite`.

```bash
npm install
cp .env.example .env        # Windows (PowerShell): Copy-Item .env.example .env
# open .env and change both passwords
npm run setup               # creates the database, the four seed entries, the accounts, and imports the starter wiki
npm run dev
```

Open <http://localhost:3000>. Use **DM sign in** (top right) with `SEED_DM_EMAIL` / `SEED_DM_PASSWORD` from your `.env`.

`setup` only creates accounts that don't exist yet, so editing `.env` later won't change a password. Use `npm run user:password -- <email> "<new password>"` instead.

## Walk through it

1. **Visitor path.** Home → Contents → *Places* → **Tallwater** → **Mercer family** → **Harlan**. Unknowns read *To be established*, and draft connections carry a Draft badge.
2. **DM view.** Sign in and open Harlan. The lapis **DM Ledger** panels appear inside the entry, and the bar tells you what visitors don't see.
3. **True public preview.** Choose **View as visitor**. The whole site now renders exactly as an anonymous visitor's would, including search, the graph, and autocomplete. **Return to DM view** ends it. Editor pages are unavailable while previewing.
4. **Write.** Use **Edit entry**, or **New entry** with a template. Type `[[` to link an entry. Give each section its audience (Guide or DM Ledger), its editorial status, and its in-world framing (account, hearsay, contested, or belief). **Ctrl+S** saves.
5. **Recover.** **History** keeps a full copy of every save, so you can view any version and restore it. Deleted entries go to **DM Ledger → Recently deleted** and can be restored.
6. **Check it yourself.** `npm test` runs the unit tests. With the site running, `npm run test:http` runs the HTTP leak suite. `npm run test:e2e` runs a browser walkthrough and needs Chrome.

## Implemented, tested, not yet

| Area | Status |
| --- | --- |
| Guide home, categories (Places, People, Factions & Institutions, Faiths, History), A–Z, breadcrumbs, empty states, mobile layout | Built, screenshotted at desktop and 390 px |
| Article: at a glance, main entry, explore further (story web, backlinks, related), DM intelligence | Built, browser-tested |
| Sign-in, sessions, roles (visitor / player / DM-editor / admin), server-side access layer | Built, unit + HTTP tested |
| Public preview as a read lens across every surface | Built, tested for equality with the anonymous result |
| Editor: sections, facts, typed connections, templates, `[[` picker, Markdown-style `[[Title]]` typing, conflict detection | Built, browser-tested |
| Search with snippets, autocomplete, backlinks, related entries | Built, leak-tested |
| Focused story web: expand, filter by type, open entries; nodes **and** edges permission-filtered | Built, leak-tested |
| Revisions, restore, delete-and-restore | Built, unit-tested |
| Exports (JSON, Markdown zip), CLI backup/restore | Built, round-trip verified (identical counts and content hash) |
| Starter-wiki importer (24 notes, all DM-only, statuses kept) | Built, tested |
| GitHub shared inbox and snapshot for collaborators | Built, unit-tested, checked live |
| Collaborator API keys, guarded proposals, OpenAPI spec | Built, unit-tested, checked live |
| Campaign-specific secrets, player bookmarks and notes, session prep, campaign journal, living-world tracker | **Not built.** The model leaves room for them (see below) |
| Account and key management screens | **Not built.** Command line only |
| Revision diffs, maps, images, global graph, login rate limiting, deployment config | **Not built** |

**Test totals:**

- `npm test`: 59 unit tests across leak, guardrail, inbox, and snapshot.
- `npm run test:http`: 30 pages and endpoints, each requested as 4 kinds of viewer, plus exports and refused writes.
- `npm run test:e2e`: the browser walkthrough.
- Both leak suites were checked by deliberately breaking the access layer. They failed loudly: 10 to 20 failures in the unit suite, 96 in the HTTP suite.

## How privacy is enforced

- **Two separate axes.** Every entry, section, fact, and connection has its own visibility (`public` or `dm`) and its own editorial status (`canon`, `draft`, `proposed`, `research`, `reference`, `rejected`). Visibility decides who can read something. Status decides whether it's true. A DM-only entry hides everything attached to it.
- **Filtered in SQL, not in the browser.** Every read takes a viewer and goes through `src/lib/access.ts`. DM-only rows are never fetched for visitors, so they can't leak through:
  - page HTML or the React payload inside it
  - search results or snippets
  - autocomplete
  - backlinks or related entries
  - graph nodes or edges
  - the JSON API
  - exports
- **Links to hidden entries are scrubbed.** When a public section links to a DM-only entry, the link target is removed and only the words the author typed remain. Provenance notes and tags are also editorial metadata and stay DM-only.
- **Writes are guarded.** Writes need an editor account. Cookie-authenticated writes must come from the site's own origin. Saved content is cleaned: unknown nodes are dropped, links are limited to http(s), mailto, and same-site, and wiki-link targets are checked.
- **Safe defaults.** New entries start DM-only, and the database defaults every visibility column to `dm`, so anything that forgets to set it stays private.

## Collaborating through GitHub (Vee and Claude)

The repository is the shared hub, so the site never has to be on the public internet.

1. Create a **private** repository on your personal GitHub and push this folder to it (`.gitignore` already keeps out the database, backups, and `.env`). **It must stay private:** `content/world/` contains the DM Ledger.
2. Vee and Claude read the current world from `content/world/` and add proposals as Markdown files in `content/inbox/`. **`content/README.md` is their rulebook**, covering the canon rules and the file format. Give it to Vee as part of her instructions.
3. You review on GitHub (merge, or don't), `git pull`, then use **DM Ledger → Check the inbox**. Each file becomes a proposal: `proposed`, DM-only, signed by its author, appended to an existing entry or created as a new one. Nothing is overwritten, and an unchanged file is never imported twice.
4. Promote what you like in the editor. Then **DM Ledger → Write snapshot**, commit, and push, so collaborators see the current state.

If Vee can't push from ChatGPT, have her write the file in the `content/README.md` format and add it with GitHub's **Add file** button.

For Claude: connect GitHub in claude.ai **Settings → Connectors**. Then Claude can clone the repo, add inbox files on a branch, open pull requests, and improve the site's code the same way.

### Optional: the API, for when the site is hosted

- **Endpoints:**
  - `GET /api/search?q=`
  - `GET /api/articles`
  - `GET /api/articles/{slug}?format=markdown`
  - `GET /api/graph?slug=`
  - `POST /api/articles` (create an entry)
  - `POST /api/articles/{slug}/proposals` (add to an entry)
- **For a ChatGPT custom GPT:** use `GET /api/openapi.json`. Import it in Actions, and set authentication to "API key, Bearer".
- **Keys:** issue one with `npm run key:create -- "Vee"`. Use `npm run key:list` and `npm run key:revoke -- "Vee"` to manage them. A collaborator key reads everything, including the Ledger, so treat it like a password. Its writes follow the same rules as the inbox. `--editor` issues a full-rights key.
- **Hosting:** ChatGPT and claude.ai can only reach a site with a public HTTPS address. For a quick test you can use a tunnel such as Cloudflare Tunnel or ngrok. For real use, host it with real Postgres (below) and set `PUBLIC_URL` and `COOKIE_SECURE=true`.

## Commands

**Run the site**

| Command | What it does |
| --- | --- |
| `npm run setup` | Migrates, seeds the four entries and two accounts, imports `content/starter-wiki`. Safe to repeat. |
| `npm run dev` | Development server on port 3000. |
| `npm run build` / `npm start` | Production build and server. |
| `npm test` | Unit tests (in-memory database, no server needed). |
| `npm run test:http` | HTTP leak suite against `BASE_URL` (default `http://localhost:3000`). Needs a running server. |
| `npm run test:e2e` | Browser walkthrough. Needs Chrome; set `CHROME_PATH` if it isn't found. |

**Content and collaborators**

| Command | What it does |
| --- | --- |
| `npm run inbox` / `npm run snapshot` | The Ledger's inbox and snapshot buttons, from the command line. |
| `npm run key:create -- "Name"` / `key:list` / `key:revoke -- "Name"` | Manage collaborator API keys. |
| `npm run user:password -- <email> "<password>"` | Change a password. Signs that account out everywhere. |

**Data**

| Command | What it does |
| --- | --- |
| `npm run backup` / `npm run restore -- <file>` | Full backup to `backups/`. Restore only runs into an empty database. |
| `npm run db:reset -- --yes` | Delete the local database. Run `setup` afterwards. |
| `npm run db:generate` / `npm run db:migrate` | Create or apply schema migrations. |

**PGlite allows one process at a time.** Stop `npm run dev` before running `setup`, `backup`, `restore`, `inbox`, `snapshot`, `key:*`, or `user:password`. The Ledger's buttons and exports work while the site is running.

## Data, backups, portability

- **Backup:** `npm run backup` writes everything, password hashes included, to a JSON file. Keep it private. Copying `.data/pglite` while the site is stopped is also a valid backup.
- **Exports:** the Ledger exports everything as JSON or as Markdown (Obsidian-style `[[links]]` with front matter). The footer links export the public guide only.
- **Real Postgres:** set `DATABASE_URL=postgres://…`, then run `npm run setup`. The schema and queries are standard Postgres.

## What was seeded, and why

These are content decisions. Change anything you disagree with.

- **Uthandar** (canon): only the two canon facts, the world's name and the deliberately unnamed continent. A DM-only editorial record notes that Estara was rejected and lists what isn't established.
- **Tallwater, Mercer family, Harlan** (draft): structure only. Every unknown reads *To be established*.
- **Harlan's DM goals** (draft): your one statement, that he is "deeply committed to an objective and willing to go very far", with its source attached. The objective itself is empty.
- **The three connections** Harlan → member of → Mercer family → active in → Tallwater → located in → Uthandar are implied by the handoffs but never stated, so they're `draft`.
- **The 24 starter notes** are imported as DM-only, each with its original status. Literal `\n` text in *00 - Start Here* became real line breaks, and links resolve by filename the way Obsidian does. The raw transcript archive is not imported.
- **"A field guide kept by the Adventurer's Guild"** is the site's framing from your brief, not a claim about the world. Change it in the `worlds` table.

## Stack and trade-offs

- **Next.js 16 + TypeScript:** one codebase for pages, API, and server-side authorization. Every page renders per request, so filtered output is never cached as static.
- **Drizzle + PGlite or Postgres:** you install nothing locally, and the code moves to a real server unchanged. PGlite's limit is one process at a time, which is fine for one DM's machine. Use real Postgres once it's hosted.
- **Tiptap for editing, stored as JSON and rendered on the server:** the editor is solid. The server renders only known node types, which is what makes link scrubbing and XSS cleaning possible. Markdown goes in through the importer and the API, and comes out through the exports.
- **React Flow for the story web:** focused on one entry and expandable, rather than one giant global graph.
- **Hand-rolled cookie sessions with bcrypt:** small and auditable, and every permission check is server-side. Add an auth provider later if you need single sign-on.

## Where future features fit

- **Campaign secrets** ("one group learning a secret must not reveal it to all groups"): add a `campaign_id` scope to visibility and a viewer field for the campaign. Every query already goes through `visibleTo()`, so the change is concentrated there.
- **Living world, session prep, journals:** new tables keyed to articles, presented as more DM Ledger sections. The faction template already records "current trajectory if nobody acts".
- **More worlds:** every row already carries `world_id`. Switch worlds with `WORLD_SLUG`; a world picker is UI work.

## Layout

```
src/db/        schema, migrations runner, seed, starter importer, backup
src/lib/       access.ts (permission rules), queries.ts (all reads), mutations.ts (all writes),
               inbox.ts (GitHub inbox + snapshot), export.ts, markdown.ts, auth.ts
src/app/       pages, API routes, Ledger
src/components DocRenderer (server-side rendering), StoryWeb (graph), editor/
content/       starter-wiki/ (imported), inbox/ (proposals), world/ (snapshot), README.md (collaborator rules)
drizzle/       SQL migrations
tests/         unit tests, http/ leak suite, e2e/ browser walkthrough
```
