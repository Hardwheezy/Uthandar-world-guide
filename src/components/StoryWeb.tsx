"use client";
/**
 * Focused, article-centred story web. Starts with the entry and its direct
 * neighbours; any node can be expanded. All data comes from /api/graph, which
 * filters nodes AND edges server-side by the viewer's permissions.
 */
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { relLabel, RELATIONSHIP_TYPES, TYPE_LABEL, type ArticleType, type RelType } from "@/lib/vocab";

type GNode = { id: string; slug: string; title: string; type: string; visibility: string };
type GEdge = { id: string; source: string; target: string; kind: "relationship" | "mention"; type: string; visibility: string; status: string };
type Graph = { center: string; nodes: GNode[]; edges: GEdge[] };

type NodeData = GNode & { center: boolean; selected: boolean; expanded: boolean };

function StoryNode({ data }: NodeProps<Node<NodeData>>) {
  const cls = ["graph-node", data.center && "is-center", data.visibility === "dm" && "is-dm", data.selected && "is-selected"].filter(Boolean).join(" ");
  const hidden = { opacity: 0, top: "50%", left: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none" as const };
  return (
    <div className={cls}>
      <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
      {data.title}
      <span className="graph-kind">
        {TYPE_LABEL[data.type as ArticleType] ?? data.type}
        {data.visibility === "dm" ? ", DM only" : ""}
      </span>
      <Handle type="source" position={Position.Bottom} style={hidden} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { story: StoryNode };

function ring(cx: number, cy: number, r: number, n: number, offset = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos(offset + (2 * Math.PI * i) / Math.max(n, 1)), y: cy + r * Math.sin(offset + (2 * Math.PI * i) / Math.max(n, 1)) }));
}

