/**
 * km on Canvas — Prototype
 *
 * Renders a km-like kanban board using silvery Box/Text on Canvas2D
 * with proportional text. Supports two modes:
 *
 * 1. Mock data (default) — static demo board
 * 2. Remote repo — connects to km-web server for real vault data
 *
 * Usage:
 *   ?mode=mock   — mock data (default)
 *   ?mode=remote&url=ws://localhost:3847/ws — real vault data
 */

import React from "react"
import {
  renderToCanvas,
  Box,
  Text,
  type CanvasRenderOptions,
} from "../../../vendor/silvery/packages/ag-react/src/ui/canvas/index.js"
import type {
  CanvasInstance,
  CanvasRenderBuffer,
} from "../../../vendor/silvery/packages/ag-react/src/ui/canvas/index.js"

// ============================================================================
// Types
// ============================================================================

interface Card {
  id: string
  title: string
  status?: "todo" | "in_progress" | "done" | "blocked"
  tags?: string[]
  due?: string
  priority?: "P0" | "P1" | "P2" | "P3"
}

interface Column {
  name: string
  cards: Card[]
}

// ============================================================================
// Mock board data
// ============================================================================

const mockBoard: Column[] = [
  {
    name: "Inbox",
    cards: [
      { id: "1", title: "Review PR #847 — canvas adapter HiDPI scaling", status: "todo", priority: "P1" },
      { id: "2", title: "Update silvery docs for v0.5 release", status: "todo", tags: ["docs"] },
      { id: "3", title: "Fix meta-6 not found in tree walking", status: "done" },
    ],
  },
  {
    name: "In Progress",
    cards: [
      {
        id: "4",
        title: "km-silvery.ag-canvas: prototype canvas rendering",
        status: "in_progress",
        priority: "P2",
        tags: ["canvas", "v2.0"],
      },
      {
        id: "5",
        title: "Pretext integration for proportional text measurement",
        status: "in_progress",
        due: "2026-04-05",
      },
      { id: "6", title: "Write canvas rendering tests (13 tests passing)", status: "in_progress" },
    ],
  },
  {
    name: "Done",
    cards: [
      { id: "7", title: "keyToAnsi Shift encoding for legacy terminals", status: "done" },
      { id: "8", title: "Diagnostic overlay: DOM vs Canvas rect comparison", status: "done" },
      { id: "9", title: "DOM-backed measurer for pixel-perfect CSS parity", status: "done" },
      { id: "10", title: "HiDPI rendering via DPR scaling", status: "done" },
    ],
  },
  {
    name: "Blocked",
    cards: [
      {
        id: "11",
        title: "Mouse input for canvas — needs hit testing from ag tree",
        status: "blocked",
        priority: "P3",
      },
      { id: "12", title: "Ship @silvery/canvas as standalone npm package", status: "blocked", tags: ["release"] },
    ],
  },
]

// ============================================================================
// Status icons (matching km's TUI style)
// ============================================================================

const STATUS_ICONS: Record<string, string> = {
  todo: "\u25cb",
  in_progress: "\u25d0",
  done: "\u2713",
  blocked: "\u2717",
}
const STATUS_COLORS: Record<string, string> = {
  todo: "#cdd6f4",
  in_progress: "#89b4fa",
  done: "#a6e3a1",
  blocked: "#f38ba8",
}
const PRIORITY_COLORS: Record<string, string> = { P0: "#f38ba8", P1: "#fab387", P2: "#f9e2af", P3: "#6c7086" }

// ============================================================================
// Components
// ============================================================================

function CardView({ card, isSelected, width }: { card: Card; isSelected: boolean; width: number }) {
  const icon = STATUS_ICONS[card.status ?? ""] ?? "\u25cb"
  const iconColor = STATUS_COLORS[card.status ?? ""] ?? "#6c7086"
  const bg = isSelected ? "#313244" : undefined

  return (
    <Box flexDirection="column" backgroundColor={bg} paddingX={8} paddingY={4} width={width}>
      <Box>
        <Text color={iconColor}>{icon} </Text>
        <Box flexShrink={1}>
          <Text
            color={card.status === "done" ? "#6c7086" : "#cdd6f4"}
            strikethrough={card.status === "done"}
            wrap="wrap"
          >
            {card.title}
          </Text>
        </Box>
      </Box>
      {(card.priority || card.tags || card.due) && (
        <Box marginLeft={14} marginTop={2} gap={6}>
          {card.priority && (
            <Text color={PRIORITY_COLORS[card.priority ?? ""] ?? ""} bold>
              {card.priority}
            </Text>
          )}
          {card.tags?.map((tag) => (
            <Text key={tag} color="#585b70">
              #{tag}
            </Text>
          ))}
          {card.due && <Text color="#f9e2af">{card.due}</Text>}
        </Box>
      )}
    </Box>
  )
}

