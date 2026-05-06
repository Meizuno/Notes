<script setup lang="ts">
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from 'd3-force'

// Force-directed graph view of the entire vault, à la Obsidian. Nodes
// are notes; edges are wiki-links from `NoteLink`. Dragging a node
// pins it under the cursor and the rest of the simulation responds.
// Hovering highlights the node + its direct neighbours and dims
// everything else. Wheel zooms around the cursor; dragging empty
// space pans.
//
// Rendering strategy: SVG with a single transformed `<g>` for the
// pan/zoom layer. Vue iterates `nodes`/`edges` directly; d3-force
// mutates `x` / `y` on the same node objects in place, and we trigger
// reactivity once per simulation tick. Cheap up to ~1k nodes; switch
// to canvas if/when you cross that.

type Node = SimulationNodeDatum & {
  id: number | string
  title: string
  resolved: boolean
  folder: string | null
  links: number
}

type Edge = SimulationLinkDatum<Node> & {
  source: number | string | Node
  target: number | string | Node
}

const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])
const containerRef = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
const transform = reactive({ x: 0, y: 0, k: 1 })

const hoveredId = ref<number | string | null>(null)

// Compute neighbours of the hovered node (including itself) so we can
// dim everything else. Includes both incoming and outgoing edges.
const neighbours = computed<Set<number | string> | null>(() => {
  if (hoveredId.value == null) return null
  const set = new Set<number | string>([hoveredId.value])
  for (const e of edges.value) {
    const s = typeof e.source === 'object' ? (e.source as Node).id : e.source
    const t = typeof e.target === 'object' ? (e.target as Node).id : e.target
    if (s === hoveredId.value) set.add(t)
    if (t === hoveredId.value) set.add(s)
  }
  return set
})

const isFaded = (id: number | string) => neighbours.value !== null && !neighbours.value.has(id)

const isEdgeFaded = (e: Edge) => {
  if (neighbours.value === null) return false
  const s = typeof e.source === 'object' ? (e.source as Node).id : e.source
  const t = typeof e.target === 'object' ? (e.target as Node).id : e.target
  return !(neighbours.value.has(s) && neighbours.value.has(t))
}

function radius(n: Node) {
  // Scale weakly with link count; resolved nodes are slightly larger
  // than dangling so they dominate visually.
  const base = n.resolved ? 5 : 3.5
  return base + Math.sqrt(n.links) * 1.5
}

// Color nodes by their top-level folder. Each unique top-level folder
// gets a stable color from this palette (cycled by hash of name);
// notes at the root use the neutral fallback. Dangling nodes (links
// to non-existent titles) render dimmed regardless.
const PALETTE = [
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#84cc16', // lime
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6'  // teal
]
const ROOT_NODE = '#64748b'      // slate-500 — visible on both light and dark bg
const DANGLING_NODE = '#cbd5e1'  // slate-300 — softer "missing" tone for light mode

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function nodeFill(n: Node) {
  if (!n.resolved) return DANGLING_NODE
  if (!n.folder) return ROOT_NODE
  const top = n.folder.split('/')[0] ?? ''
  return PALETTE[hashStr(top) % PALETTE.length]!
}

let simulation: Simulation<Node, Edge> | null = null

// Fetch the graph during page setup so the data lands in the SSR
// payload — on first paint after hydration there's no client round-
// trip. The simulation itself still has to start client-side (it
// needs the measured viewport), but the fetch is universal.
const { data: graph } = await useFetch<{ nodes: Node[], edges: Edge[] }>('/api/graph')

if (graph.value) {
  nodes.value = graph.value.nodes
  edges.value = graph.value.edges
}

function centeringStrengths() {
  const portrait = width.value > 0 && width.value < height.value
  return {
    sx: portrait ? 0.18 : 0.06,
    sy: 0.06
  }
}

const PREWARM_TICKS = 80

function startSim() {
  if (simulation) simulation.stop()
  if (!nodes.value.length) return

  const { sx, sy } = centeringStrengths()

  simulation = forceSimulation<Node>(nodes.value)
    .force('link', forceLink<Node, Edge>(edges.value).id(d => d.id).distance(110).strength(0.4))
    .force('charge', forceManyBody().strength(-420))
    .force('x', forceX(width.value / 2).strength(sx))
    .force('y', forceY(height.value / 2).strength(sy))
    .force('collide', forceCollide<Node>().radius(d => radius(d) + 14))
    .alphaDecay(0.05)

  simulation.stop()
  simulation.tick(PREWARM_TICKS)

  simulation
    .alpha(0.3)
    .on('tick', () => {
      triggerRef(nodes)
      triggerRef(edges)
      if (!userInteracted.value) fitToViewport()
    })
    .restart()
}

const userInteracted = ref(false)
const FIT_PADDING = 50

