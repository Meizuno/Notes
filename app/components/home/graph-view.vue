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

// Force-directed graph view of the entire vault. Each note node
// connects to its leaf-folder pseudo-node; folder pseudo-nodes
// connect to their parents, so notes cluster around their folder
// ancestors. Dragging a node pins it under the cursor and the rest
// of the simulation responds. Hovering highlights the node + its
// direct neighbours and dims everything else. Wheel zooms around the
// cursor; dragging empty space pans.
//
// Rendering strategy: SVG with a single transformed `<g>` for the
// pan/zoom layer. Vue iterates `nodes`/`edges` directly; d3-force
// mutates `x` / `y` on the same node objects in place, and we trigger
// reactivity once per simulation tick. Cheap up to ~1k nodes; switch
// to canvas if/when you cross that.

type Node = SimulationNodeDatum & {
  id: string
  title: string
  type: 'note' | 'folder'
  folder: string | null
  links: number
}

type Edge = SimulationLinkDatum<Node> & {
  source: string | Node
  target: string | Node
}

const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])
const containerRef = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
const transform = reactive({ x: 0, y: 0, k: 1 })

const hoveredId = ref<string | null>(null)

// Compute neighbours of the hovered node (including itself) so we can
// dim everything else. Includes both incoming and outgoing edges.
const neighbours = computed<Set<string> | null>(() => {
  if (hoveredId.value == null) return null
  const set = new Set<string>([hoveredId.value])
  for (const e of edges.value) {
    const s = typeof e.source === 'object' ? (e.source as Node).id : String(e.source)
    const t = typeof e.target === 'object' ? (e.target as Node).id : String(e.target)
    if (s === hoveredId.value) set.add(t)
    if (t === hoveredId.value) set.add(s)
  }
  return set
})

const isFaded = (id: string) => neighbours.value !== null && !neighbours.value.has(id)

const isEdgeFaded = (e: Edge) => {
  if (neighbours.value === null) return false
  const s = typeof e.source === 'object' ? (e.source as Node).id : String(e.source)
  const t = typeof e.target === 'object' ? (e.target as Node).id : String(e.target)
  return !(neighbours.value.has(s) && neighbours.value.has(t))
}

function radius(n: Node) {
  // Folder pseudo-nodes scale with how many children point at them
  // (more children → bigger ring) so the hierarchy is readable at
  // a glance. Notes get a slightly larger constant disc than folders'
  // base, with a degree bonus when they happen to be referenced.
  if (n.type === 'folder') return 9 + Math.sqrt(n.links) * 2.2
  return 7 + Math.sqrt(n.links) * 1.4
}

// Truncate long titles so labels don't overlap with neighbours.
// We cap the displayed string (not the font size) at MAX_LABEL chars
// — the full title stays in `n.title` and the hover/select code paths
// can still match against it.
const MAX_LABEL = 20
function displayTitle(title: string): string {
  if (title.length <= MAX_LABEL) return title
  return title.slice(0, MAX_LABEL - 1).trimEnd() + '…'
}

// Colour notes by their top-level folder so each "tree" gets a
// consistent hue. Folder pseudo-nodes use the same hue at a lighter
// shade so they sit visually behind their notes. Root-level notes
// (no folder) fall back to neutral.
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
const ROOT_NODE = '#64748b'      // slate-500 — visible on both themes

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function topFolder(n: Node): string {
  // Notes carry their parent folder in `folder`; folder pseudo-nodes
  // carry their *parent* path, so to recover the top-level bucket
  // we read the node id (which is `folder:<full path>`).
  if (n.type === 'note') {
    return (n.folder ?? '').split('/')[0] ?? ''
  }
  const path = String(n.id).startsWith('folder:')
    ? String(n.id).slice('folder:'.length)
    : ''
  return path.split('/')[0] ?? ''
}