function ColumnView({
  col,
  width,
  selectedCardId,
  isActive,
}: {
  col: Column
  width: number
  selectedCardId: string | null
  isActive: boolean
}) {
  const headerBg = isActive ? "#313244" : "#1e1e2e"

  return (
    <Box flexDirection="column" width={width}>
      <Box backgroundColor={headerBg} paddingX={8} paddingY={4} borderBottom borderColor="#45475a" borderStyle="single">
        <Text bold color={isActive ? "#89b4fa" : "#a6adc8"}>
          {col.name}
        </Text>
        <Text color="#585b70"> ({col.cards.length})</Text>
      </Box>
      <Box flexDirection="column" paddingTop={2}>
        {col.cards.map((card) => (
          <CardView key={card.id} card={card} isSelected={card.id === selectedCardId} width={width} />
        ))}
      </Box>
    </Box>
  )
}

function TopBar({ width, breadcrumb }: { width: number; breadcrumb?: string }) {
  return (
    <Box backgroundColor="#181825" paddingX={8} paddingY={4} width={width} justifyContent="space-between">
      <Box gap={6}>
        <Text bold color="#89b4fa">
          km
        </Text>
        {breadcrumb ? (
          <>
            <Text color="#6c7086">/</Text>
            <Text color="#cdd6f4">{breadcrumb}</Text>
          </>
        ) : (
          <>
            <Text color="#6c7086">/</Text>
            <Text color="#cdd6f4">Inbox</Text>
            <Text color="#6c7086">&gt;</Text>
            <Text color="#cdd6f4">Review PR #847</Text>
          </>
        )}
      </Box>
      <Text color="#585b70">canvas prototype</Text>
    </Box>
  )
}

function KeyBar({ width }: { width: number }) {
  const keys = [
    { key: "j/k", desc: "navigate" },
    { key: "h/l", desc: "columns" },
    { key: "Enter", desc: "edit" },
    { key: "z", desc: "zoom" },
    { key: "?", desc: "help" },
  ]
  return (
    <Box backgroundColor="#181825" paddingX={8} paddingY={3} width={width} gap={12}>
      {keys.map(({ key, desc }) => (
        <Box key={key} gap={4}>
          <Text bold color="#a6adc8">
            {key}
          </Text>
          <Text color="#585b70">{desc}</Text>
        </Box>
      ))}
    </Box>
  )
}

function KmBoard({ width, board, breadcrumb }: { width: number; board: Column[]; breadcrumb?: string }) {
  const colCount = board.length
  const colWidth = Math.floor(width / Math.max(colCount, 1))

  return (
    <Box flexDirection="column" width={width}>
      <TopBar width={width} breadcrumb={breadcrumb} />
      <Box>
        {board.map((col, i) => (
          <ColumnView
            key={col.name}
            col={col}
            width={colWidth}
            selectedCardId={i === 0 ? (board[0]?.cards[0]?.id ?? null) : null}
            isActive={i === 0}
          />
        ))}
      </Box>
      <KeyBar width={width} />
    </Box>
  )
}

// ============================================================================
// Remote repo → Column[] derivation
// ============================================================================

