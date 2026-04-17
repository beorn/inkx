#!/usr/bin/env bun

type BorderKind = "round" | "single" | "bold" | "double" | "classic"
type ButtonVariant = "primary" | "secondary" | "disabled"

type Cell = {
  ch: string
  style: string
}

type Panel = {
  x: number
  y: number
  w: number
  h: number
  innerX: number
  innerY: number
  innerW: number
  innerH: number
}

type InputOptions = {
  label: string
  value?: string
  placeholder?: string
  focused?: boolean
  disabled?: boolean
  showCursor?: boolean
  fillStyle?: string
  labelStyle?: string
}

type RadioItem = {
  label: string
  selected?: boolean
  disabled?: boolean
}

const WIDTH = 100
const HEIGHT = 200

const S = {
  RESET: "\x1b[0m",
  CYAN: "\x1b[36m",
  GREEN: "\x1b[32m",
  YELLOW: "\x1b[33m",
  RED: "\x1b[31m",
  BLUE: "\x1b[94m",
  MAGENTA: "\x1b[35m",
  DIM: "\x1b[2m",
  BOLD: "\x1b[1m",
  ITALIC: "\x1b[3m",
  UNDERLINE: "\x1b[4m",
  BOLD_CYAN: "\x1b[1;36m",
  BOLD_GREEN: "\x1b[1;32m",
  PRIMARY: "\x1b[46;30m",
  GRAY_BG: "\x1b[100m",
  DARK_BG: "\x1b[48;5;236m",
  DARK_GRAY: "\x1b[38;5;240m",
  ORANGE: "\x1b[38;5;208m",
  PURPLE: "\x1b[38;5;141m",

  // Standard ANSI bg helpers for token swatches.
  BG_GREEN: "\x1b[42;30m",
  BG_YELLOW: "\x1b[43;30m",
  BG_RED: "\x1b[41;30m",
  BG_BLUE: "\x1b[44;30m",
  BG_MUTED: "\x1b[100;30m",
} as const

const mix = (...codes: Array<string | undefined>) => codes.filter(Boolean).join("")
const onGray = (...codes: string[]) => mix(S.GRAY_BG, ...codes)
const onDark = (...codes: string[]) => mix(S.DARK_BG, ...codes)

const PANEL = mix(S.DIM, S.DARK_GRAY)
const MUTED = mix(S.DIM, S.DARK_GRAY)
const SUBTLE = S.DARK_GRAY
const DISABLED = mix(S.DIM, S.DARK_GRAY)

const cells: Cell[][] = Array.from({ length: HEIGHT }, () =>
  Array.from({ length: WIDTH }, (): Cell => ({ ch: " ", style: "" })),
)

const BORDERS: Record<BorderKind, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  bold: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  classic: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const fit = (text: string, width: number) => {
  if (width <= 0) return ""
  return Array.from(text).slice(0, width).join("")
}

const padRight = (text: string, width: number) => {
  const clipped = fit(text, width)
  const len = Array.from(clipped).length
  return clipped + " ".repeat(Math.max(0, width - len))
}

const padLeft = (text: string, width: number) => {
  const clipped = fit(text, width)
  const len = Array.from(clipped).length
  return " ".repeat(Math.max(0, width - len)) + clipped
}

const center = (text: string, width: number) => {
  const clipped = fit(text, width)
  const len = Array.from(clipped).length
  const space = Math.max(0, width - len)
  const left = Math.floor(space / 2)
  const right = space - left
  return " ".repeat(left) + clipped + " ".repeat(right)
}

function setCell(x: number, y: number, ch: string, style = ""): void {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return
  cells[y]![x] = { ch, style }
}

function write(x: number, y: number, text: string, style = ""): number {
  if (y < 0 || y >= HEIGHT) return x
  let cursor = x
  for (const ch of Array.from(text)) {
    if (cursor >= WIDTH) break
    if (cursor >= 0) setCell(cursor, y, ch, style)
    cursor += 1
  }
  return cursor
}

function writeSegments(x: number, y: number, segments: Array<[string, string]>): number {
  let cursor = x
  for (const [text, style] of segments) {
    cursor = write(cursor, y, text, style)
  }
  return cursor
}

