<script setup lang="ts">
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, triggerRef, watch } from "vue";
import { useRouter } from "vue-router";

import { useVault } from "../composables/useVault";
import { api } from "../lib/api";
import type { GraphNode } from "../lib/types";

// Force-directed graph view of the entire vault. Each note node connects to
// its leaf-folder pseudo-node; folder pseudo-nodes connect to their parents,
// so notes cluster around their folder ancestors. Dragging a node pins it
// under the cursor and the rest of the simulation responds. Hovering
// highlights the node + its direct neighbours and dims everything else. Wheel
// zooms around the cursor; dragging empty space pans.
//
// Rendering strategy: SVG with a single transformed `<g>` for the pan/zoom
// layer. Vue iterates `nodes`/`edges` directly; d3-force mutates `x` / `y` on
// the same node objects in place, and we trigger reactivity once per
// simulation tick. Cheap up to ~1k nodes; switch to canvas if/when you cross
// that.

type Node = SimulationNodeDatum & GraphNode;

type Edge = SimulationLinkDatum<Node> & {
  source: string | Node;
  target: string | Node;
};

const router = useRouter();
const { version } = useVault();

const nodes = shallowRef<Node[]>([]);
const edges = shallowRef<Edge[]>([]);
// The Nuxt app had the graph in its server-rendered payload; here it arrives
// after mount, and "No notes yet" must not flash while it does.
const loaded = ref(false);
const containerRef = ref<HTMLElement | null>(null);
const width = ref(0);
const height = ref(0);
const transform = reactive({ x: 0, y: 0, k: 1 });

const hoveredId = ref<string | null>(null);

const endId = (end: string | Node) => (typeof end === "object" ? end.id : String(end));

// Compute neighbours of the hovered node (including itself) so we can dim
// everything else. Includes both incoming and outgoing edges.
const neighbours = computed<Set<string> | null>(() => {
  if (hoveredId.value == null) return null;
  const set = new Set<string>([hoveredId.value]);
  for (const e of edges.value) {
    const s = endId(e.source);
    const t = endId(e.target);
    if (s === hoveredId.value) set.add(t);
    if (t === hoveredId.value) set.add(s);
  }
  return set;
});

const isFaded = (id: string) => neighbours.value !== null && !neighbours.value.has(id);

const isEdgeFaded = (e: Edge) => {
  if (neighbours.value === null) return false;
  return !(neighbours.value.has(endId(e.source)) && neighbours.value.has(endId(e.target)));
};

// Static node sizes: a folder reads a bit bigger than a note so the hierarchy
// stays legible, but size no longer scales with degree. Screen size changes
// the *zoom* (via fitToViewport), never the node size.
const FOLDER_RADIUS = 15;
const NOTE_RADIUS = 11;
function radius(n: Node) {
  return n.type === "folder" ? FOLDER_RADIUS : NOTE_RADIUS;
}

// Label opacity is driven purely by the zoom level — the same for every label.
// Zoomed out, labels fade to 0 (so a dense graph, or any graph on a small
// screen where the fit zoom is lower, isn't a wall of overlapping text); they
// fade up to full as you zoom in. Driven via the `--label-opacity` custom
// property so the hover-fade rule (.node-faded .label) still wins.
const LABEL_ZOOM_MIN = 0.8; // at/below this k, labels are hidden
const LABEL_ZOOM_MAX = 1.7; // at/above this k, labels are fully shown
const LABEL_MID_BUMP = 1.0; // lifts the mid-zoom opacity (0 at both ends, +BUMP/4 at the centre)
// Folder labels are the map's landmarks and always show; so does every label
// around the node under the pointer. The rest fade in with the zoom.
function nodeLabelOpacity(n: Node): number {
  if (n.type === "folder") return 1;
  if (neighbours.value?.has(n.id)) return 1;
  return labelOpacity();
}

function labelOpacity(): number {
  const z = Math.min(1, Math.max(0, (transform.k - LABEL_ZOOM_MIN) / (LABEL_ZOOM_MAX - LABEL_ZOOM_MIN)));
  // Concave bump: same 0 and 1 endpoints, but the middle of the zoom range gets
  // a little extra opacity so labels read sooner through the fade-in.
  return z + LABEL_MID_BUMP * z * (1 - z);
}