interface KNode {
  id: string
  type: string
  parent_id: string | null
  parent_idx?: number
  content?: string
  title?: string
  name?: string
  task_status?: string
  task_marker?: string
  item?: boolean
  fstype?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

interface RepoLikeMinimal {
  getChildren(parentId: string | null): KNode[]
  getNode(id: string): KNode | null
}

/** Derive Column[] from a repo-like interface for rendering */
function deriveColumnsFromRepo(repo: RepoLikeMinimal, rootId: string | null): Column[] {
  // getChildren(null) maps to "." in the cache, returning root-level items directly
  const children = repo.getChildren(rootId)
  const columns: Column[] = []

  for (const child of children) {
    // Any node with children can be a column — don't filter too aggressively
    const isOutline =
      child.item === true ||
      child.type === "h" ||
      child.fstype === "mdsection" ||
      child.fstype === "mdfile" ||
      child.fstype === "folder"
    if (!isOutline) continue

    const cardNodes = repo.getChildren(child.id)
    const cards: Card[] = cardNodes.map((node) => ({
      id: node.id,
      title: node.content || node.title || node.name || "(untitled)",
      status: (node.task_status as Card["status"]) ?? undefined,
      priority: extractPriority(node),
      tags: extractTags(node),
      due: extractDue(node),
    }))

    columns.push({
      name: child.content || child.title || child.name || "(untitled)",
      cards,
    })
  }

  return columns
}

function extractPriority(node: KNode): Card["priority"] | undefined {
  const content = node.content ?? ""
  const match = content.match(/\b(P[0-3])\b/)
  return match ? (match[1] as Card["priority"]) : undefined
}

function extractTags(node: KNode): string[] | undefined {
  const content = node.content ?? ""
  const tags = [...content.matchAll(/#(\w+)/g)].map((m) => m[1] ?? "")
  return tags.length > 0 ? tags : undefined
}

function extractDue(node: KNode): string | undefined {
  const due = node.data?.due_at ?? (node as Record<string, unknown>).due_at
  if (typeof due === "string") return due.slice(0, 10) // YYYY-MM-DD
  return undefined
}

// ============================================================================
// Canvas rendering
// ============================================================================

let instance: CanvasInstance | null = null
let currentFont = '"Inter", system-ui, sans-serif'
let currentBoard: Column[] = mockBoard
let currentBreadcrumb: string | undefined

function mount(width: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  const viewport = document.getElementById("viewport") as HTMLDivElement
  const status = document.getElementById("status") as HTMLDivElement
  if (!canvas) return

  viewport.style.width = `${width}px`

  if (instance) instance.unmount()

  const opts: CanvasRenderOptions = {
    monospace: false,
    fontSize: 13,
    fontFamily: currentFont,
    lineHeight: 1.4,
    backgroundColor: "#1e1e2e",
    foregroundColor: "#cdd6f4",
    width,
    height: 800,
    input: true,
  }

  const t0 = performance.now()
  instance = renderToCanvas(<KmBoard width={width} board={currentBoard} breadcrumb={currentBreadcrumb} />, canvas, opts)

  // Auto-size height
  const dpr = window.devicePixelRatio || 1
  const buf = instance.getBuffer() as CanvasRenderBuffer | null
  let contentHeight = 800
  if (buf?.canvas) {
    contentHeight = Math.ceil(buf.canvas.height / dpr)
    instance.resize(width, contentHeight)
  }

  const elapsed = (performance.now() - t0).toFixed(1)

  // Count nodes in ag tree
  const root = instance.getRoot()
  let nodeCount = 0
  function countNodes(node: import("../../../vendor/silvery/packages/ag/src/types.js").AgNode) {
    nodeCount++
    for (const child of node.children) countNodes(child)
  }
  if (root) countNodes(root)

  const cardCount = currentBoard.reduce((sum, col) => sum + col.cards.length, 0)
  const modeLabel = isRemoteMode ? "remote" : "mock"
  const fontName = (currentFont.split(",")[0] ?? "").replace(/"/g, "")
  status.textContent = `Rendered in ${elapsed}ms \u00b7 ${nodeCount} ag nodes \u00b7 ${currentBoard.length} columns \u00b7 ${cardCount} cards \u00b7 ${width}\u00d7${contentHeight}px \u00b7 ${dpr}x DPR \u00b7 ${modeLabel} \u00b7 font: ${fontName}`
}

// ============================================================================
// Mode detection and initialization
// ============================================================================

const params = new URLSearchParams(window.location.search)
const mode = params.get("mode") ?? "mock"
const wsUrl = params.get("url") ?? "ws://localhost:3847/ws"
const isRemoteMode = mode === "remote"

// ============================================================================
// Controls
// ============================================================================

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement
const fontSelect = document.getElementById("font-select") as HTMLSelectElement
const autoWidthCheckbox = document.getElementById("auto-width") as HTMLInputElement | null

let autoWidth = true // default: match window width

// Set initial slider to window width immediately (before fonts load)
slider.value = String(window.innerWidth - 32)
valueLabel.textContent = `${slider.value}px`

function getEffectiveWidth(): number {
  if (autoWidth) {
    return window.innerWidth - 32 // 16px padding each side
  }
  return parseInt(slider.value)
}

function updateWidth() {
  const w = getEffectiveWidth()
  slider.value = String(w)
  valueLabel.textContent = `${w}px`
  mount(w)
}

slider.addEventListener("input", () => {
  autoWidth = false
  if (autoWidthCheckbox) autoWidthCheckbox.checked = false
  const w = parseInt(slider.value)
  valueLabel.textContent = `${w}px`
  mount(w)
})

fontSelect.addEventListener("change", () => {
  currentFont = fontSelect.value
  updateWidth()
})

if (autoWidthCheckbox) {
  autoWidthCheckbox.addEventListener("change", () => {
    autoWidth = autoWidthCheckbox.checked
    if (autoWidth) updateWidth()
  })
}

// Responsive: re-render on window resize
let resizeTimer: ReturnType<typeof setTimeout>
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (autoWidth) updateWidth()
  }, 16)
})

// ============================================================================
// Start
// ============================================================================

async function init() {
  const status = document.getElementById("status") as HTMLDivElement

  if (isRemoteMode) {
    status.textContent = `Connecting to ${wsUrl}...`
    try {
      const { createRemoteRepo } = await import("../../km-web/src/remote-repo.ts")
      const remote = await createRemoteRepo({ url: wsUrl })

      // Derive columns from repo
      currentBoard = deriveColumnsFromRepo(remote.repo as unknown as RepoLikeMinimal, null)
      currentBreadcrumb = `${currentBoard.length} columns \u00b7 remote`

      // Re-render on changes
      remote.repo.subscribe(() => {
        currentBoard = deriveColumnsFromRepo(remote.repo as unknown as RepoLikeMinimal, null)
        updateWidth()
      })

      status.textContent = `Connected — ${currentBoard.length} columns`
    } catch (err) {
      status.textContent = `Connection failed: ${err instanceof Error ? err.message : err}. Using mock data.`
      currentBoard = mockBoard
    }
  }

  await document.fonts.ready
  updateWidth()
}

init().catch(console.error)