function fillRect(x: number, y: number, w: number, h: number, style = ""): void {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      setCell(xx, yy, " ", style)
    }
  }
}

function hLine(x: number, y: number, w: number, ch: string, style = ""): void {
  for (let i = 0; i < w; i += 1) {
    setCell(x + i, y, ch, style)
  }
}

function vLine(x: number, y: number, h: number, ch: string, style = ""): void {
  for (let i = 0; i < h; i += 1) {
    setCell(x, y + i, ch, style)
  }
}

function drawBox(x: number, y: number, w: number, h: number, kind: BorderKind, style = ""): void {
  if (w < 2 || h < 2) return
  const b = BORDERS[kind]
  setCell(x, y, b.tl, style)
  setCell(x + w - 1, y, b.tr, style)
  setCell(x, y + h - 1, b.bl, style)
  setCell(x + w - 1, y + h - 1, b.br, style)
  hLine(x + 1, y, w - 2, b.h, style)
  hLine(x + 1, y + h - 1, w - 2, b.h, style)
  vLine(x, y + 1, h - 2, b.v, style)
  vLine(x + w - 1, y + 1, h - 2, b.v, style)
}

function drawPanel(y: number, h: number, title: string, description: string): Panel {
  const x = 2
  const w = 96
  drawBox(x, y, w, h, "single", PANEL)
  write(x + 2, y, ` ${title} `, S.BOLD_CYAN)
  write(x + 3, y + 2, fit(description, w - 8), MUTED)
  hLine(x + 2, y + 3, w - 4, "─", SUBTLE)
  return {
    x,
    y,
    w,
    h,
    innerX: x + 4,
    innerY: y + 5,
    innerW: w - 8,
    innerH: h - 7,
  }
}

function drawProgressBar(
  x: number,
  y: number,
  label: string,
  percent: number,
  fillStyle: string,
  right: Array<[string, string]>,
): void {
  const barW = 44
  const filled = clamp(Math.round((barW * percent) / 100), 0, barW)

  write(x, y, padRight(label, 12), S.BOLD)
  write(x + 12, y, "▕", PANEL)
  for (let i = 0; i < barW; i += 1) {
    setCell(x + 13 + i, y, i < filled ? "█" : "░", i < filled ? fillStyle : MUTED)
  }
  write(x + 13 + barW, y, "▏", PANEL)
  writeSegments(x + 13 + barW + 2, y, right)
}

function drawIndeterminateBar(
  x: number,
  y: number,
  label: string,
  offset: number,
  right: Array<[string, string]>,
): void {
  const barW = 44
  const pattern = Array.from("░▒▓████▓▒░")

  write(x, y, padRight(label, 12), S.BOLD)
  write(x + 12, y, "▕", PANEL)

  for (let i = 0; i < barW; i += 1) {
    const local = i - offset
    if (local >= 0 && local < pattern.length) {
      const style = local % 2 === 0 ? S.CYAN : S.BLUE
      setCell(x + 13 + i, y, pattern[local]!, style)
    } else {
      setCell(x + 13 + i, y, "░", MUTED)
    }
  }

  write(x + 13 + barW, y, "▏", PANEL)
  writeSegments(x + 13 + barW + 2, y, right)
}

function drawInput(x: number, y: number, w: number, opts: InputOptions): void {
  const fillStyle = opts.fillStyle ?? S.GRAY_BG
  const borderStyle = opts.focused ? S.BOLD_CYAN : opts.disabled ? DISABLED : PANEL
  const labelStyle = opts.labelStyle ?? MUTED
  const showCursor = opts.showCursor ?? Boolean(opts.focused)

  write(x, y - 1, opts.label, labelStyle)
  drawBox(x, y, w, 3, "round", borderStyle)
  fillRect(x + 1, y + 1, w - 2, 1, fillStyle)

  if (opts.placeholder) {
    write(x + 2, y + 1, fit(opts.placeholder, w - 4), mix(fillStyle, S.DIM, S.ITALIC, S.DARK_GRAY))
    return
  }

  const maxLen = Math.max(0, w - 4 - (showCursor ? 1 : 0))
  const value = fit(opts.value ?? "", maxLen)
  write(x + 2, y + 1, value, opts.disabled ? mix(fillStyle, S.DARK_GRAY, S.DIM) : mix(fillStyle))

  if (showCursor) {
    write(x + 2 + Array.from(value).length, y + 1, "█", mix(fillStyle, S.BOLD_CYAN))
  }
}

