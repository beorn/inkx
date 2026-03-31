/**
 * km on Canvas — Prototype
 *
 * Renders a km-like kanban board using silvery Box/Text on Canvas2D
 * with proportional text. Proves the v2.0 story: same layout primitives,
 * real typography, pixel rendering.
 *
 * This uses silvery components directly (not km's BoardCore) because
 * the actual km components have deep terminal-specific dependencies.
 * The visual result matches km's TUI layout — columns, cards, status
 * icons, cursor, top bar, key bar.
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
// Mock board data
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

const board: Column[] = [
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

function statusIcon(status?: string): string {
  switch (status) {
    case "todo":
      return "\u25cb" // ○
    case "in_progress":
      return "\u25d0" // ◐
    case "done":
      return "\u2713" // ✓
    case "blocked":
      return "\u2717" // ✗
    default:
      return "\u25cb"
  }
}

function statusColor(status?: string): string {
  switch (status) {
    case "todo":
      return "#cdd6f4"
    case "in_progress":
      return "#89b4fa"
    case "done":
      return "#a6e3a1"
    case "blocked":
      return "#f38ba8"
    default:
      return "#6c7086"
  }
}

function priorityColor(p?: string): string {
  switch (p) {
    case "P0":
      return "#f38ba8"
    case "P1":
      return "#fab387"
    case "P2":
      return "#f9e2af"
    case "P3":
      return "#6c7086"
    default:
      return ""
  }
}

// ============================================================================
// Components
// ============================================================================

function CardView({ card, isSelected, width }: { card: Card; isSelected: boolean; width: number }) {
  const icon = statusIcon(card.status)
  const iconColor = statusColor(card.status)
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
            <Text color={priorityColor(card.priority)} bold>
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

function TopBar({ width }: { width: number }) {
  return (
    <Box backgroundColor="#181825" paddingX={8} paddingY={4} width={width} justifyContent="space-between">
      <Box gap={6}>
        <Text bold color="#89b4fa">
          km
        </Text>
        <Text color="#6c7086">/</Text>
        <Text color="#cdd6f4">Inbox</Text>
        <Text color="#6c7086">&gt;</Text>
        <Text color="#cdd6f4">Review PR #847</Text>
      </Box>
      <Text color="#585b70">4 columns \u00b7 12 cards</Text>
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

function KmBoard({ width, height }: { width: number; height: number }) {
  const colCount = board.length
  const colWidth = Math.floor(width / colCount)

  return (
    <Box flexDirection="column" width={width}>
      <TopBar width={width} />
      <Box>
        {board.map((col, i) => (
          <ColumnView
            key={col.name}
            col={col}
            width={colWidth}
            selectedCardId={i === 0 ? "1" : null}
            isActive={i === 0}
          />
        ))}
      </Box>
      <KeyBar width={width} />
    </Box>
  )
}

// ============================================================================
// Canvas rendering
// ============================================================================

let instance: CanvasInstance | null = null
let currentFont = '"Inter", system-ui, sans-serif'

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
  }

  const t0 = performance.now()
  instance = renderToCanvas(<KmBoard width={width} height={800} />, canvas, opts)

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

  status.textContent = `Rendered in ${elapsed}ms \u00b7 ${nodeCount} ag nodes \u00b7 ${width}\u00d7${contentHeight}px \u00b7 ${dpr}x DPR \u00b7 font: ${currentFont.split(",")[0]!.replace(/"/g, "")}`
}

// ============================================================================
// Controls
// ============================================================================

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement
const fontSelect = document.getElementById("font-select") as HTMLSelectElement

slider.addEventListener("input", () => {
  const w = parseInt(slider.value)
  valueLabel.textContent = `${w}px`
  mount(w)
})

fontSelect.addEventListener("change", () => {
  currentFont = fontSelect.value
  mount(parseInt(slider.value))
})

document.fonts.ready.then(() => mount(parseInt(slider.value)))