function Inner({ slug, dm }: { slug: string; dm: boolean }) {
  const router = useRouter();
  const flow = useReactFlow();
  const [nodes, setNodes] = useState<Map<string, GNode>>(new Map());
  const [edges, setEdges] = useState<Map<string, GEdge>>(new Map());
  const [pos, setPos] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [centerId, setCenterId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async (s: string): Promise<Graph | null> => {
    const r = await fetch(`/api/graph?slug=${encodeURIComponent(s)}`);
    if (!r.ok) return null;
    return (await r.json()) as Graph;
  }, []);

  const merge = useCallback((g: Graph, origin: { x: number; y: number }, radius: number) => {
    setNodes((prev) => {
      const next = new Map(prev);
      g.nodes.forEach((n) => next.set(n.id, n));
      return next;
    });
    setEdges((prev) => {
      const next = new Map(prev);
      g.edges.forEach((e) => next.set(e.id, e));
      return next;
    });
    setPos((prev) => {
      const next = new Map(prev);
      if (!next.has(g.center)) next.set(g.center, origin);
      const fresh = g.nodes.filter((n) => !next.has(n.id));
      const angle0 = Math.atan2(origin.y, origin.x) || -Math.PI / 2;
      ring(origin.x, origin.y, radius, fresh.length, angle0).forEach((p, i) => next.set(fresh[i].id, p));
      return next;
    });
    setExpanded((prev) => new Set(prev).add(g.center));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setNodes(new Map());
    setEdges(new Map());
    setPos(new Map());
    setExpanded(new Set());
    load(slug).then((g) => {
      if (cancelled) return;
      if (!g) return setState("error");
      setCenterId(g.center);
      merge(g, { x: 0, y: 0 }, 210);
      setState("ready");
      setTimeout(() => flow.fitView({ padding: 0.25, duration: 0 }), 30);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, load, merge, flow]);

  const expand = async (id: string) => {
    const n = nodes.get(id);
    if (!n || expanded.has(id)) return;
    const g = await load(n.slug);
    if (!g) return;
    merge(g, pos.get(id) ?? { x: 0, y: 0 }, 170);
    setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 30);
  };

  const presentTypes = useMemo(() => {
    const t = new Set<string>();
    edges.forEach((e) => t.add(e.kind === "mention" ? "mentions" : e.type));
    return [...t].sort((a, b) => (a === "mentions" ? 1 : b === "mentions" ? -1 : a.localeCompare(b)));
  }, [edges]);

  const relPairs = useMemo(() => {
    const s = new Set<string>();
    edges.forEach((e) => {
      if (e.kind === "relationship" && !hiddenTypes.has(e.type)) s.add([e.source, e.target].sort().join("|"));
    });
    return s;
  }, [edges, hiddenTypes]);

  const rfEdges: Edge[] = useMemo(
    () =>
      [...edges.values()]
        .filter((e) => !hiddenTypes.has(e.kind === "mention" ? "mentions" : e.type))
        // A mention between two entries that already share a typed relationship adds nothing.
        .filter((e) => e.kind !== "mention" || !relPairs.has([e.source, e.target].sort().join("|")))
        .map((e) => {
          const symmetric = RELATIONSHIP_TYPES[e.type as RelType]?.symmetric;
          const isDm = e.visibility === "dm";
          const color = isDm ? "#22325c" : e.kind === "mention" ? "#8b958e" : "#4a554f";
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            type: "straight",
            label: e.kind === "mention" ? undefined : relLabel(e.type, true) + (e.status !== "canon" ? ` (${e.status})` : ""),
            labelStyle: { fontFamily: "var(--sans)", fontSize: 12, fill: isDm ? "#22325c" : "#4a554f", fontWeight: isDm ? 700 : 400 },
            labelBgStyle: { fill: "#f3f5f1" },
            labelBgPadding: [4, 2] as [number, number],
            style: { stroke: color, strokeWidth: isDm ? 2 : 1.4, strokeDasharray: e.kind === "mention" ? "4 4" : undefined },
            markerEnd: e.kind === "mention" || symmetric ? undefined : { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          } satisfies Edge;
        }),
    [edges, hiddenTypes, relPairs],
  );

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>(centerId ? [centerId] : []);
    rfEdges.forEach((e) => {
      ids.add(e.source);
      ids.add(e.target);
    });
    expanded.forEach((id) => ids.add(id));
    return ids;
  }, [rfEdges, centerId, expanded]);

  const rfNodes: Node<NodeData>[] = useMemo(
    () =>
      [...nodes.values()]
        .filter((n) => visibleNodeIds.has(n.id))
        .map((n) => ({
          id: n.id,
          type: "story",
          position: { x: (pos.get(n.id)?.x ?? 0) - 70, y: (pos.get(n.id)?.y ?? 0) - 20 },
          data: { ...n, center: n.id === centerId, selected: n.id === selected, expanded: expanded.has(n.id) },
          ariaLabel: `${n.title}, ${TYPE_LABEL[n.type as ArticleType] ?? n.type}`,
        })),
    [nodes, pos, centerId, selected, expanded, visibleNodeIds],
  );

  const sel = selected ? nodes.get(selected) : null;
  const onlyCenter = state === "ready" && nodes.size <= 1;

  return (
    <div>
      {presentTypes.length > 0 && (
        <fieldset className="graph-controls" style={{ border: 0, padding: 0 }}>
          <legend className="sr-only">Show connection types</legend>
          <span>Show:</span>
          {presentTypes.map((t) => (
            <label key={t}>
              <input
                type="checkbox"
                checked={!hiddenTypes.has(t)}
                onChange={() =>
                  setHiddenTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  })
                }
              />
              {t === "mentions" ? "mentions in text" : relLabel(t, true)}
            </label>
          ))}
        </fieldset>
      )}
      <div className="graph-frame" aria-label="Story web: how this entry connects to others" role="group">
        {state === "error" && <div className="graph-empty">The story web could not be loaded. Reload the page to try again.</div>}
        {onlyCenter && <div className="graph-empty">No connections yet. {dm ? "Add relationships or [[links]] in the editor." : ""}</div>}
        {state !== "error" && !onlyCenter && (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, n) => setSelected(n.id)}
            onNodeDoubleClick={(_, n) => {
              const g = nodes.get(n.id);
              if (g) router.push(`/a/${g.slug}`);
            }}
            onPaneClick={() => setSelected(null)}
            fitView
            minZoom={0.3}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#c9d0c9" />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        )}
        {sel && (
          <div className="graph-panel" role="dialog" aria-label={`${sel.title} options`}>
            <strong>{sel.title}</strong>
            <button className="btn btn-primary" type="button" onClick={() => router.push(`/a/${sel.slug}`)}>
              Open entry
            </button>
            {!expanded.has(sel.id) && (
              <button className="btn" type="button" onClick={() => expand(sel.id)}>
                Show its connections
              </button>
            )}
            <button className="btn btn-quiet" type="button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
        )}
      </div>
      <p className="source-note" style={{ marginTop: "0.5rem" }}>
        Select a name to open it or show its connections. Double-click opens it directly. Solid lines are recorded relationships; dashed lines are mentions in an entry&apos;s text.
      </p>
    </div>
  );
}

export function StoryWeb(props: { slug: string; dm: boolean }) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