function drawTextArea(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  lines: string[],
  focused = false,
): void {
  const borderStyle = focused ? S.BOLD_CYAN : PANEL
  write(x, y - 1, label, MUTED)
  drawBox(x, y, w, h, "round", borderStyle)
  fillRect(x + 1, y + 1, w - 2, h - 2, S.GRAY_BG)

  for (let i = 0; i < lines.length && i < h - 2; i += 1) {
    write(x + 2, y + 1 + i, fit(lines[i]!, w - 4), onGray())
  }
}

function drawSelectList(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  items: string[],
  selected: number,
  focused = false,
): void {
  write(x, y - 1, label, MUTED)
  drawBox(x, y, w, h, "round", focused ? S.BOLD_CYAN : PANEL)
  fillRect(x + 1, y + 1, w - 2, h - 2, S.GRAY_BG)

  const startY = y + 2
  for (let i = 0; i < items.length; i += 1) {
    const row = startY + i
    if (row >= y + h - 2) break

    if (i === selected) {
      fillRect(x + 1, row, w - 2, 1, S.PRIMARY)
      write(x + 2, row, padRight(`▸ ${items[i]!}`, w - 4), mix(S.PRIMARY, S.BOLD))
    } else {
      write(x + 2, row, fit(`  ${items[i]!}`, w - 4), onGray())
    }
  }

  write(x + 2, y + h - 2, fit("Enter to choose", w - 4), onGray(S.DARK_GRAY))
}

function drawRadioList(x: number, y: number, w: number, h: number, label: string, items: RadioItem[]): void {
  write(x, y - 1, label, MUTED)
  drawBox(x, y, w, h, "round", PANEL)
  fillRect(x + 1, y + 1, w - 2, h - 2, S.GRAY_BG)

  const startY = y + 2
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!
    const row = startY + i
    if (row >= y + h - 2) break

    if (item.disabled) {
      write(x + 2, row, fit(`○ ${item.label}`, w - 4), onGray(S.DARK_GRAY, S.DIM))
      continue
    }

    if (item.selected) {
      writeSegments(x + 2, row, [
        ["◉", onGray(S.CYAN, S.BOLD)],
        [" ", onGray()],
        [fit(item.label, w - 6), onGray(S.BOLD)],
      ])
    } else {
      writeSegments(x + 2, row, [
        ["○", onGray(S.DARK_GRAY)],
        [" ", onGray()],
        [fit(item.label, w - 6), onGray()],
      ])
    }
  }

  write(x + 2, y + h - 2, fit("One target at a time", w - 4), onGray(S.DARK_GRAY))
}

function drawButton(x: number, y: number, w: number, label: string, variant: ButtonVariant, focused = false): void {
  const borderStyle = variant === "disabled" ? DISABLED : focused ? S.BOLD_CYAN : PANEL

  const fillStyle = variant === "primary" ? S.PRIMARY : variant === "secondary" ? S.GRAY_BG : mix(S.GRAY_BG, S.DIM)

  const textStyle =
    variant === "primary"
      ? mix(S.PRIMARY, S.BOLD)
      : variant === "secondary"
        ? mix(S.GRAY_BG, S.DIM)
        : mix(S.GRAY_BG, S.DARK_GRAY, S.DIM)

  drawBox(x, y, w, 3, "round", borderStyle)
  fillRect(x + 1, y + 1, w - 2, 1, fillStyle)
  write(x + 1, y + 1, center(label, w - 2), textStyle)
}

function drawInlineCode(x: number, y: number, code: string): number {
  const w = Array.from(code).length + 2
  fillRect(x, y, w, 1, S.GRAY_BG)
  write(x, y, ` ${code} `, onGray())
  return x + w
}