function nodeFill(n: Node) {
  const top = topFolder(n)
  if (!top) return ROOT_NODE
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
    // Shorter, stiffer note→folder edges + longer, looser
    // folder→folder edges. This pulls notes tight around their
    // folder anchor while letting folder subtrees breathe apart.
    .force('link', forceLink<Node, Edge>(edges.value)
      .id(d => d.id)
      .distance(e => {
        const s = (typeof e.source === 'object' ? e.source.type : null)
        const t = (typeof e.target === 'object' ? e.target.type : null)
        return s === 'folder' && t === 'folder' ? 140 : 70
      })
      .strength(e => {
        const s = (typeof e.source === 'object' ? e.source.type : null)
        const t = (typeof e.target === 'object' ? e.target.type : null)
        return s === 'folder' && t === 'folder' ? 0.3 : 0.6
      })
    )
    // Folder nodes push harder so their child clusters don't overlap.
    .force('charge', forceManyBody<Node>().strength(d => d.type === 'folder' ? -600 : -300))
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

// Pointer state for pan + pinch. We track every pointer that lands
// on empty graph space (node pointers go through their own handlers
// and are excluded here). One active pointer → pan; two → pinch.
const activePointers = new Map<number, { x: number, y: number }>()
let panStart = { x: 0, y: 0, tx: 0, ty: 0 }
let lastPinchDistance = 0

function setPanAnchor(x: number, y: number) {
  panStart = { x, y, tx: transform.x, ty: transform.y }
}

function onPanStart(e: PointerEvent) {
  if ((e.target as Element).closest('[data-node]')) return
  userInteracted.value = true
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (activePointers.size === 1) {
    setPanAnchor(e.clientX, e.clientY)
  }
  else if (activePointers.size === 2) {
    // Two-finger gesture begins; seed the pinch baseline distance.
    const pts = [...activePointers.values()]
    const p1 = pts[0]!
    const p2 = pts[1]!
    lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  }
}

function onPanMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (activePointers.size === 1) {
    // One finger / mouse → pan.
    transform.x = panStart.tx + (e.clientX - panStart.x)
    transform.y = panStart.ty + (e.clientY - panStart.y)
  }
  else if (activePointers.size === 2) {
    // Two fingers → pinch-zoom anchored at the midpoint, same
    // around-cursor math the wheel handler uses.
    const pts = [...activePointers.values()]
    const p1 = pts[0]!
    const p2 = pts[1]!
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (lastPinchDistance > 0 && dist > 0) {
      const factor = dist / lastPinchDistance
      const newK = Math.min(8, Math.max(0.2, transform.k * factor))
      const rect = containerRef.value!.getBoundingClientRect()
      const cx = (p1.x + p2.x) / 2 - rect.left
      const cy = (p1.y + p2.y) / 2 - rect.top
      transform.x = cx - (cx - transform.x) * (newK / transform.k)
      transform.y = cy - (cy - transform.y) * (newK / transform.k)
      transform.k = newK
    }
    lastPinchDistance = dist
  }
}

function onPanEnd(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  activePointers.delete(e.pointerId)

  if (activePointers.size === 1) {
    // Lifted one finger of a pinch — reset pan anchor so the
    // remaining finger continues from where it currently is, not
    // from where it started the pinch.
    const p = [...activePointers.values()][0]!
    setPanAnchor(p.x, p.y)
    lastPinchDistance = 0
  }
  else if (activePointers.size === 0) {
    lastPinchDistance = 0
  }
}

const dragState = ref<{ id: string, moved: boolean } | null>(null)

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
  // Only note clicks navigate; folder pseudo-nodes are structural.
  if (!dragState.value.moved && node.type === 'note') {
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
          <!-- Transparent hit target larger than the visible disc, so
               taps on phones don't need pixel-perfect aim. Visible
               radius stays the same for desktop where mice are
               precise enough. -->
          <circle
            :cx="n.x ?? 0"
            :cy="n.y ?? 0"
            :r="Math.max(radius(n), 14)"
            fill="transparent"
            class="node-hit"
          />
          <!-- Folder nodes get a stroke ring + lower fill opacity so
               they read as "structural" rather than "navigable." -->
          <circle
            :cx="n.x ?? 0"
            :cy="n.y ?? 0"
            :r="radius(n)"
            :fill="nodeFill(n)"
            :fill-opacity="n.type === 'folder' ? 0.25 : 1"
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
            :style="{ fontSize: `${Math.max(10, 12 / transform.k)}px` }"
          >{{ displayTitle(n.title) }}</text>
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
.node-folder {
  cursor: grab;
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
.label-folder {
  font-weight: 600;
  fill: var(--ui-text-muted);
}

.node-faded .node,
.node-faded .label {
  opacity: 0.18;
}
</style>
