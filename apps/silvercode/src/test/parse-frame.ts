/**
 * parseFrame — semantic parser for silvercode terminal frames.
 *
 * Absolute (col, row) coordinates break under any layout shift — a padding
 * tweak on one component moves every assertion. Instead, `parseFrame()`
 * extracts named regions (card stream, side panel, mode row, input box,
 * welcome panel) so tests can say "the mode row has icon X and label Y"
 * without hardcoding row numbers.
 *
 * This parser is pragmatic, not rigorous: it uses text markers and column
 * heuristics (side panel at cols [leftWidth, cols)) to find regions. When
 * a component changes text it uses to self-identify, update the marker
 * constants here — one place, not scattered.
 *
 * Falsifiability is enforced by `tests/visual/mutations.test.ts` which
 * applies known regressions (typo the mode glyph, remove paddingX) and
 * asserts parseFrame + invariants fail as expected.
 */

import type { RenderedScenario } from "./render-harness.tsx"
import { leftWidthFor } from "./render-harness.tsx"

// Known marker strings used to locate regions. Keep in sync with the
// actual components (`Welcome.tsx`, `SidePanel.tsx`, `AssistantBlock.tsx`,
// `UserMessageBlock.tsx`, `ActivityIndicator.tsx`, `ToolCallBlock.tsx`,
// `CommandBox.tsx`).

/**
 * Message-stream leading glyphs. Two families:
 *
 * - `FLUSH`: glyphs rendered at the card-stream's leading column (the
 *   paddingX={1} inset) — these MUST all align. UserMessageBlock,
 *   AssistantBlock, ActivityIndicator.
 *
 * - `INSET`: glyphs rendered with their own block frame (left-border
 *   stripe + internal paddingX). Tool calls sit one column right of the
 *   flush family because ToolCallBlock has `borderStyle="single"
 *   borderRight={false} borderTop={false} borderBottom={false}` —
 *   leaves a left stripe.
 *
 * Alignment invariant applies to FLUSH only.
 */
export const STREAM_GLYPHS = {
  assistant: "●",
  user: ">",
  activity: "◈",
  tool: "⚙",
} as const

/** Glyphs whose columns MUST align. Tool call is excluded by design. */
export const FLUSH_STREAM_GLYPHS = ["●", ">", "◈"] as const
/** Glyphs in the tool-block visual family — separate alignment. */
export const INSET_STREAM_GLYPHS = ["⚙"] as const

/** Mode glyph per mode, per SidePanel.MODE_ICONS. */
export const MODE_ICONS_EXPECTED: Record<string, string> = {
  plan: "·",
  "accept-edits": "»",
  auto: "»",
  bypass: "!",
  // `ask` was added recently — if absent from SidePanel, mutation test
  // flags the drift.
  ask: "·",
}

/** Mode label per mode, per SidePanel.MODE_LABELS. */
export const MODE_LABELS_EXPECTED: Record<string, string> = {
  plan: "plan mode on",
  "accept-edits": "accept edits on",
  auto: "auto mode on",
  bypass: "bypass mode on",
  ask: "ask mode on",
}

// ----------------------------------------------------------------------------
// Region types
// ----------------------------------------------------------------------------

export type MessageBlock = {
  /** The leading glyph found on this block (●, >, ◈, ⚙). */
  readonly glyph: string
  /** The glyph's column position within the left region. Used for icon-family alignment. */
  readonly glyphCol: number
  /** The row index in the frame where this glyph sits. */
  readonly row: number
  /** The text content following the glyph (trimmed). First wrap-line only — this is a cheap heuristic. */
  readonly firstLineText: string
}

export type SidePanelRegion = {
  /** Raw side-panel lines, cropped to columns [leftWidth, cols). */
  readonly lines: readonly string[]
  /** The offset column where the side-panel region starts (i.e. leftWidth). */
  readonly startCol: number
  /** The mode row, if present: icon + label + row index. null when not found. */
  readonly modeRow: { readonly icon: string; readonly label: string; readonly row: number } | null
  /** Whether the Silver Code version row is present. */
  readonly hasSilverCodeRow: boolean
  /** Whether the Claude Code version row is present. */
  readonly hasClaudeCodeRow: boolean
  /** The "Sessions" heading row index, or -1 if missing. */
  readonly sessionsHeadingRow: number
}

export type InputBoxRegion = {
  /** Row index containing the leading `>` prompt glyph. -1 if not found. */
  readonly promptRow: number
  /** Column of the leading `>` prompt glyph. -1 if not found. */
  readonly promptCol: number
  /** Whether the prompt glyph renders. */
  readonly present: boolean
}

