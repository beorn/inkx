/**
 * Shrinkwrap Chat UI — Flexily + Pretext + Canvas2D
 *
 * Proves the v0.5→v2.0 thesis: flexily computes layout, pretext measures text,
 * canvas paints pixels. No DOM layout involved. Shrinkwrap sizing is impossible
 * in CSS — this is the killer feature.
 *
 * Run: cd prototype/canvas-chat && bun install && bunx vite
 */

import {
  Node,
  DIRECTION_LTR,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  JUSTIFY_FLEX_END,
  JUSTIFY_FLEX_START,
  ALIGN_FLEX_END,
  ALIGN_FLEX_START,
} from "flexily"
import { prepareWithSegments, layoutWithLines, walkLineRanges } from "@chenglou/pretext"

// ============================================================================
// Config
// ============================================================================

const DPR = window.devicePixelRatio || 2
const FONT_FAMILY = '"Inter", "SF Pro Text", system-ui, sans-serif'
const FONT = `14px ${FONT_FAMILY}`
const FONT_BOLD = `600 14px ${FONT_FAMILY}`
const FONT_SMALL = `12px ${FONT_FAMILY}`
const FONT_SIZE = 14
const LINE_HEIGHT = 20
const BUBBLE_PAD = 12
const BUBBLE_GAP = 4
const META_HEIGHT = 20 // space for name+time below bubble
const BUBBLE_RADIUS = 14
const SIDE_MARGIN = 16
const TITLE_H = 48
const SLIDER_H = 33 // slider bar height (32px + 1px border)

// Colors
const BG = "#0d1117"
const USER_BG = "#1f6feb"
const USER_TEXT = "#ffffff"
const BOT_BG = "#161b22"
const BOT_TEXT = "#e6edf3"
const BOT_BORDER = "#30363d"
const META_COLOR = "#8b949e"

// ============================================================================
// Chat data
// ============================================================================

interface Message {
  role: "user" | "assistant"
  name: string
  text: string
  time: string
}

const messages: Message[] = [
  { role: "user", name: "You", time: "2:41 PM", text: "How does shrinkwrap sizing work? CSS can't do it, right?" },
  {
    role: "assistant",
    name: "Claude",
    time: "2:41 PM",
    text: "Right! CSS has no way to size a container to the tightest width of wrapped text. If you set max-width: 300px on a paragraph and the text wraps at 280px, the container is still 300px wide.\n\nPretext measures the actual rendered width of each line, and walkLineRanges() gives us the maximum line width — the shrinkwrap width. Flexily then uses this as the box's intrinsic size.",
  },
  {
    role: "user",
    name: "You",
    time: "2:42 PM",
    text: "So this entire UI is laid out by flexily and drawn on canvas? No DOM layout at all?",
  },
  {
    role: "assistant",
    name: "Claude",
    time: "2:42 PM",
    text: "Exactly. The flow is:\n1. Pretext measures each message's text\n2. walkLineRanges() computes shrinkwrap width\n3. Flexily arranges bubbles in a column with flex layout\n4. Canvas2D paints the result\n\nThe DOM is only used for the <canvas> element itself.",
  },
  { role: "user", name: "You", time: "2:43 PM", text: "What about emoji and CJK?" },
  {
    role: "assistant",
    name: "Claude",
    time: "2:43 PM",
    text: "Pretext handles grapheme segmentation via Intl.Segmenter — emoji sequences like 👨‍👩‍👧‍👦 and CJK like 春天到了 are measured correctly. Line breaking follows Unicode rules.",
  },
  { role: "user", name: "You", time: "2:43 PM", text: "This is wild 🚀" },
]

// ============================================================================
// Render
// ============================================================================