function drawCodeBlock(x: number, y: number, w: number, h: number): void {
  drawBox(x, y, w, h, "single", PANEL)
  fillRect(x + 1, y + 1, w - 2, h - 2, S.GRAY_BG)

  const line = (row: number, num: number, segments: Array<[string, string]>) => {
    let cx = write(x + 2, y + row, `${padLeft(String(num), 2)} `, onGray(S.DARK_GRAY))
    for (const [text, style] of segments) {
      cx = write(cx, y + row, text, onGray(style))
    }
  }

  line(1, 1, [
    ["import", S.PURPLE],
    [" { ", ""],
    ["createApp", S.CYAN],
    [" } ", ""],
    ["from", S.PURPLE],
    [" ", ""],
    ['"silvery"', S.ORANGE],
    [";", ""],
  ])

  line(2, 2, [
    ["const", S.PURPLE],
    [" app = ", ""],
    ["createApp", S.CYAN],
    ["({ title: ", ""],
    ['"Demo"', S.ORANGE],
    [" });", ""],
  ])

  line(3, 3, [
    ["app.key", S.CYAN],
    ['("', ""],
    ["q", S.ORANGE],
    ['", () => process.exit(0));', ""],
  ])

  line(4, 4, [
    ["app.route", S.CYAN],
    ['("', ""],
    ["/", S.ORANGE],
    ['", () => "', ""],
    ["Deploy", S.ORANGE],
    ['");', ""],
  ])

  line(5, 5, [
    ["app.mount", S.CYAN],
    ["();", ""],
  ])
}

function drawBlockquote(x: number, y: number, lines: string[]): void {
  for (let i = 0; i < lines.length; i += 1) {
    write(x, y + i, "│", S.CYAN)
    write(x + 2, y + i, lines[i]!, S.ITALIC)
  }
}

function drawKbd(x: number, y: number, label: string, bgStyle: string = S.GRAY_BG): number {
  const w = Array.from(label).length + 2
  fillRect(x, y, w, 1, bgStyle)
  write(x, y, ` ${label} `, mix(bgStyle, S.BOLD))
  return x + w
}

function drawFgSwatch(x: number, y: number, w: number, color: string, label: string): void {
  write(x, y, center("████████", w), color)
  write(x, y + 1, center(label, w), color)
}

function drawBgSwatch(x: number, y: number, w: number, bgStyle: string, label: string): void {
  fillRect(x, y, w, 3, bgStyle)
  write(x, y + 1, center(label, w), mix(bgStyle, S.BOLD))
}

function drawBorderSampleBox(
  x: number,
  y: number,
  w: number,
  h: number,
  kind: BorderKind,
  label: string,
  sample: string,
): void {
  drawBox(x, y, w, h, kind, "")
  write(x + 1, y + 2, center(label, w - 2), S.BOLD)
  write(x + 1, y + 3, center(sample, w - 2), MUTED)
}

function renderLine(row: Cell[]): string {
  let out = ""
  let current = ""

  for (const cell of row) {
    if (cell.style !== current) {
      out += S.RESET
      if (cell.style) out += cell.style
      current = cell.style
    }
    out += cell.ch
  }

  if (current) out += S.RESET
  return out
}

/* -------------------------------------------------------------------------- */
/*  Section 1: PROGRESS & STATUS                                              */
/* -------------------------------------------------------------------------- */

const p1 = drawPanel(
  0,
  25,
  "PROGRESS & STATUS",
  "Feedback components with breathing room, clear progress, and quiet status signals.",
)

write(p1.innerX, 5, "Pipeline overview", S.BOLD)

drawProgressBar(p1.innerX, 7, "Build", 100, S.GREEN, [
  [padRight("100%", 6), S.BOLD_GREEN],
  ["✓", S.GREEN],
  [" ready", MUTED],
])

drawProgressBar(p1.innerX, 9, "Tests", 73, S.CYAN, [
  [padRight("73%", 6), S.BOLD_CYAN],
  ["438 / 600", MUTED],
])

drawProgressBar(p1.innerX, 11, "Deploy", 35, S.BLUE, [
  [padRight("35%", 6), S.BLUE],
  ["canary", MUTED],
])

