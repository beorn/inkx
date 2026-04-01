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

import React, { useState, useCallback, useEffect } from "react"
import {
  renderToCanvas,
  Box,
  Text,
  type CanvasRenderOptions,
  type CanvasMouseEvent,
} from "../../../vendor/silvery/packages/ag-react/src/ui/canvas/index.js"
import type {
  CanvasInstance,
  CanvasRenderBuffer,
} from "../../../vendor/silvery/packages/ag-react/src/ui/canvas/index.js"
import { useInput } from "../../../vendor/silvery/packages/ag-react/src/hooks/useInput.ts"
import type { Key } from "../../../vendor/silvery/packages/ag/src/keys.ts"
import { useColumns } from "../src/hooks/use-columns.ts"
import type { ColumnView as RealColumnView } from "../src/types.ts"
import type { RepoLike } from "../../km-web/src/remote-repo.ts"

// ============================================================================
// Types
// ============================================================================

interface Card {
  id: string
  title: string
  status?: string
  tags?: string[]
  due?: string
  priority?: string
  /** Number of children (for content indicator) */
  childCount?: number
  /** Has body content (··· indicator) */
  hasBody?: boolean
}

interface Column {
  id: string
  name: string
  cards: Card[]
}

// ============================================================================
// Style constants (Catppuccin Mocha)
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
  card,
  isSelected,
  width,
  isEditing,
  editText,
  isHovered,
}: {
  card: Card
  isSelected: boolean
  width: number
  isEditing?: boolean
  editText?: string
  isHovered?: boolean
}) {
  const icon = STATUS_ICONS[card.status ?? ""] ?? "\u25cb"
  const iconColor = STATUS_COLORS[card.status ?? ""] ?? "#6c7086"

  const displayTitle = isEditing ? `${editText}▌` : card.title

  return (
    <Box
      flexDirection="column"
      backgroundColor={isEditing ? "#45475a" : isSelected ? "#313244" : isHovered ? "#262637" : undefined}
      paddingX={8}
      paddingY={4}
      width={width}
    >
      <Box>
        <Text color={iconColor}>{icon} </Text>
        <Box flexShrink={1}>
          <Text
            color={isEditing ? "#f9e2af" : card.status === "done" ? "#6c7086" : "#cdd6f4"}
            strikethrough={!isEditing && card.status === "done"}
            wrap="wrap"
          >
            {displayTitle}
          </Text>
        </Box>
      </Box>
      {(card.priority || card.tags || card.due || card.childCount || card.hasBody) && (
        <Box marginLeft={14} marginTop={2} gap={6}>
          {card.childCount ? <Text color="#585b70">{card.childCount} ▸</Text> : null}
          {card.hasBody && !card.childCount ? <Text color="#585b70">···</Text> : null}
          {card.priority && (
            <Text color={PRIORITY_COLORS[card.priority] ?? ""} bold>
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

function TopBar({ width, breadcrumb, mode }: { width: number; breadcrumb?: string; mode?: string }) {
  return (
    <Box backgroundColor="#181825" paddingX={8} paddingY={4} width={width} justifyContent="space-between">
      <Box gap={6}>
        <Text bold color="#89b4fa">
          km
        </Text>
        <Text color="#6c7086">/</Text>
        <Text color="#cdd6f4">{breadcrumb ?? "canvas prototype"}</Text>
        {mode && (
          <Text color="#f9e2af" bold>
            {" "}
            [{mode}]
          </Text>
        )}
      </Box>
      <Text color="#585b70">canvas</Text>
    </Box>
  )
}

function KeyBar({ width, hasRepo, isEditing }: { width: number; hasRepo?: boolean; isEditing?: boolean }) {
  const editKeys = [
    { key: "Enter", desc: "save" },
    { key: "Esc", desc: "cancel" },
  ]
  const normalKeys = [
    { key: "j/k", desc: "navigate" },
    { key: "h/l", desc: "columns" },
    { key: "z", desc: "zoom in" },
    { key: "Esc", desc: "zoom out" },
    { key: "g/G", desc: "top/bottom" },
    ...(hasRepo
      ? [
          { key: "e", desc: "edit" },
          { key: "a", desc: "add" },
          { key: "d", desc: "delete" },
        ]
      : []),
  ]
  const keys = isEditing ? editKeys : normalKeys
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
// BoardView — shared board rendering with cursor navigation
// ============================================================================

type AgNode = import("../../../vendor/silvery/packages/ag/src/types.js").AgNode

/** Walk through single-child wrapper nodes to find the BoardView layout node */
function findBoardBox(root: AgNode): AgNode {
  let node = root
  while (node.children.length === 1) node = node.children[0]!
  return node
}

/** Find a card node in the ag tree by column and card index */
function findCardNode(root: AgNode, colIdx: number, cardIdx: number): AgNode | null {
  const columnsContainer = findBoardBox(root).children[1]
  if (!columnsContainer) return null
  const column = columnsContainer.children[colIdx]
  if (!column) return null
  const cardsContainer = column.children[1]
  if (!cardsContainer) return null
  return cardsContainer.children[cardIdx] ?? null
}

/** Find which column and card index a pixel position falls on */
function findCardAtPixel(
  pixelX: number,
  pixelY: number,
  numColumns: number,
): { colIdx: number; cardIdx: number } | null {
  if (!instance) return null
  const root = instance.getRoot()
  if (!root) return null

  const columnsContainer = findBoardBox(root).children[1]
  if (!columnsContainer) return null

  for (let ci = 0; ci < numColumns; ci++) {
    const col = columnsContainer.children[ci]
    if (!col?.renderRect) continue
    const colRect = col.renderRect
    if (pixelX < colRect.x || pixelX >= colRect.x + colRect.width) continue

    // Found the column — now find the card
    const cardsContainer = col.children[1]
    if (!cardsContainer) return { colIdx: ci, cardIdx: 0 }

    for (let ri = 0; ri < cardsContainer.children.length; ri++) {
      const card = cardsContainer.children[ri]
      if (!card?.renderRect) continue
      const r = card.renderRect
      if (pixelY >= r.y && pixelY < r.y + r.height) {
        return { colIdx: ci, cardIdx: ri }
      }
    }
    // Clicked in column but not on a card — select last card
    return { colIdx: ci, cardIdx: Math.max(0, cardsContainer.children.length - 1) }
  }
  return null
}

/** Scroll the viewport to keep the cursor visible, using ag tree positions when available */
function scrollToCursor(colIdx: number, cardIdx: number, instant?: boolean) {
  const viewport = document.getElementById("viewport")
  if (!viewport) return

  // Try accurate scroll via ag tree
  if (instance) {
    const root = instance.getRoot()
    if (root) {
      const cardNode = findCardNode(root, colIdx, cardIdx)
      if (cardNode?.renderRect) {
        // In proportional mode, renderRect coords are already in CSS pixels
        const pixelY = cardNode.renderRect.y
        const pixelH = cardNode.renderRect.height
        const viewTop = viewport.scrollTop
        const viewBottom = viewTop + viewport.clientHeight
        const padding = 40

        if (pixelY < viewTop + padding) {
          viewport.scrollTo({ top: Math.max(0, pixelY - padding), behavior: instant ? "instant" : "smooth" })
        } else if (pixelY + pixelH > viewBottom - padding) {
          viewport.scrollTo({
            top: pixelY + pixelH - viewport.clientHeight + padding,
            behavior: instant ? "instant" : "smooth",
          })
        }
        return
      }
    }
  }

  // Fallback: approximate
  const approxCardY = 30 + cardIdx * 30
  const viewTop = viewport.scrollTop
  const viewBottom = viewTop + viewport.clientHeight
  if (approxCardY < viewTop + 30) {
    viewport.scrollTop = Math.max(0, approxCardY - 30)
  } else if (approxCardY > viewBottom - 60) {
    viewport.scrollTop = approxCardY - viewport.clientHeight + 60
  }
}

function BoardView({
  width,
  columns,
  breadcrumb,
  onZoomIn,
  onZoomOut,
  repo,
}: {
  width: number
  columns: Column[]
  breadcrumb?: string
  onZoomIn?: (cardId: string) => void
  onZoomOut?: () => void
  repo?: RepoLike
}) {
  const [colIndex, setColIndex] = useState(0)
  const [cardIndex, setCardIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [hoverCol, setHoverCol] = useState(-1)
  const [hoverCard, setHoverCard] = useState(-1)

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if (columns.length === 0) return

        const currentCard = columns[colIndex]?.cards[cardIndex]

        // ---- Edit mode ----
        if (isEditing) {
          if (key.escape) {
            setIsEditing(false)
            setIsAdding(false)
          } else if (key.return) {
            // Save
            if (isAdding) {
              const col = columns[colIndex]
              if (repo && col && editText.trim()) {
                repo.addNode(col.id, { type: "p", content: editText.trim(), item: {} } as Partial<
                  import("@km/core").KNode
                >)
              }
            } else if (currentCard && repo) {
              repo.updateNode(currentCard.id, { content: editText })
            }
            setIsEditing(false)
            setIsAdding(false)
          } else if (key.backspace) {
            setEditText((prev) => prev.slice(0, -1))
          } else if (input.length === 1 && !key.ctrl && !key.meta) {
            setEditText((prev) => prev + input)
          }
          return
        }

        // ---- Normal mode ----
        if (input === "j" || key.downArrow) {
          setCardIndex((prev) => {
            const col = columns[colIndex]
            const next = col ? Math.min(prev + 1, col.cards.length - 1) : prev
            scrollToCursor(colIndex, next)
            return next
          })
        } else if (input === "k" || key.upArrow) {
          setCardIndex((prev) => {
            const next = Math.max(prev - 1, 0)
            scrollToCursor(colIndex, next)
            return next
          })
        } else if (input === "h" || key.leftArrow) {
          setColIndex((prev) => {
            const next = Math.max(prev - 1, 0)
            const col = columns[next]
            if (col) setCardIndex((ci) => Math.min(ci, col.cards.length - 1))
            scrollToCursor(next, cardIndex)
            return next
          })
        } else if (input === "l" || key.rightArrow) {
          setColIndex((prev) => {
            const next = Math.min(prev + 1, columns.length - 1)
            const col = columns[next]
            if (col) setCardIndex((ci) => Math.min(ci, col.cards.length - 1))
            scrollToCursor(next, cardIndex)
            return next
          })
        } else if (input === "g") {
          setCardIndex(0)
          scrollToCursor(colIndex, 0, true)
        } else if (input === "G") {
          const col = columns[colIndex]
          if (col) {
            const last = col.cards.length - 1
            setCardIndex(last)
            scrollToCursor(colIndex, last, true)
          }
        } else if (input === "z" && onZoomIn) {
          if (currentCard) onZoomIn(currentCard.id)
        } else if ((key.escape || input === "Z") && onZoomOut) {
          onZoomOut()
        } else if (input === "e" && repo && currentCard) {
          setEditText(currentCard.title)
          setIsEditing(true)
          setIsAdding(false)
        } else if (input === "a" && repo) {
          setEditText("")
          setIsEditing(true)
          setIsAdding(true)
        } else if ((input === "d" || input === "D") && repo && currentCard) {
          repo.deleteNode(currentCard.id)
          // Clamp card index
          const col = columns[colIndex]
          if (col && cardIndex >= col.cards.length - 1) {
            setCardIndex(Math.max(0, col.cards.length - 2))
          }
        }
      },
      [columns, colIndex, cardIndex, onZoomIn, onZoomOut, repo, isEditing, editText, isAdding],
    ),
  )

  // Register click handler for mouse-to-card selection
  useEffect(() => {
    onCanvasClick = (pixelX: number, pixelY: number) => {
      const viewport = document.getElementById("viewport")
      const scrollY = viewport?.scrollTop ?? 0
      const hit = findCardAtPixel(pixelX, pixelY + scrollY, columns.length)
      if (hit) {
        setColIndex(hit.colIdx)
        setCardIndex(hit.cardIdx)
      }
    }
    let lastHoverCol = -1
    let lastHoverCard = -1
    onCanvasHover = (pixelX: number, pixelY: number) => {
      const viewport = document.getElementById("viewport")
      const scrollY = viewport?.scrollTop ?? 0
      const hit = findCardAtPixel(pixelX, pixelY + scrollY, columns.length)
      const nextCol = hit?.colIdx ?? -1
      const nextCard = hit?.cardIdx ?? -1
      // Skip re-render if hover target unchanged
      if (nextCol === lastHoverCol && nextCard === lastHoverCard) return
      lastHoverCol = nextCol
      lastHoverCard = nextCard
      setHoverCol(nextCol)
      setHoverCard(nextCard)
    }
    return () => {
      onCanvasClick = null
      onCanvasHover = null
    }
  }, [columns.length])

  // Min 250px per column, use full width if few columns
  const minColWidth = 250
  const naturalWidth = Math.floor(width / Math.max(columns.length, 1))
  const colWidth = Math.max(naturalWidth, minColWidth)
  const totalWidth = colWidth * columns.length
  const currentCard = columns[colIndex]?.cards[cardIndex]
  const crumb = currentCard
    ? `${breadcrumb ? breadcrumb + " \u203a " : ""}${columns[colIndex]?.name} \u203a ${currentCard.title}`
    : (breadcrumb ?? columns[colIndex]?.name)

  return (
    <Box flexDirection="column" width={totalWidth}>
      <TopBar width={totalWidth} breadcrumb={crumb} mode={isEditing ? (isAdding ? "ADD" : "EDIT") : undefined} />
      <Box>
        {columns.map((col, i) => (
          <Box key={col.name + i} flexDirection="column" width={colWidth}>
            <Box
              backgroundColor={i === colIndex ? "#313244" : "#1e1e2e"}
              paddingX={8}
              paddingY={4}
              borderBottom
              borderColor="#45475a"
              borderStyle="single"
              justifyContent="space-between"
            >
              <Text bold color={i === colIndex ? "#89b4fa" : "#a6adc8"}>
                {col.name}
              </Text>
              <Text color="#585b70">{col.cards.length}</Text>
            </Box>
            <Box flexDirection="column" paddingTop={2}>
              {col.cards.map((card, j) => (
                <CardRow
                  key={card.id}
                  card={card}
                  isSelected={i === colIndex && j === cardIndex}
                  isHovered={i === hoverCol && j === hoverCard && !(i === colIndex && j === cardIndex)}
                  width={colWidth}
                  isEditing={isEditing && !isAdding && i === colIndex && j === cardIndex}
                  editText={editText}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
      <KeyBar width={totalWidth} hasRepo={!!repo} isEditing={isEditing} />
    </Box>
  )
}

// ============================================================================
// Mock board data
// ============================================================================

const mockBoard: Column[] = [
  {
    id: "mock-inbox",
    name: "Inbox",
    cards: [
      { id: "1", title: "Review PR #847 — canvas adapter HiDPI scaling", status: "todo", priority: "P1" },
      { id: "2", title: "Update silvery docs for v0.5 release", status: "todo", tags: ["docs"] },
      { id: "3", title: "Fix meta-6 not found in tree walking", status: "done" },
    ],
  },
  {
    id: "mock-progress",
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
    id: "mock-done",
    name: "Done",
    cards: [
      { id: "7", title: "keyToAnsi Shift encoding for legacy terminals", status: "done" },
      { id: "8", title: "Diagnostic overlay: DOM vs Canvas rect comparison", status: "done" },
      { id: "9", title: "DOM-backed measurer for pixel-perfect CSS parity", status: "done" },
      { id: "10", title: "HiDPI rendering via DPR scaling", status: "done" },
    ],
  },
  {
    id: "mock-blocked",
    name: "Blocked",
    cards: [
      { id: "11", title: "Mouse input for canvas — needs hit testing from ag tree", status: "blocked", priority: "P3" },
      { id: "12", title: "Ship @silvery/canvas as standalone npm package", status: "blocked", tags: ["release"] },
    ],
  },
]

function MockBoardWrapper({ width }: { width: number }) {
  return <BoardView width={width} columns={mockBoard} />
}

// ============================================================================
// Remote Board — real useColumns, zoom, live sync
// ============================================================================

const emptyFoldDepths = new Map<string, number>()

function nodeName(node: { content?: string; title?: string; name?: string }): string {
  return node.content || node.title || node.name || "(untitled)"
}

/** Convert RealColumnView[] to the generic Column[] for BoardView */
function toColumns(columns: RealColumnView[], repo: RepoLike): Column[] {
  return columns.map((col) => ({
    id: col.node.id,
    name: nodeName(col.node),
    cards: col.cardNodes.map((card) => {
      const children = repo.getChildren(card.id)
      return {
        id: card.id,
        title: nodeName(card),
        status: card.item?.task?.status as string | undefined,
        childCount: children.length || undefined,
        hasBody: card.hasBodyChildren || undefined,
      }
    }),
  }))
}

function RemoteBoard({ width, repo }: { width: number; repo: RepoLike }) {
  const [rootId, setRootId] = useState<string | null>(null)
  const [rootHistory, setRootHistory] = useState<(string | null)[]>([])

  const realColumns = useColumns(repo as Parameters<typeof useColumns>[0], rootId, emptyFoldDepths)
  const columns = toColumns(realColumns, repo)

  // Auto-zoom-out if we landed on a leaf node with no columns
  useEffect(() => {
    if (columns.length === 0 && rootId !== null && rootHistory.length > 0) {
      setRootHistory((prev) => {
        setRootId(prev[prev.length - 1] ?? null)
        return prev.slice(0, -1)
      })
    }
  }, [columns.length, rootId, rootHistory.length])

  const rootNode = rootId ? repo.getNode(rootId) : null
  const breadcrumb = rootNode ? nodeName(rootNode) : undefined

  const onZoomIn = useCallback(
    (cardId: string) => {
      setRootHistory((prev) => [...prev, rootId])
      setRootId(cardId)
    },
    [rootId],
  )

  const onZoomOut = useCallback(() => {
    setRootHistory((prev) => {
      if (prev.length === 0) return prev
      setRootId(prev[prev.length - 1] ?? null)
      return prev.slice(0, -1)
    })
  }, [])

  return (
    <BoardView
      width={width}
      columns={columns}
      breadcrumb={breadcrumb}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      repo={repo}
    />
  )
}

// ============================================================================
// Canvas rendering
// ============================================================================

let instance: CanvasInstance | null = null
let currentFont = '"Inter", system-ui, sans-serif'
let remoteRepo: RepoLike | null = null

let lastFont = ""

/** Module-level click handler — set by BoardView, called by mount() onMouse */
let onCanvasClick: ((pixelX: number, pixelY: number) => void) | null = null
/** Module-level hover handler — set by BoardView, called by mount() onMouse */
let onCanvasHover: ((pixelX: number, pixelY: number) => void) | null = null

function mount(width: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  const viewport = document.getElementById("viewport") as HTMLDivElement
  const status = document.getElementById("status") as HTMLDivElement
  if (!canvas) return

  const t0 = performance.now()
  // Preserve scroll position across re-renders
  const savedScroll = viewport.scrollTop

  viewport.style.width = `${width}px`

  const element =
    isRemoteMode && remoteRepo ? <RemoteBoard width={width} repo={remoteRepo} /> : <MockBoardWrapper width={width} />

  // Reuse existing instance on resize (preserves React state: cursor, zoom)
  // Only full remount when font changes or no instance exists
  if (instance && currentFont === lastFont) {
    instance.resize(width, 800)
    instance.rerender(element)
  } else {
    if (instance) instance.unmount()
    lastFont = currentFont

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
      onMouse: (event: CanvasMouseEvent) => {
        if (event.type === "click") {
          onCanvasClick?.(event.pixelX, event.pixelY)
        } else if (event.type === "mousemove") {
          onCanvasHover?.(event.pixelX, event.pixelY)
        }
      },
    }

    instance = renderToCanvas(element, canvas, opts)
  }

  // Auto-size height
  const dpr = window.devicePixelRatio || 1
  const buf = instance.getBuffer() as CanvasRenderBuffer | null
  let contentHeight = 800
  if (buf?.canvas) {
    contentHeight = Math.ceil(buf.canvas.height / dpr)
    instance.resize(width, contentHeight)
  }

  const elapsed = (performance.now() - t0).toFixed(1)
  const root = instance.getRoot()
  let nodeCount = 0
  function countNodes(node: AgNode) {
    nodeCount++
    for (const child of node.children) countNodes(child)
  }
  if (root) countNodes(root)

  const fontName = (currentFont.split(",")[0] ?? "").replace(/"/g, "")
  status.textContent = `${elapsed}ms \u00b7 ${nodeCount} nodes \u00b7 ${width}\u00d7${contentHeight}px \u00b7 ${dpr}x \u00b7 ${isRemoteMode ? "remote" : "mock"} \u00b7 ${fontName}`

  // Restore scroll position
  viewport.scrollTop = savedScroll
}

// ============================================================================
// Controls + initialization
// ============================================================================

const params = new URLSearchParams(window.location.search)
const isRemoteMode = (params.get("mode") ?? "mock") === "remote"
const wsUrl = params.get("url") ?? "ws://localhost:3847/ws"

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement
const fontSelect = document.getElementById("font-select") as HTMLSelectElement
const autoWidthCheckbox = document.getElementById("auto-width") as HTMLInputElement | null

let autoWidth = true
slider.value = String(window.innerWidth - 32)
valueLabel.textContent = `${slider.value}px`

function getEffectiveWidth(): number {
  return autoWidth ? window.innerWidth - 32 : parseInt(slider.value)
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
  valueLabel.textContent = `${slider.value}px`
  mount(parseInt(slider.value))
})
fontSelect.addEventListener("change", () => {
  currentFont = fontSelect.value
  updateWidth()
})
autoWidthCheckbox?.addEventListener("change", () => {
  autoWidth = autoWidthCheckbox.checked
  if (autoWidth) updateWidth()
})

let resizeTimer: ReturnType<typeof setTimeout>
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (autoWidth) updateWidth()
  }, 16)
})

async function init() {
  const status = document.getElementById("status") as HTMLDivElement
  if (isRemoteMode) {
    status.textContent = `Connecting to ${wsUrl}...`
    try {
      const { createRemoteRepo } = await import("../../km-web/src/remote-repo.ts")
      const remote = await createRemoteRepo({ url: wsUrl })
      remoteRepo = remote.repo
    } catch (err) {
      status.textContent = `Connection failed: ${err instanceof Error ? err.message : err}. Using mock data.`
    }
  }
  await document.fonts.ready
  updateWidth()
}

init().catch(console.error)