function render(canvasWidth: number) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement
  const maxBubbleW = canvasWidth * 0.72

  // -- Step 1: Measure text with Pretext --

  interface BubbleInfo {
    msg: Message
    shrinkW: number
    lines: Array<{ text: string; width: number }>
    textH: number
  }

  const bubbles: BubbleInfo[] = messages.map((msg) => {
    const maxTextW = maxBubbleW - BUBBLE_PAD * 2
    const prepared = prepareWithSegments(msg.text, FONT)

    // Shrinkwrap: tightest width that contains the wrapped text
    let shrinkW = 0
    walkLineRanges(prepared, maxTextW, (line) => {
      if (line.width > shrinkW) shrinkW = line.width
    })
    shrinkW = Math.ceil(shrinkW) + 1

    const { lines, height } = layoutWithLines(prepared, shrinkW, LINE_HEIGHT)
    return {
      msg,
      shrinkW,
      lines: lines as Array<{ text: string; width: number }>,
      textH: height,
    }
  })

  // -- Step 2: Flexily layout tree --

  const root = Node.create()
  root.setFlexDirection(FLEX_DIRECTION_COLUMN)
  root.setWidth(canvasWidth)
  root.setPadding(0, SIDE_MARGIN)
  root.setPadding(1, TITLE_H + SLIDER_H + 8) // top: space for title bar + slider
  root.setPadding(2, SIDE_MARGIN)
  root.setPadding(3, 16) // bottom

  const bubbleNodes: Node[] = []

  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i]
    const isUser = bubble.msg.role === "user"
    const bubbleW = bubble.shrinkW + BUBBLE_PAD * 2

    // Each message group: bubble + meta text, with gap between groups
    const group = Node.create()
    group.setFlexDirection(FLEX_DIRECTION_COLUMN)
    group.setWidth(canvasWidth - SIDE_MARGIN * 2)
    group.setAlignItems(isUser ? ALIGN_FLEX_END : ALIGN_FLEX_START)
    if (i > 0) group.setMargin(1, BUBBLE_GAP + META_HEIGHT)
    root.insertChild(group, root.getChildCount())

    // Bubble box
    const box = Node.create()
    box.setWidth(bubbleW)
    box.setHeight(bubble.textH + BUBBLE_PAD * 2)
    group.insertChild(box, 0)

    bubbleNodes.push(box)
  }

  root.calculateLayout(canvasWidth, undefined, DIRECTION_LTR)

  // Compute total height from flexily's computed layout
  const rootH = root.getComputedHeight()
  const totalH = rootH + META_HEIGHT + 60 // extra for last meta + callout

  // -- Step 3: Size canvas and paint --

  canvas.width = canvasWidth * DPR
  canvas.height = totalH * DPR
  canvas.style.width = `${canvasWidth}px`
  canvas.style.height = `${totalH}px`

  const ctx = canvas.getContext("2d")!
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)

  // Background
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, canvasWidth, totalH)

  // Title bar
  ctx.fillStyle = "#161b22"
  ctx.fillRect(0, 0, canvasWidth, TITLE_H)
  ctx.fillStyle = "#e6edf3"
  ctx.font = FONT_BOLD
  ctx.fillText("Shrinkwrap Chat", 16, 30)
  ctx.fillStyle = "#484f58"
  ctx.font = FONT_SMALL
  ctx.fillText("Flexily + Pretext + Canvas2D", canvasWidth - 190, 30)

  // Separator
  ctx.fillStyle = BOT_BORDER
  ctx.fillRect(0, TITLE_H, canvasWidth, 1)

  // Paint bubbles
  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i]
    const node = bubbleNodes[i]
    const group = node.getParent()!
    const isUser = bubble.msg.role === "user"

    const x = node.getComputedLeft() + group.getComputedLeft() + root.getComputedLeft()
    const y = node.getComputedTop() + group.getComputedTop() + root.getComputedTop()
    const w = node.getComputedWidth()
    const h = node.getComputedHeight()

    // Bubble background
    ctx.beginPath()
    roundRect(ctx, x, y, w, h, BUBBLE_RADIUS)
    ctx.fillStyle = isUser ? USER_BG : BOT_BG
    ctx.fill()
    if (!isUser) {
      ctx.strokeStyle = BOT_BORDER
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Text
    ctx.fillStyle = isUser ? USER_TEXT : BOT_TEXT
    ctx.font = FONT
    const tx = x + BUBBLE_PAD
    let ty = y + BUBBLE_PAD + FONT_SIZE
    for (const line of bubble.lines) {
      ctx.fillText(line.text, tx, ty)
      ty += LINE_HEIGHT
    }

    // Meta (name + time) below bubble
    ctx.fillStyle = META_COLOR
    ctx.font = FONT_SMALL
    const meta = `${bubble.msg.name} · ${bubble.msg.time}`
    const metaY = y + h + 14
    if (isUser) {
      const metaW = ctx.measureText(meta).width
      ctx.fillText(meta, x + w - metaW, metaY)
    } else {
      ctx.fillText(meta, x, metaY)
    }
  }

  // Callout at bottom
  const calloutY = totalH - 52
  ctx.beginPath()
  roundRect(ctx, SIDE_MARGIN, calloutY, canvasWidth - SIDE_MARGIN * 2, 40, 8)
  ctx.fillStyle = "#1f6feb22"
  ctx.fill()
  ctx.fillStyle = "#58a6ff"
  ctx.font = FONT_SMALL
  ctx.fillText("Every bubble is shrink-wrapped to its text. CSS can't do this.", SIDE_MARGIN + 12, calloutY + 24)

  // Cleanup
  root.freeRecursive()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ============================================================================
// Width slider
// ============================================================================

const slider = document.getElementById("width-slider") as HTMLInputElement
const valueLabel = document.getElementById("width-value") as HTMLSpanElement

function onSliderChange() {
  const w = parseInt(slider.value)
  valueLabel.textContent = `${w}px`
  const wrapper = document.getElementById("wrapper")!
  wrapper.style.width = `${w}px`
  render(w)
}

slider.addEventListener("input", onSliderChange)

// Initial render after fonts load
document.fonts.ready.then(() => render(parseInt(slider.value)))