drawIndeterminateBar(p1.innerX, 13, "Install", 17, [
  [padRight("···", 6), S.CYAN],
  ["working…", MUTED],
])

write(p1.innerX, 16, "Activity indicators", S.BOLD)
writeSegments(p1.innerX, 18, [
  ["◐", S.CYAN],
  ["  Resolving packages", ""],
  ["                         ", ""],
  ["⠋", S.MAGENTA],
  ["  Streaming logs", ""],
  ["                    ", ""],
  ["⋯", S.BLUE],
  ["  Waiting for agent", ""],
])

write(p1.innerX, 20, "Status badges", S.BOLD)
writeSegments(p1.innerX, 22, [
  ["● Active", S.GREEN],
  ["   ", ""],
  ["○ Inactive", MUTED],
  ["   ", ""],
  ["✓ Passed", S.GREEN],
  ["   ", ""],
  ["✗ Failed", S.RED],
  ["   ", ""],
  ["⚠ Warning", S.YELLOW],
])

/* -------------------------------------------------------------------------- */
/*  Section 2: TEXT INPUT                                                     */
/* -------------------------------------------------------------------------- */

const p2 = drawPanel(
  26,
  29,
  "TEXT INPUT",
  "Focused and unfocused fields reveal the difference a deliberate focus ring makes.",
)

write(p2.innerX, 31, "Single-line inputs", S.BOLD)

drawInput(8, 34, 38, {
  label: "Focused",
  value: "flutter widgets",
  focused: true,
})

drawInput(54, 34, 36, {
  label: "Default",
  value: "component gallery",
})

drawInput(8, 40, 38, {
  label: "Placeholder",
  placeholder: "Type to search...",
})

drawInput(54, 40, 36, {
  label: "Disabled",
  value: "read-only branch",
  disabled: true,
  showCursor: false,
})

drawTextArea(8, 46, 82, 7, "TextArea", [
  "## Terminal notes",
  "- Keep focus visible",
  "- Use whitespace for hierarchy",
  "`bun add silvery` starts fast",
])

/* -------------------------------------------------------------------------- */
/*  Section 3: SELECTION & TOGGLE                                             */
/* -------------------------------------------------------------------------- */

const p3 = drawPanel(
  56,
  29,
  "SELECTION & TOGGLE",
  "Selection controls should guide the eye without crowding the layout.",
)

write(p3.innerX, 61, "Lists", S.BOLD)

drawSelectList(8, 64, 34, 10, "SelectList / focused", ["React", "Vue", "Svelte", "Angular", "Solid"], 0, true)

drawRadioList(52, 64, 38, 8, "Radio variant", [
  { label: "Staging" },
  { label: "Production", selected: true },
  { label: "Preview" },
  { label: "Legacy cluster", disabled: true },
])

write(p3.innerX, 75, "Toggles", S.BOLD)

let tx = p3.innerX + 2
tx = writeSegments(tx, 76, [
  ["[", ""],
  ["x", S.GREEN],
  ["] ", ""],
  ["Dark mode", ""],
])
tx = write(tx + 4, 76, "", "")
tx = writeSegments(tx + 4, 76, [
  ["[", SUBTLE],
  [" ", SUBTLE],
  ["] ", SUBTLE],
  ["Notifications", ""],
])
writeSegments(tx + 7, 76, [
  ["[", ""],
  ["x", S.GREEN],
  ["] ", ""],
  ["Auto-save", ""],
])

write(p3.innerX, 79, "Buttons", S.BOLD)
drawButton(8, 80, 16, "Deploy", "primary", true)
drawButton(28, 80, 16, "Cancel", "secondary")
drawButton(48, 80, 14, "Reset", "disabled")

/* -------------------------------------------------------------------------- */
/*  Section 4: TYPOGRAPHY & TEXT                                              */
/* -------------------------------------------------------------------------- */

const p4 = drawPanel(
  86,
  49,
  "TYPOGRAPHY & TEXT",
  "A type scale for terminals: hierarchy, rhythm, and emphasis without noise.",
)