// Truncate long titles so labels don't overlap with neighbours. We cap the
// displayed string (not the font size) at MAX_LABEL chars — the full title
// stays in `n.title`.
const MAX_LABEL = 20;
function displayTitle(title: string): string {
  if (title.length <= MAX_LABEL) return title;
  return title.slice(0, MAX_LABEL - 1).trimEnd() + "…";
}

// Colour notes by their top-level folder so each "tree" gets a consistent hue.
// Folder pseudo-nodes use the same hue at a lighter shade so they sit visually
// behind their notes. Root-level notes (no folder) fall back to neutral.
const PALETTE = [
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#84cc16", // lime
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
];
const ROOT_NODE = "#64748b"; // slate-500 — visible on both themes

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function topFolder(n: Node): string {
  // Notes carry their parent folder in `folder`; folder pseudo-nodes carry
  // their *parent* path, so to recover the top-level bucket we read the node
  // id (which is `folder:<full path>`).
  if (n.type === "note") {
    return (n.folder ?? "").split("/")[0] ?? "";
  }
  const path = String(n.id).startsWith("folder:") ? String(n.id).slice("folder:".length) : "";
  return path.split("/")[0] ?? "";
}

function nodeFill(n: Node) {
  const top = topFolder(n);
  if (!top) return ROOT_NODE;
  return PALETTE[hashStr(top) % PALETTE.length]!;
}

let simulation: Simulation<Node, Edge> | null = null;

function centeringStrengths() {
  const portrait = width.value > 0 && width.value < height.value;
  return {
    sx: portrait ? 0.18 : 0.06,
    sy: 0.06,
  };
}

const PREWARM_TICKS = 80;

function startSim() {
  if (simulation) simulation.stop();
  simulation = null;
  if (!nodes.value.length) return;
  // Bail while the container is hidden / zero-size. measure() starts the sim
  // once the container has a real size, so a hidden graph never wastes a
  // simulation.
  if (width.value === 0 || height.value === 0) return;

  const { sx, sy } = centeringStrengths();

  simulation = forceSimulation<Node>(nodes.value)
    // Shorter, stiffer note→folder edges + longer, looser folder→folder edges.
    // This pulls notes tight around their folder anchor while letting folder
    // subtrees breathe apart.
    .force(
      "link",
      forceLink<Node, Edge>(edges.value)
        .id((d) => d.id)
        .distance((e) => {
          const s = typeof e.source === "object" ? e.source.type : null;
          const t = typeof e.target === "object" ? e.target.type : null;
          return s === "folder" && t === "folder" ? 140 : 70;
        })
        .strength((e) => {
          const s = typeof e.source === "object" ? e.source.type : null;
          const t = typeof e.target === "object" ? e.target.type : null;
          return s === "folder" && t === "folder" ? 0.3 : 0.6;
        }),
    )
    // Folder nodes push harder so their child clusters don't overlap.
    .force("charge", forceManyBody<Node>().strength((d) => (d.type === "folder" ? -600 : -300)))
    .force("x", forceX<Node>(width.value / 2).strength(sx))
    .force("y", forceY<Node>(height.value / 2).strength(sy))
    .force("collide", forceCollide<Node>().radius((d) => radius(d) + 14))
    .alphaDecay(0.05);

  simulation.stop();
  simulation.tick(PREWARM_TICKS);

  simulation
    .alpha(0.3)
    .on("tick", () => {
      triggerRef(nodes);
      triggerRef(edges);
      if (!userInteracted.value) fitToViewport();
    })
    .restart();
}

const userInteracted = ref(false);
const FIT_PADDING = 50;

function fitToViewport() {
  if (!nodes.value.length || width.value === 0 || height.value === 0) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes.value) {
    if (n.x == null || n.y == null) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  if (!isFinite(minX) || !isFinite(minY)) return;

  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);
  const k = Math.min((width.value - 2 * FIT_PADDING) / bboxW, (height.value - 2 * FIT_PADDING) / bboxH, 1.5);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  transform.k = k;
  transform.x = width.value / 2 - cx * k;
  transform.y = height.value / 2 - cy * k;
}