function fitToViewport() {
  if (!nodes.value.length || width.value === 0 || height.value === 0) return
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes.value) {
    if (n.x == null || n.y == null) continue
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  if (!isFinite(minX) || !isFinite(minY)) return

  const bboxW = Math.max(1, maxX - minX)
  const bboxH = Math.max(1, maxY - minY)
  const k = Math.min(
    (width.value  - 2 * FIT_PADDING) / bboxW,
    (height.value - 2 * FIT_PADDING) / bboxH,
    1.5
  )
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  transform.k = k
  transform.x = width.value / 2 - cx * k
  transform.y = height.value / 2 - cy * k
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  userInteracted.value = true
  const factor = Math.exp(-e.deltaY * 0.001)
  const newK = Math.min(8, Math.max(0.2, transform.k * factor))
  const rect = containerRef.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  transform.x = mx - (mx - transform.x) * (newK / transform.k)
  transform.y = my - (my - transform.y) * (newK / transform.k)
  transform.k = newK
}

let panning = false
let panStart = { x: 0, y: 0, tx: 0, ty: 0 }

function onPanStart(e: PointerEvent) {
  if ((e.target as Element).closest('[data-node]')) return
  userInteracted.value = true
  panning = true
  panStart = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}

function onPanMove(e: PointerEvent) {
  if (!panning) return
  transform.x = panStart.tx + (e.clientX - panStart.x)
  transform.y = panStart.ty + (e.clientY - panStart.y)
}

function onPanEnd(e: PointerEvent) {
  panning = false
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
}

const dragState = ref<{ id: number | string, moved: boolean } | null>(null)

function toGraphCoords(e: PointerEvent) {
  const rect = containerRef.value!.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left - transform.x) / transform.k,
    y: (e.clientY - rect.top - transform.y) / transform.k
  }
}

function onNodePointerDown(node: Node, e: PointerEvent) {
  e.stopPropagation()
  userInteracted.value = true
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  if (simulation) simulation.alphaTarget(0.3).restart()
  const { x, y } = toGraphCoords(e)
  node.fx = x
  node.fy = y
  dragState.value = { id: node.id, moved: false }
}

function onNodePointerMove(node: Node, e: PointerEvent) {
  if (!dragState.value || dragState.value.id !== node.id) return
  dragState.value.moved = true
  const { x, y } = toGraphCoords(e)
  node.fx = x
  node.fy = y
}

function onNodePointerUp(node: Node, e: PointerEvent) {
  if (!dragState.value || dragState.value.id !== node.id) return
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  if (simulation) simulation.alphaTarget(0)
  node.fx = null
  node.fy = null
  if (!dragState.value.moved && node.resolved) {
    navigateTo(`/notes/${node.id}`)
  }
  dragState.value = null
}

function measure() {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  width.value = rect.width
  height.value = rect.height
  if (simulation) {
    const { sx, sy } = centeringStrengths()
    simulation
      .force('x', forceX(width.value / 2).strength(sx))
      .force('y', forceY(height.value / 2).strength(sy))
      .alpha(0.3)
      .restart()
  }
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
  if (nodes.value.length) startSim()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  simulation?.stop()
})
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
          <circle
            :cx="n.x ?? 0"
            :cy="n.y ?? 0"
            :r="radius(n)"
            :fill="nodeFill(n)"
            :stroke="n.resolved ? 'transparent' : '#64748b'"
            :stroke-width="n.resolved ? 0 : 1"
            class="node"
          />
          <text
            :x="n.x ?? 0"
            :y="(n.y ?? 0) + radius(n) + 12"
            text-anchor="middle"
            class="label"
            :style="{ fontSize: `${Math.max(10, 12 / transform.k)}px` }"
          >{{ n.title }}</text>
        </g>
      </g>
    </svg>

    <div v-if="!nodes.length" class="absolute inset-0 grid place-items-center">
      <div class="flex flex-col items-center gap-3 text-center px-4">
        <UIcon name="i-lucide-network" class="size-10 text-muted" />
        <p class="text-sm text-muted">No notes yet</p>
        <UButton
          to="/notes/new"
          icon="i-lucide-plus"
          label="Create your first note"
          size="sm"
          color="primary"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-root {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--ui-bg);
  cursor: grab;
  overflow: hidden;
  user-select: none;
  touch-action: none;
}
.graph-root:active { cursor: grabbing; }

.edge {
  stroke: var(--ui-border-accented);
  stroke-width: 1;
  pointer-events: none;
  transition: stroke-opacity 200ms ease-out;
}
.edge-faded { stroke-opacity: 0.2; }

.node {
  cursor: pointer;
  transition: opacity 200ms ease-out, r 200ms ease-out;
}

.label {
  fill: var(--ui-text);
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--ui-bg);
  stroke-width: 3;
  stroke-linejoin: round;
  transition: opacity 200ms ease-out;
}

.node-faded .node,
.node-faded .label {
  opacity: 0.18;
}
</style>
