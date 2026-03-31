/**
 * km on Canvas — Prototype
 *
 * Renders a km-like kanban board using silvery Box/Text on Canvas2D
 * with proportional text. Supports two modes:
 *
 * 1. Mock data (default) — static demo board
 * 2. Remote repo — connects to km-web server via WebSocket, uses real
 *    useColumns hook for column derivation matching the TUI exactly
 *
 * Usage:
 *   ?mode=mock   — mock data (default)
 *   ?mode=remote&url=ws://localhost:3847/ws — real vault data
 */

import React, { useState } from "react"
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
import { useColumns } from "../src/hooks/use-columns.ts"
import type { ColumnView as RealColumnView, CardView as RealCardView } from "../src/types.ts"
import type { RepoLike } from "../../km-web/src/remote-repo.ts"

// ============================================================================
// Types (simplified for mock mode)
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
// Shared rendering components
// ============================================================================

function CardRow({
  title,
  status,
  isSelected,
  width,
  priority,
  tags,
  due,
}: {
  title: string
  status?: string
  isSelected: boolean
  width: number
  priority?: string
  tags?: string[]
  due?: string
}) {
  const icon = STATUS_ICONS[status ?? ""] ?? "\u25cb"
  const iconColor = STATUS_COLORS[status ?? ""] ?? "#6c7086"
  const bg = isSelected ? "#313244" : undefined

  return (
    <Box flexDirection="column" backgroundColor={bg} paddingX={8} paddingY={4} width={width}>
      <Box>
        <Text color={iconColor}>{icon} </Text>
        <Box flexShrink={1}>
          <Text
            color={status === "done" ? "#6c7086" : "#cdd6f4"}
            strikethrough={status === "done"}
            wrap="wrap"
          >
            {title}
          </Text>
        </Box>
      </Box>
      {(priority || tags || due) && (
        <Box marginLeft={14} marginTop={2} gap={6}>
          {priority && (
            <Text color={PRIORITY_COLORS[priority] ?? ""} bold>
              {priority}
            </Text>
          )}
          {tags?.map((tag) => (
            <Text key={tag} color="#585b70">
              #{tag}
            </Text>
          ))}
          {due && <Text color="#f9e2af">{due}</Text>}
        </Box>
      )}
    </Box>
  )
}

function ColumnHeader({ name, count, isActive }: { name: string; count: number; isActive: boolean }) {
  const headerBg = isActive ? "#313244" : "#1e1e2e"
  return (
    <Box backgroundColor={headerBg} paddingX={8} paddingY={4} borderBottom borderColor="#45475a" borderStyle="single">
      <Text bold color={isActive ? "#89b4fa" : "#a6adc8"}>
        {name}
      </Text>
      <Text color="#585b70"> ({count})</Text>
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
            <Text color="#cdd6f4">canvas prototype</Text>
          </>
        )}
      </Box>
      <Text color="#585b70">canvas</Text>
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

// ============================================================================
// Mock Board (static data)
// ============================================================================

function MockBoard({ width }: { width: number }) {
  const colWidth = Math.floor(width / Math.max(mockBoard.length, 1))

  return (
    <Box flexDirection="column" width={width}>
      <TopBar width={width} />
      <Box>
        {mockBoard.map((col, i) => (
          <Box key={col.name} flexDirection="column" width={colWidth}>
            <ColumnHeader name={col.name} count={col.cards.length} isActive={i === 0} />
            <Box flexDirection="column" paddingTop={2}>
              {col.cards.map((card) => (
                <CardRow
                  key={card.id}
                  title={card.title}
                  status={card.status}
                  isSelected={i === 0 && card.id === "1"}
                  width={colWidth}
                  priority={card.priority}
                  tags={card.tags}
                  due={card.due}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
      <KeyBar width={width} />
    </Box>
  )
}

// ============================================================================
// Remote Board (real useColumns from km-tui)
// ============================================================================

const emptyFoldDepths = new Map<string, number>()

function RemoteBoard({ width, repo }: { width: number; repo: RepoLike }) {
  // Use the REAL useColumns hook — same column derivation as the TUI
  // Cast RepoLike to the expected type — useColumns only uses the subset we implement
  const columns = useColumns(repo as Parameters<typeof useColumns>[0], null, emptyFoldDepths)

  const colCount = columns.length
  const colWidth = Math.floor(width / Math.max(colCount, 1))
  const totalCards = columns.reduce((sum, col) => sum + col.cardNodes.length, 0)

  return (
    <Box flexDirection="column" width={width}>
      <TopBar width={width} breadcrumb={`${colCount} columns \u00b7 ${totalCards} cards \u00b7 remote`} />
      <Box>
        {columns.map((col: RealColumnView, i: number) => (
          <Box key={col.node.id} flexDirection="column" width={colWidth}>
            <ColumnHeader
              name={col.node.content || col.node.title || (col.node as Record<string, unknown>).name as string || "(untitled)"}
              count={col.cardNodes.length}
              isActive={i === 0}
            />
            <Box flexDirection="column" paddingTop={2}>
              {col.cardNodes.map((card: RealCardView, j: number) => (
                <CardRow
                  key={card.id}
                  title={card.content || card.title || (card as Record<string, unknown>).name as string || "(untitled)"}
                  status={card.task_status as string | undefined}
                  isSelected={i === 0 && j === 0}
                  width={colWidth}
                />
              ))}
            </Box>
          </Box>
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
let remoteRepo: RepoLike | null = null

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

  const element = isRemoteMode && remoteRepo
    ? <RemoteBoard width={width} repo={remoteRepo} />
    : <MockBoard width={width} />

  instance = renderToCanvas(element, canvas, opts)

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

  const modeLabel = isRemoteMode ? "remote" : "mock"
  const fontName = (currentFont.split(",")[0] ?? "").replace(/"/g, "")
  status.textContent = `Rendered in ${elapsed}ms \u00b7 ${nodeCount} ag nodes \u00b7 ${width}\u00d7${contentHeight}px \u00b7 ${dpr}x DPR \u00b7 ${modeLabel} \u00b7 font: ${fontName}`
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
      remoteRepo = remote.repo
      status.textContent = `Connected — loading...`
    } catch (err) {
      status.textContent = `Connection failed: ${err instanceof Error ? err.message : err}. Using mock data.`
    }
  }

  await document.fonts.ready
  updateWidth()
}

init().catch(console.error)