// The zoom buttons: around the middle of the view, or back to everything.
function zoomBy(factor: number) {
  userInteracted.value = true;
  const newK = Math.min(8, Math.max(0.2, transform.k * factor));
  const mx = width.value / 2;
  const my = height.value / 2;
  transform.x = mx - (mx - transform.x) * (newK / transform.k);
  transform.y = my - (my - transform.y) * (newK / transform.k);
  transform.k = newK;
}

function refit() {
  userInteracted.value = false;
  fitToViewport();
}

// The legend: each top-level folder in its colour, as the nodes wear it.
const legend = computed(() => {
  const seen = new Map<string, string>();
  for (const n of nodes.value) {
    const top = topFolder(n);
    if (top && !seen.has(top)) seen.set(top, nodeFill(n));
  }
  return [...seen].map(([name, color]) => ({ name, color })).sort((a, b) => a.name.localeCompare(b.name));
});

function onWheel(e: WheelEvent) {
  e.preventDefault();
  userInteracted.value = true;
  const factor = Math.exp(-e.deltaY * 0.001);
  const newK = Math.min(8, Math.max(0.2, transform.k * factor));
  const rect = containerRef.value!.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  transform.x = mx - (mx - transform.x) * (newK / transform.k);
  transform.y = my - (my - transform.y) * (newK / transform.k);
  transform.k = newK;
}

// Pointer state for pan + pinch. We track every pointer that lands on empty
// graph space (node pointers go through their own handlers and are excluded
// here). One active pointer → pan; two → pinch.
const activePointers = new Map<number, { x: number; y: number }>();
let panStart = { x: 0, y: 0, tx: 0, ty: 0 };
let lastPinchDistance = 0;

function setPanAnchor(x: number, y: number) {
  panStart = { x, y, tx: transform.x, ty: transform.y };
}

function onPanStart(e: PointerEvent) {
  if ((e.target as Element).closest("[data-node]")) return;
  userInteracted.value = true;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 1) {
    setPanAnchor(e.clientX, e.clientY);
  } else if (activePointers.size === 2) {
    // Two-finger gesture begins; seed the pinch baseline distance.
    const pts = [...activePointers.values()];
    const p1 = pts[0]!;
    const p2 = pts[1]!;
    lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
}

function onPanMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 1) {
    // One finger / mouse → pan.
    transform.x = panStart.tx + (e.clientX - panStart.x);
    transform.y = panStart.ty + (e.clientY - panStart.y);
  } else if (activePointers.size === 2) {
    // Two fingers → pinch-zoom anchored at the midpoint, same around-cursor
    // math the wheel handler uses.
    const pts = [...activePointers.values()];
    const p1 = pts[0]!;
    const p2 = pts[1]!;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (lastPinchDistance > 0 && dist > 0) {
      const factor = dist / lastPinchDistance;
      const newK = Math.min(8, Math.max(0.2, transform.k * factor));
      const rect = containerRef.value!.getBoundingClientRect();
      const cx = (p1.x + p2.x) / 2 - rect.left;
      const cy = (p1.y + p2.y) / 2 - rect.top;
      transform.x = cx - (cx - transform.x) * (newK / transform.k);
      transform.y = cy - (cy - transform.y) * (newK / transform.k);
      transform.k = newK;
    }
    lastPinchDistance = dist;
  }
}

function onPanEnd(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return;
  (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  activePointers.delete(e.pointerId);

  if (activePointers.size === 1) {
    // Lifted one finger of a pinch — reset pan anchor so the remaining finger
    // continues from where it currently is, not from where it started the
    // pinch.
    const p = [...activePointers.values()][0]!;
    setPanAnchor(p.x, p.y);
    lastPinchDistance = 0;
  } else if (activePointers.size === 0) {
    lastPinchDistance = 0;
  }
}

const dragState = ref<{ id: string; moved: boolean } | null>(null);

function toGraphCoords(e: PointerEvent) {
  const rect = containerRef.value!.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - transform.x) / transform.k,
    y: (e.clientY - rect.top - transform.y) / transform.k,
  };
}