write(p4.innerX, 91, "Getting Started with Silvery", S.BOLD_CYAN)
write(p4.innerX, 92, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━", mix(S.CYAN, S.DIM))

write(p4.innerX, 95, "Installation", S.BOLD)
write(p4.innerX, 98, "Quick Start", S.CYAN)

write(p4.innerX, 101, "Great terminal interfaces do not imitate the web; they borrow its clarity.")
write(p4.innerX, 102, "Spacing, focus, and motion matter even more when every pixel is a character.")
write(p4.innerX, 103, "Silvery helps you compose views that feel calm under pressure, whether you are")
write(p4.innerX, 104, "shipping a deploy dashboard, a setup wizard, or a tiny tool inside git hooks.")

write(p4.innerX, 107, "Muted text sits behind the main narrative and keeps dense screens breathable.", MUTED)

write(p4.innerX, 108, "Small text carries timestamps, hints, and other low-priority context.", S.DARK_GRAY)

writeSegments(p4.innerX, 110, [
  ["Strong", S.BOLD],
  [" carries hierarchy, ", ""],
  ["Emphasis", S.ITALIC],
  [" shifts tone, and ", ""],
  ["Underline", S.UNDERLINE],
  [" marks an affordance.", ""],
])

let cx = write(p4.innerX, 112, "Install with ")
cx = drawInlineCode(cx, 112, "`bun add silvery`")
write(cx, 112, " and start composing screens in minutes.")

write(8, 114, "Code block", S.BOLD)
write(58, 114, "Blockquote", S.BOLD)

drawCodeBlock(8, 115, 46, 7)
drawBlockquote(58, 116, [
  "The best color code is no color code...",
  "Use it only when state or meaning",
  "needs a stronger signal.",
])

write(p4.innerX, 123, "Read the docs →", mix(S.CYAN, S.UNDERLINE))

write(8, 126, "• Compose views from small, testable pieces")
write(8, 127, "• Keep focus visible in every state")
write(8, 128, "• Use color as feedback, not decoration")

write(52, 126, "1. Install the package")
write(52, 127, "2. Define components and routes")
write(52, 128, "3. Wire keys, effects, and layout")

let kx = 8
kx = drawKbd(kx, 131, "Ctrl+S")
kx = write(kx + 2, 131, " ", "")
kx = drawKbd(kx + 1, 131, "⌘K")
kx = write(kx + 2, 131, " ", "")
kx = drawKbd(kx + 1, 131, "Esc")
write(kx + 3, 131, "  Save, jump, or dismiss without hunting through menus.", MUTED)

/* -------------------------------------------------------------------------- */
/*  Section 5: BORDERS & TOKENS                                               */
/* -------------------------------------------------------------------------- */

const p5 = drawPanel(
  136,
  29,
  "BORDERS & TOKENS",
  "Box primitives and design tokens that make composition feel consistent.",
)

write(p5.innerX, 141, "Border styles", S.BOLD)

drawBorderSampleBox(6, 143, 14, 6, "round", "round", "╭╮  ╰╯")
drawBorderSampleBox(24, 143, 14, 6, "single", "single", "┌┐  └┘")
drawBorderSampleBox(42, 143, 14, 6, "bold", "bold", "┏┓  ┗┛")
drawBorderSampleBox(60, 143, 14, 6, "double", "double", "╔╗  ╚╝")
drawBorderSampleBox(78, 143, 14, 6, "classic", "classic", "+-  +-")

write(p5.innerX, 151, "Color tokens", S.BOLD)
drawFgSwatch(6, 153, 13, S.CYAN, "$primary")
drawFgSwatch(20, 153, 13, S.GREEN, "$success")
drawFgSwatch(34, 153, 13, S.YELLOW, "$warning")
drawFgSwatch(48, 153, 13, S.RED, "$error")
drawFgSwatch(62, 153, 13, S.BLUE, "$info")
drawFgSwatch(76, 153, 13, S.DARK_GRAY, "$muted")

write(p5.innerX, 156, "Background tokens", S.BOLD)
drawBgSwatch(6, 158, 13, S.PRIMARY, "$primary")
drawBgSwatch(20, 158, 13, S.BG_GREEN, "$success")
drawBgSwatch(34, 158, 13, S.BG_YELLOW, "$warning")
drawBgSwatch(48, 158, 13, S.BG_RED, "$error")
drawBgSwatch(62, 158, 13, S.BG_BLUE, "$info")
drawBgSwatch(76, 158, 13, S.BG_MUTED, "$muted")

write(6, 162, "Divider", MUTED)
hLine(16, 162, 72, "─", SUBTLE)

write(6, 163, "Separator", MUTED)
write(18, 163, "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄", SUBTLE)

/* -------------------------------------------------------------------------- */
/*  Section 6: DIALOG & MODAL                                                 */
/* -------------------------------------------------------------------------- */

const p6 = drawPanel(166, 34, "DIALOG & MODAL", "Modal surfaces, overlays, notifications, and persistent key guidance.")

fillRect(4, 171, 92, 18, S.DARK_BG)
write(8, 172, "release 2.5.0         queue depth 14         region iad-1", onDark(S.DARK_GRAY))
write(8, 187, "smoke tests passed    logs streaming         observers attached", onDark(S.DARK_GRAY))

fillRect(25, 173, 50, 15, S.GRAY_BG)
drawBox(24, 172, 52, 17, "round", S.BOLD_CYAN)
write(27, 172, " Deploy to Production ", S.BOLD_CYAN)

write(27, 173, "Target environment: production", onGray(S.DARK_GRAY))
write(60, 173, "Esc to close", onGray(S.DARK_GRAY))

write(27, 174, "Review the branch and readiness checks before", onGray())
write(27, 175, "shifting live traffic to the new release.", onGray())

drawInput(28, 177, 44, {
  label: "Branch",
  value: "main",
  focused: true,
  showCursor: false,
  fillStyle: S.DARK_BG,
  labelStyle: onGray(S.DARK_GRAY),
})

hLine(27, 180, 46, "─", onGray(S.DARK_GRAY))

writeSegments(28, 181, [
  ["✓", onGray(S.GREEN)],
  ["  Assets uploaded", onGray()],
  ["      ", onGray()],
  ["✓", onGray(S.GREEN)],
  ["  Migrations ready", onGray()],
])

writeSegments(28, 182, [
  ["⚠", onGray(S.YELLOW)],
  ["  Cache warmup may add ~2m before the region is fully hot.", onGray()],
])

writeSegments(28, 183, [
  ["ℹ", onGray(S.BLUE)],
  ["  Traffic shifts gradually; metrics keep streaming during rollout.", onGray()],
])

hLine(27, 184, 46, "─", onGray(S.DARK_GRAY))

drawButton(34, 185, 14, "Deploy", "primary", true)
drawButton(51, 185, 14, "Cancel", "secondary")

write(10, 189, "Toast notification", S.BOLD)
drawBox(10, 190, 80, 3, "round", S.BOLD_GREEN)
fillRect(11, 191, 78, 1, S.DARK_BG)
writeSegments(13, 191, [
  ["✓", onDark(S.BOLD_GREEN)],
  ["  Release queued — observers will update as deployment progresses.", onDark()],
])

write(10, 193, "Key hints", S.BOLD)
drawBox(10, 194, 80, 3, "single", PANEL)
fillRect(11, 195, 78, 1, S.GRAY_BG)

let hx = 13
hx = drawKbd(hx, 195, "F1", S.DARK_BG)
hx = write(hx, 195, " Help   ", onGray())
hx = drawKbd(hx, 195, "F2", S.DARK_BG)
hx = write(hx, 195, " Setup   ", onGray())
hx = drawKbd(hx, 195, "↑↓", S.DARK_BG)
hx = write(hx, 195, " Navigate   ", onGray())
hx = drawKbd(hx, 195, "Enter", S.DARK_BG)
hx = write(hx, 195, " Select   ", onGray())
hx = drawKbd(hx, 195, "q", S.DARK_BG)
write(hx, 195, " Quit", onGray())

/* -------------------------------------------------------------------------- */
/*  Render                                                                    */
/* -------------------------------------------------------------------------- */

for (const row of cells) {
  console.log(renderLine(row))
}