export type WelcomeRegion = {
  /** Whether the Welcome panel is visible (heuristic: contains "Silver Code for Claude Code"). */
  readonly visible: boolean
  /** All rows belonging to the welcome panel (heuristic: lines from intro heading down to Keybindings end). */
  readonly rows: readonly string[]
}

export type ParsedFrame = {
  readonly cols: number
  readonly rows: number
  readonly leftWidth: number
  /** Every message-stream glyph detected in the left region, in reading order. */
  readonly cardStream: readonly MessageBlock[]
  /** The side-panel region (right columns), or null if the side panel isn't visible. */
  readonly sidePanel: SidePanelRegion | null
  /** The command-input region (bottom of left column). */
  readonly inputBox: InputBoxRegion
  /** The Welcome panel (empty state), if shown. */
  readonly welcome: WelcomeRegion
}

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------

export function parseFrame(s: RenderedScenario, opts: { leftWidth?: number } = {}): ParsedFrame {
  const leftWidth = opts.leftWidth ?? leftWidthFor(s.cols)
  // Pad each line to full `cols` width — silvery's TextFrame.lines trims
  // trailing spaces, which breaks positional slicing at `leftWidth` when
  // the left region underruns.
  const padded = s.lines.map((l) => l.padEnd(s.cols, " "))
  const inputBox = parseInputBox(padded, leftWidth)
  // Card stream excludes the input-box row — the command prompt `>` has
  // its own paddingX and isn't a message-stream glyph.
  const inputBoxRowsToSkip = inputBox.present ? new Set([inputBox.promptRow]) : new Set<number>()
  return {
    cols: s.cols,
    rows: s.rows,
    leftWidth,
    cardStream: parseCardStream(padded, leftWidth, inputBoxRowsToSkip),
    sidePanel: parseSidePanel(padded, leftWidth),
    inputBox,
    welcome: parseWelcome(padded),
  }
}

// ----------------------------------------------------------------------------
// Region parsers
// ----------------------------------------------------------------------------

function parseCardStream(
  lines: readonly string[],
  leftWidth: number,
  skipRows: ReadonlySet<number> = new Set(),
): MessageBlock[] {
  const out: MessageBlock[] = []
  const glyphs = [STREAM_GLYPHS.assistant, STREAM_GLYPHS.activity, STREAM_GLYPHS.tool, STREAM_GLYPHS.user]

  for (let row = 0; row < lines.length; row++) {
    if (skipRows.has(row)) continue
    const line = lines[row]!.slice(0, leftWidth)
    for (const glyph of glyphs) {
      let idx = line.indexOf(glyph)
      while (idx !== -1) {
        // Disambiguate `>`: only count leading-glyph shape (space / start
        // before, space after). That filters out prose `>` (in
        // blockquotes or arithmetic) AND side-panel chevrons like `▸`.
        if (glyph === ">") {
          const before = line[idx - 1] ?? ""
          const after = line[idx + 1] ?? ""
          const looksLeading = (before === " " || before === "") && after === " "
          if (!looksLeading) {
            idx = line.indexOf(glyph, idx + 1)
            continue
          }
        }
        // Extract text after glyph (skip one space, then to end of region).
        const after = line.slice(idx + glyph.length).trimStart()
        out.push({ glyph, glyphCol: idx, row, firstLineText: after.trimEnd() })
        idx = line.indexOf(glyph, idx + glyph.length)
      }
    }
  }
  // Sort by row, then by glyph column — reading order.
  out.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.glyphCol - b.glyphCol))
  return out
}

