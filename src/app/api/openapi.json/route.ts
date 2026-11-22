/**
 * OpenAPI 3.1 description of the collaborator API — paste its URL into a ChatGPT
 * custom GPT ("Actions → Import from URL") and set authentication to
 * "API key, Bearer". Set PUBLIC_URL when the site sits behind a proxy or tunnel.
 */
import { REL_TYPE_KEYS, STATUSES, ARTICLE_TYPES, FRAMINGS } from "@/lib/vocab";

export async function GET(req: Request) {
  const server = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  const block = {
    type: "object",
    required: ["markdown", "visibility", "status"],
    properties: {
      heading: { type: "string", description: "Section heading." },
      markdown: { type: "string", description: "Section text in Markdown. Link other entries with [[Entry title]] or [[Entry title|shown text]]." },
      visibility: { type: "string", enum: ["public", "dm"], description: "Collaborator keys are always stored as dm." },
      status: { type: "string", enum: STATUSES, description: "Collaborator keys are always stored as proposed." },
      framing: { type: "string", enum: FRAMINGS, description: "In-world reliability: account, hearsay, contested, or belief." },
      source: { type: "string", description: "Where this came from." },
    },
  };
  const fact = {
    type: "object",
    required: ["label", "visibility", "status"],
    properties: {
      label: { type: "string" },
      value: { type: "string", description: "Leave empty for 'To be established'." },
      visibility: { type: "string", enum: ["public", "dm"] },
      status: { type: "string", enum: STATUSES },
      source: { type: "string" },
    },
  };
  const rel = {
    type: "object",
    required: ["type", "targetId", "visibility", "status"],
    properties: {
      type: { type: "string", enum: REL_TYPE_KEYS, description: "Reads: <this entry> <type> <target>." },
      targetId: { type: "string", format: "uuid", description: "Use the id from searchEntries or getEntry." },
      note: { type: "string" },
      visibility: { type: "string", enum: ["public", "dm"] },
      status: { type: "string", enum: STATUSES },
      source: { type: "string" },
    },
  };
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Uthandar Guild Guide — collaborator API",
      version: "1.0.0",
      description:
        "Read and contribute to the Uthandar campaign-setting wiki. Rules: never present your own suggestions as canon. With a collaborator key, everything you write is stored as `proposed` and DM-only, signed with your key's name, and you cannot overwrite or delete existing text — the DM reviews and promotes it. Use proposeAdditions to add to an existing entry; use createEntry only for a new subject. Search before creating to avoid duplicates.",
    },
    servers: [{ url: server }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "A key issued from the DM Ledger (starts with uth_)." } },
      schemas: { Block: block, Fact: fact, Relationship: rel },
    },
    security: [{ apiKey: [] }],
    paths: {
      "/api/search": {
        get: {
          operationId: "searchEntries",
          summary: "Full-text search across every entry you may read.",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Matching entries with snippets." } },
        },
      },
      "/api/articles": {
        get: { operationId: "listEntries", summary: "List every entry you may read (id, slug, title, type, status, visibility).", responses: { "200": { description: "Entries." } } },
        post: {
          operationId: "createEntry",
          summary: "Create a new entry. Collaborator keys: stored as proposed + DM-only.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "type", "status", "visibility", "blocks", "facts", "relationships"],
                  properties: {
                    title: { type: "string" },
                    type: { type: "string", enum: ARTICLE_TYPES },
                    summary: { type: "string", description: "One or two sentences: what this is and why it matters." },
                    status: { type: "string", enum: STATUSES },
                    visibility: { type: "string", enum: ["public", "dm"] },
                    source: { type: "string", description: "Provenance: where this came from, who approved it." },
                    tags: { type: "array", items: { type: "string" } },
                    blocks: { type: "array", items: { $ref: "#/components/schemas/Block" } },
                    facts: { type: "array", items: { $ref: "#/components/schemas/Fact" } },
                    relationships: { type: "array", items: { $ref: "#/components/schemas/Relationship" } },
                    note: { type: "string", description: "Shown in the entry's history." },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created: id and slug." }, "403": { description: "Key lacks rights." } },
        },
      },
      "/api/articles/{slug}": {
        get: {
          operationId: "getEntry",
          summary: "Read one entry: summary, sections, facts, connections, backlinks.",
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
            { name: "format", in: "query", required: false, schema: { type: "string", enum: ["markdown"] }, description: "Use markdown to get section text as Markdown." },
          ],
          responses: { "200": { description: "The entry." }, "404": { description: "No such entry." } },
        },
      },
      "/api/articles/{slug}/proposals": {
        post: {
          operationId: "proposeAdditions",
          summary: "Append sections, facts, or connections to an existing entry without changing what is there.",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    note: { type: "string", description: "Why you are proposing this." },
                    blocks: { type: "array", items: { $ref: "#/components/schemas/Block" } },
                    facts: { type: "array", items: { $ref: "#/components/schemas/Fact" } },
                    relationships: { type: "array", items: { $ref: "#/components/schemas/Relationship" } },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Added." }, "404": { description: "No such entry." } },
        },
      },
      "/api/graph": {
        get: {
          operationId: "getConnections",
          summary: "An entry and its direct neighbours: typed relationships and text mentions.",
          parameters: [{ name: "slug", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Nodes and edges." } },
        },
      },
    },
  };
  return new Response(JSON.stringify(spec, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
