/**
 * HTTP-level leak test against a RUNNING server (dev or production build).
 *
 *   BASE_URL=http://localhost:3000 npm run test:http
 *
 * Signs in as the DM, plants canary content through the real API, then requests
 * every page, API endpoint, and export as (1) an anonymous visitor, (2) a player,
 * and (3) the DM in public preview — and fails if the canary appears anywhere,
 * including the inline React Server Component payload inside page HTML.
 * Cleans up after itself (the canary entries end up in "Recently deleted").
 */
import { unzipSync, strFromU8 } from "fflate";
import "../../scripts/_env";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
const CANARY = `httpcanary${RUN}`;
/** A word that appears only inside secret text; searched for directly. Never part of any URL we print. */
const SECRET_WORD = `qvwsealed${RUN}`;
let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error("  FAIL", msg);
  }
};

async function login(email: string, password: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("uth_session="));
  if (!cookie) throw new Error("no session cookie");
  return cookie;
}

const doc = (...parts: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content: parts }] });
const t = (text: string) => ({ type: "text", text });

async function api(method: string, path: string, cookie: string | null, body?: unknown, origin: string | null = BASE) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  return fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

async function main() {
  console.log(`Leak test against ${BASE} with canary "${CANARY}"`);
  const dm = await login(process.env.SEED_DM_EMAIL ?? "dm@uthandar.local", process.env.SEED_DM_PASSWORD ?? "change-me-before-sharing");
  const player = await login(process.env.SEED_PLAYER_EMAIL ?? "player@uthandar.local", process.env.SEED_PLAYER_PASSWORD ?? "change-me-too");

  const harlan = await (await api("GET", "/api/articles/harlan", dm)).json();
  // Secret, DM-only entry
  const secret = await (
    await api("POST", "/api/articles", dm, {
      title: `${CANARY} Secret Compact`,
      slug: `sealed-${RUN}`, // keep the canary out of the URL: Next echoes requested paths in its payload
      type: "faction",
      status: "draft",
      visibility: "dm",
      summary: `${CANARY} summary`,
      tags: [CANARY],
      source: `${CANARY} src`,
      facts: [{ label: `${CANARY} label`, value: "x", visibility: "public", status: "draft" }],
      blocks: [{ heading: `${CANARY} heading`, content: doc(t(`${CANARY} body ${SECRET_WORD}`)), visibility: "public", status: "draft", framing: "account" }],
      relationships: [{ type: "funds", targetId: harlan.article.id, visibility: "public", status: "draft", note: `${CANARY} note` }],
    })
  ).json();
  ok(!!secret.id, "created secret entry");
  // Public entry with DM-only parts and a public link to the secret
  const mixed = await (
    await api("POST", "/api/articles", dm, {
      title: "Http Test Crossing",
      type: "place",
      status: "draft",
      visibility: "public",
      summary: "Public summary.",
      tags: [`${CANARY}-tag`],
      source: `${CANARY} provenance`,
      facts: [
        { label: "Open", value: "yes", visibility: "public", status: "draft", source: `${CANARY} factsrc` },
        { label: `${CANARY} hidden`, value: `${CANARY} value`, visibility: "dm", status: "draft" },
      ],
      blocks: [
        {
          heading: "Open section",
          content: doc(t("Some say "), { type: "wikiLink", attrs: { id: secret.id, title: `${CANARY} Secret Compact`, label: "a compact" } }),
          visibility: "public",
          status: "draft",
          framing: "hearsay",
          source: `${CANARY} blocksrc`,
        },
        { heading: `${CANARY} ledger`, content: doc(t(`${CANARY} plan ${SECRET_WORD} `), { type: "wikiLink", attrs: { id: harlan.article.id, title: "Harlan", label: null } }), visibility: "dm", status: "draft", framing: "account" },
      ],
      relationships: [
        { type: "opposes", targetId: harlan.article.id, visibility: "dm", status: "draft", note: `${CANARY} dm edge` },
        { type: "serves", targetId: secret.id, visibility: "public", status: "draft", note: `${CANARY} to secret` },
      ],
    })
  ).json();
  ok(!!mixed.id, "created mixed entry");

  // Positive control: the DM really can see it.
  const dmPage = await (await fetch(`${BASE}/a/${mixed.slug}`, { headers: { Cookie: dm } })).text();
  ok(dmPage.toLowerCase().includes(CANARY), "positive control: DM page contains canary");
  const dmSearch = await (await fetch(`${BASE}/api/search?q=${SECRET_WORD}`, { headers: { Cookie: dm } })).json();
  ok(dmSearch.results.length === 2, `positive control: DM search finds both canary entries (got ${dmSearch.results.length})`);

  const paths = [
    "/",
    "/explore",
    "/explore?notes=1",
    "/c/places",
    "/c/people",
    "/c/factions",
    "/c/faiths",
    "/c/history",
    `/a/${mixed.slug}`,
    `/a/${secret.slug}`,
    "/a/harlan",
    "/a/mercer-family",
    "/a/tallwater",
    "/search?q=compact",
    "/search?q=plan",
    "/api/search?q=compact",
    "/api/search?q=plan",
    "/api/suggest?q=compact",
    "/api/suggest?q=",
    `/api/graph?slug=${mixed.slug}`,
    "/api/graph?slug=harlan",
    `/api/graph?slug=${secret.slug}`,
    "/api/articles",
    `/api/articles/${mixed.slug}`,
    `/api/articles/${secret.slug}`,
    "/api/articles/harlan",
    "/api/export?format=json",
    `/a/${mixed.slug}/history`,
    `/a/${mixed.slug}/edit`,
    "/ledger",
  ];

  // [label, cookie, extra headers]
  const lenses: [string, string | null, Record<string, string>][] = [
    ["anonymous", null, {}],
    ["player", player, {}],
    ["DM in public preview", `${dm}; uth_preview=public`, {}],
    // A bad API key must read as anonymous, and must NOT fall back to the DM cookie.
    ["bogus API key + DM cookie", dm, { Authorization: "Bearer uth_not-a-real-key" }],
  ];
  for (const [label, cookie, extra] of lenses) {
    console.log(`- ${label}`);
    const lensHeaders: Record<string, string> = { ...(cookie ? { Cookie: cookie } : {}), ...extra };
    for (const p of paths) {
      const r = await fetch(`${BASE}${p}`, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra }, redirect: "manual" });
      const body = (await r.text()).toLowerCase();
      ok(!body.includes(CANARY), `${label}: ${p} leaked the canary (status ${r.status})`);
      ok(!body.includes(secret.id), `${label}: ${p} leaked the secret entry's id`);
      if (p.includes(secret.slug) && !p.includes("graph")) ok(r.status === 404, `${label}: ${p} should be 404, got ${r.status}`);
    }
    // Search for a word that only exists in secret text: there must be no results at all.
    const h = lensHeaders;
    const sr = await (await fetch(`${BASE}/api/search?q=${SECRET_WORD}`, { headers: h })).json();
    ok(sr.results.length === 0, `${label}: search for a secret-only word returned ${sr.results.length} result(s)`);
    const sp = await (await fetch(`${BASE}/search?q=${SECRET_WORD}`, { headers: h })).text();
    ok(sp.includes("Nothing in the guide matches"), `${label}: search page for a secret-only word showed results`);
    ok(!sp.toLowerCase().includes(CANARY), `${label}: search page for a secret-only word leaked the canary`);
    const sg = await (await fetch(`${BASE}/api/suggest?q=${encodeURIComponent("secret compact")}`, { headers: h })).json();
    ok(sg.results.length === 0, `${label}: autocomplete offered the secret entry`);
    const harlanPage = (await (await fetch(`${BASE}/a/harlan`, { headers: lensHeaders })).text()).toLowerCase();
    ok(!harlanPage.includes("deeply committed"), `${label}: Harlan's DM goal leaked`);
    const zip = await (await fetch(`${BASE}/api/export?format=markdown`, { headers: lensHeaders })).arrayBuffer();
    for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(zip)))) {
      ok(!name.toLowerCase().includes(CANARY) && !strFromU8(bytes).toLowerCase().includes(CANARY), `${label}: markdown export ${name} leaked`);
    }
  }

  console.log("- writes without editor rights");
  for (const [label, cookie] of [["anonymous", null], ["player", player]] as const) {
    ok((await api("POST", "/api/articles", cookie, { title: "x", type: "note", status: "draft", visibility: "public", blocks: [], facts: [], relationships: [] })).status === 403, `${label} create refused`);
    ok((await api("PUT", `/api/articles/${mixed.id}`, cookie, { title: "x", type: "note", status: "draft", visibility: "public", blocks: [], facts: [], relationships: [] })).status === 403, `${label} update refused`);
    ok((await api("DELETE", `/api/articles/${mixed.id}`, cookie)).status === 403, `${label} delete refused`);
  }
  ok((await api("DELETE", `/api/articles/${mixed.id}`, dm, undefined, "https://evil.example")).status === 403, "cross-origin delete with DM cookie refused");
  ok((await api("DELETE", `/api/articles/${mixed.id}`, dm, undefined, null)).status === 403, "delete without Origin refused");
  const bogus = await fetch(`${BASE}/api/articles/${mixed.slug}/proposals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer uth_not-a-real-key", Cookie: dm },
    body: JSON.stringify({ facts: [{ label: "x", value: "y", visibility: "dm", status: "draft" }] }),
  });
  ok(bogus.status === 403, `bogus API key cannot propose even with a DM cookie (got ${bogus.status})`);
  const spec = await (await fetch(`${BASE}/api/openapi.json`)).json();
  ok(spec.paths?.["/api/articles/{slug}/proposals"]?.post?.operationId === "proposeAdditions", "OpenAPI spec served");

  // Clean up
  ok((await api("DELETE", `/api/articles/${mixed.id}`, dm)).ok, "cleanup mixed");
  ok((await api("DELETE", `/api/articles/${secret.id}`, dm)).ok, "cleanup secret");

  console.log(failures ? `\n${failures} FAILURE(S)` : `\nAll HTTP leak checks passed (${paths.length} paths × ${lenses.length} viewers, plus exports and write refusals).`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