function parseSidePanel(lines: readonly string[], leftWidth: number): SidePanelRegion | null {
  // Crop each line to [leftWidth, end).
  const panelLines = lines.map((l) => (l.length > leftWidth ? l.slice(leftWidth) : ""))
  const joined = panelLines.join("\n")
  // Minimal heuristic: the side panel has "Sessions" as the first heading.
  if (!joined.includes("Sessions")) return null

  const sessionsHeadingRow = panelLines.findIndex((l) => l.trim().startsWith("Sessions"))
  const hasSilverCodeRow = joined.includes("Silver Code") || joined.includes("Silver")
  const hasClaudeCodeRow = joined.includes("Claude Code") || joined.includes("Claude")

  // Mode row: find a line that contains a known mode-label suffix. The
  // component renders `<icon><space><label>` — we pull the first
  // non-space run after stripping leading whitespace as the icon.
  let modeRow: SidePanelRegion["modeRow"] = null
  for (const [label] of Object.entries(MODE_LABELS_EXPECTED).sort((a, b) => b[1].length - a[1].length)) {
    const expectedLabel = MODE_LABELS_EXPECTED[label]!
    const row = panelLines.findIndex((l) => l.includes(expectedLabel))
    if (row !== -1) {
      const line = panelLines[row]!
      // Icon is the first non-space grapheme-ish cluster in the row, BEFORE
      // the label. We find the label's index and walk backward.
      const labelIdx = line.indexOf(expectedLabel)
      const prefix = line.slice(0, labelIdx).trim()
      // The prefix should be a single-cell glyph (after trimming spaces).
      // We take the last non-space cluster as the icon — typically 1 char
      // but could be a single emoji grapheme.
      const icon = prefix.split(/\s+/).filter(Boolean).pop() ?? ""
      modeRow = { icon, label: expectedLabel, row }
      break
    }
  }

  return {
    lines: panelLines,
    startCol: leftWidth,
    modeRow,
    hasSilverCodeRow,
    hasClaudeCodeRow,
    sessionsHeadingRow,
  }
}

function parseInputBox(lines: readonly string[], leftWidth: number): InputBoxRegion {
  // Walk from the bottom up to find the first `>` leading-glyph row in
  // the left region. That's the command input prompt.
  for (let row = lines.length - 1; row >= 0; row--) {
    const line = lines[row]!.slice(0, leftWidth)
    // Prompt shape: optional leading space, then `>`, then space or end.
    const m = /^(\s*)>\s?/.exec(line)
    if (m) {
      return { promptRow: row, promptCol: m[1]!.length, present: true }
    }
  }
  return { promptRow: -1, promptCol: -1, present: false }
}

function parseWelcome(lines: readonly string[]): WelcomeRegion {
  const startRow = lines.findIndex((l) => l.includes("Silver Code for Claude Code"))
  if (startRow === -1) return { visible: false, rows: [] }
  // Welcome ends when we hit a blank row AFTER we've seen the Keybindings
  // heading, OR at end of frame.
  let endRow = lines.length
  let sawKeybindings = false
  for (let row = startRow; row < lines.length; row++) {
    if (lines[row]!.trim() === "Keybindings") sawKeybindings = true
    else if (sawKeybindings && lines[row]!.trim() === "") {
      endRow = row
      break
    }
  }
  return { visible: true, rows: lines.slice(startRow, endRow) }
}

// ----------------------------------------------------------------------------
// Convenience helpers
// ----------------------------------------------------------------------------

/**
 * Are all message-stream glyphs in the same column? Returns true if yes
 * OR if fewer than 2 glyphs are present (nothing to compare).
 */
export function isIconFamilyAligned(p: ParsedFrame): boolean {
  if (p.cardStream.length < 2) return true
  const col = p.cardStream[0]!.glyphCol
  return p.cardStream.every((b) => b.glyphCol === col)
}

/**
 * Convert a ParsedFrame to a small, reviewable summary string — useful
 * for diagnostic output when an assertion fails.
 */
export function summarize(p: ParsedFrame): string {
  const lines: string[] = []
  lines.push(`Frame ${p.cols}×${p.rows}, leftWidth=${p.leftWidth}`)
  lines.push(`Card stream (${p.cardStream.length} blocks):`)
  for (const b of p.cardStream) {
    lines.push(`  row ${b.row} col ${b.glyphCol}: ${b.glyph} ${b.firstLineText}`)
  }
  if (p.sidePanel) {
    lines.push(`Side panel at col ${p.sidePanel.startCol}:`)
    lines.push(`  sessions heading row: ${p.sidePanel.sessionsHeadingRow}`)
    lines.push(`  silverCode row: ${p.sidePanel.hasSilverCodeRow}`)
    lines.push(`  claudeCode row: ${p.sidePanel.hasClaudeCodeRow}`)
    lines.push(
      `  mode row: ${
        p.sidePanel.modeRow
          ? `${p.sidePanel.modeRow.icon} ${p.sidePanel.modeRow.label} @row ${p.sidePanel.modeRow.row}`
          : "<absent>"
      }`,
    )
  } else {
    lines.push(`Side panel: <absent>`)
  }
  lines.push(
    `Input box: ${p.inputBox.present ? `> @row ${p.inputBox.promptRow} col ${p.inputBox.promptCol}` : "<absent>"}`,
  )
  lines.push(`Welcome: ${p.welcome.visible ? `visible (${p.welcome.rows.length} rows)` : "absent"}`)
  return lines.join("\n")
}