function onNodePointerDown(node: Node, e: PointerEvent) {
  e.stopPropagation();
  userInteracted.value = true;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
  if (simulation) simulation.alphaTarget(0.3).restart();
  const { x, y } = toGraphCoords(e);
  node.fx = x;
  node.fy = y;
  dragState.value = { id: node.id, moved: false };
}

function onNodePointerMove(node: Node, e: PointerEvent) {
  if (!dragState.value || dragState.value.id !== node.id) return;
  dragState.value.moved = true;
  const { x, y } = toGraphCoords(e);
  node.fx = x;
  node.fy = y;
}

function onNodePointerUp(node: Node, e: PointerEvent) {
  if (!dragState.value || dragState.value.id !== node.id) return;
  (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  if (simulation) simulation.alphaTarget(0);
  node.fx = null;
  node.fy = null;
  // Only note clicks navigate; folder pseudo-nodes are structural.
  if (!dragState.value.moved && node.type === "note" && node.slug) {
    void router.push(`/${node.slug}`);
  }
  dragState.value = null;
}

function measure() {
  if (!containerRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  width.value = rect.width;
  height.value = rect.height;
  if (simulation) {
    const { sx, sy } = centeringStrengths();
    simulation
      .force("x", forceX<Node>(width.value / 2).strength(sx))
      .force("y", forceY<Node>(height.value / 2).strength(sy))
      .alpha(0.3)
      .restart();
  } else if (width.value > 0 && height.value > 0 && nodes.value.length) {
    // First time we have a real size (initial paint, or the viewport just
    // grew and un-hid the graph) — kick the simulation off now.
    startSim();
  }
}

async function load() {
  try {
    const graph = await api.getGraph();
    nodes.value = graph.nodes.map((n) => ({ ...n }));
    edges.value = graph.edges.map((e) => ({ ...e }));
  } catch {
    // Keep whatever was drawn; a first failure leaves the empty state.
  } finally {
    loaded.value = true;
  }
  startSim();
}

onMounted(() => {
  // measure() starts the sim once the container has a real size and the
  // graph has arrived, so a graph that's CSS-hidden does no work until shown.
  measure();
  window.addEventListener("resize", measure);
  void load();
});

// A note was written elsewhere in the app (useVault().refreshVault()).
watch(version, () => void load());

onBeforeUnmount(() => {
  window.removeEventListener("resize", measure);
  simulation?.stop();
});
</script>
<template>
  <div
    ref="containerRef"
    class="graph-root"
    @wheel="onWheel"
    @pointerdown="onPanStart"
    @pointermove="onPanMove"
    @pointerup="onPanEnd"
    @pointercancel="onPanEnd"
  >
    <svg :width="width" :height="height" class="block">
      <g :transform="`translate(${transform.x},${transform.y}) scale(${transform.k})`">
        <line
          v-for="(e, i) in edges"
          :key="`e${i}`"
          :x1="(e.source as Node).x ?? 0"
          :y1="(e.source as Node).y ?? 0"
          :x2="(e.target as Node).x ?? 0"
          :y2="(e.target as Node).y ?? 0"
          class="edge"
          :class="{ 'edge-faded': isEdgeFaded(e) }"
        />
        <g
          v-for="n in nodes"
          :key="n.id"
          data-node
          :class="{ 'node-faded': isFaded(n.id) }"
          @pointerenter="hoveredId = n.id"
          @pointerleave="hoveredId = null"
          @pointerdown="onNodePointerDown(n, $event)"
          @pointermove="onNodePointerMove(n, $event)"
          @pointerup="onNodePointerUp(n, $event)"
          @pointercancel="onNodePointerUp(n, $event)"
        >
          <!-- Transparent hit target larger than the visible disc, so taps on
               phones don't need pixel-perfect aim. Visible radius stays the
               same for desktop where mice are precise enough. -->
          <circle :cx="n.x ?? 0" :cy="n.y ?? 0" :r="Math.max(radius(n), 14)" fill="transparent" class="node-hit" />
          <!-- Folder nodes get a stroke ring + lower fill opacity so they read
               as "structural" rather than "navigable." -->
          <circle
            :cx="n.x ?? 0"
            :cy="n.y ?? 0"
            :r="radius(n)"
            :fill="nodeFill(n)"
            :fill-opacity="n.type === 'folder' ? 0.6 : 1"
            :stroke="n.type === 'folder' ? nodeFill(n) : 'transparent'"
            :stroke-width="n.type === 'folder' ? 2 : 0"
            class="node"
            :class="{ 'node-folder': n.type === 'folder' }"
            pointer-events="none"
          />
          <text
            :x="n.x ?? 0"
            :y="(n.y ?? 0) + radius(n) + 12"
            text-anchor="middle"
            class="label"
            :class="{ 'label-folder': n.type === 'folder' }"
            :style="{ fontSize: `${Math.max(10, 12 / transform.k)}px`, '--label-opacity': nodeLabelOpacity(n) }"
          >{{ displayTitle(n.title) }}</text>
        </g>
      </g>
    </svg>

    <ul
      v-if="legend.length"
      class="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5"
      aria-label="Folders"
    >
      <li
        v-for="item in legend"
        :key="item.name"
        class="flex items-center gap-1.5 rounded-full bg-default/80 px-2.5 py-1 text-xs font-bold text-toned shadow-[0_4px_12px_-8px_rgb(30_60_90/0.4)] backdrop-blur dark:bg-elevated/80 dark:shadow-none"
      >
        <span class="size-2 rounded-full" :style="{ background: item.color }" />
        {{ item.name }}
      </li>
    </ul>

    <div
      v-if="nodes.length"
      class="absolute right-3 bottom-3 flex flex-col gap-0.5 rounded-full bg-default/85 p-1 shadow-[0_6px_18px_-10px_rgb(30_60_90/0.45)] backdrop-blur dark:bg-elevated/85 dark:shadow-none dark:ring-1 dark:ring-white/6"
      @pointerdown.stop
      @wheel.stop
    >
      <UButton icon="i-lucide-plus" variant="ghost" color="neutral" size="sm" aria-label="Zoom in" @click="zoomBy(1.3)" />
      <UButton icon="i-lucide-minus" variant="ghost" color="neutral" size="sm" aria-label="Zoom out" @click="zoomBy(1 / 1.3)" />
      <UButton icon="i-lucide-maximize" variant="ghost" color="neutral" size="sm" aria-label="Fit the graph" @click="refit" />
    </div>

    <div v-if="loaded && !nodes.length" class="absolute inset-0 grid place-items-center">
      <div class="flex flex-col items-center gap-3 text-center px-4">
        <UIcon name="i-lucide-network" class="size-10 text-dimmed" />
        <p class="text-sm text-muted">No notes yet</p>
        <UButton to="/new" icon="i-lucide-plus" label="Create your first note" size="sm" color="primary" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-root {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: transparent;
  cursor: grab;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}
.graph-root:active {
  cursor: grabbing;
}

.edge {
  stroke: var(--ui-border-accented);
  stroke-width: 1;
  pointer-events: none;
  transition: stroke-opacity 200ms ease-out;
}
/* Light mode: the border tokens are too faint on white, so use the muted
   text token for the connection lines — a proper grey that reads clearly.
   Dark mode keeps the accented border stroke. */
html:not(.dark) .edge {
  stroke: var(--ui-color-neutral-400);
}
.edge-faded {
  stroke-opacity: 0.2;
}

.node {
  cursor: pointer;
  transition:
    opacity 200ms ease-out,
    r 200ms ease-out;
}
.node-folder {
  cursor: grab;
}

.label {
  fill: var(--ui-text-toned);
  font-weight: 600;
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--ui-bg);
  stroke-width: 3;
  stroke-linejoin: round;
  /* Per-node base opacity (set inline from labelOpacity). The .node-faded
     rule below is more specific, so hover-dimming still wins over this. */
  opacity: var(--label-opacity, 1);
  transition: opacity 200ms ease-out;
}
.label-folder {
  font-weight: 800;
  fill: var(--ui-text-highlighted);
}

.node-faded .node,
.node-faded .label {
  opacity: 0.18;
}
</style>
