/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI, auto-generated from the
 * keybinding registry and command definitions.
 *
 * Multi-column layout with verb × location grid. Scrollable with j/k.
 */
import React, { useMemo } from "react"
import { Box, Text } from "inkx"
import { ModalDialog } from "./shared-components.tsx"
import { getHelpScreenData, VERB_GRID, type HelpSection } from "@km/commands"

interface HelpOverlayProps {
  width: number
  height: number
  scrollOffset?: number
}

// ── Layout configuration ────────────────────────────────────────────

/** Alignment column for dot leaders */
const DOT_STOP = 12

/**
 * Sections arranged in rows. Each row is rendered side-by-side.
 * null = verb grid (special rendering). Sections not in any row
 * are appended at the end.
 */
const SECTION_ROWS: Array<string[] | null> = [
  ["Navigation", "Editing"],
  ["Selection", "Task"],
  ["Fold", "View"],
  ["Panes", "System"],
  null, // verb × location grid
]

// ── Key display formatting ──────────────────────────────────────────

/**
 * Render key string with dim ` / ` separators for alternatives.
 * Keys are yellow, ` / ` separators are dim grey.
 */
function renderKeyColored(keyStr: string, keyPrefix: string): React.ReactNode[] {
  if (!keyStr.includes(" / ")) {
    return [
      <Text key={`${keyPrefix}-k0`} color="yellow">
        {keyStr}
      </Text>,
    ]
  }
  const parts: React.ReactNode[] = []
  const segments = keyStr.split(" / ")
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      parts.push(
        <Text key={`${keyPrefix}-s${i}`} dimColor>
          {" / "}
        </Text>,
      )
    }
    parts.push(
      <Text key={`${keyPrefix}-k${i}`} color="yellow">
        {segments[i]}
      </Text>,
    )
  }
  return parts
}

// ── Dot-leader entry rendering ──────────────────────────────────────

/** Render a single key..description entry with dot leaders */
function renderEntryStr(keys: string[], desc: string, colWidth: number): string {
  const keyStr = keys.join(" ")
  const dots = Math.max(1, DOT_STOP - keyStr.length - 2)
  const descMax = colWidth - DOT_STOP
  return keyStr + " " + ".".repeat(dots) + " " + desc.slice(0, descMax)
}

// ── Section building ────────────────────────────────────────────────

function sectionHeaderStr(category: string, colWidth: number): string {
  const title = category.toUpperCase()
  const lineLen = Math.max(0, colWidth - title.length - 5)
  return "── " + title + " " + "─".repeat(lineLen)
}

/** Build lines for a single section (returns plain strings for column merging) */
function buildSectionStrings(section: HelpSection, colWidth: number): string[] {
  const lines: string[] = [sectionHeaderStr(section.category, colWidth)]
  for (const item of section.items) {
    lines.push("  " + renderEntryStr(item.keys, item.description, colWidth - 2))
  }
  return lines
}

// ── Main content building ───────────────────────────────────────────

function buildContentLines(sections: HelpSection[], contentWidth: number): React.ReactElement[] {
  const lines: React.ReactElement[] = []
  const sectionMap = new Map<string, HelpSection>()
  for (const s of sections) sectionMap.set(s.category, s)

  const rendered = new Set<string>()
  let lineIdx = 0

  function addLine(el: React.ReactElement) {
    lines.push(el)
    lineIdx++
  }

  function renderColoredLine(raw: string, key: string): React.ReactElement {
    // Parse "── TITLE ───" headers
    const headerMatch = raw.match(/^(── )(.+?)( ─+)$/)
    if (headerMatch) {
      return (
        <Text key={key}>
          <Text dimColor>{headerMatch[1]}</Text>
          <Text bold color="cyan">
            {headerMatch[2]}
          </Text>
          <Text dimColor>{headerMatch[3]}</Text>
        </Text>
      )
    }
    // Parse "  key .. desc" entries
    const entryMatch = raw.match(/^( +)(.+?)( \.+ )(.*)$/)
    if (entryMatch) {
      return (
        <Text key={key}>
          {entryMatch[1]}
          {renderKeyColored(entryMatch[2], key)}
          <Text dimColor>{entryMatch[3]}</Text>
          <Text>{entryMatch[4]}</Text>
        </Text>
      )
    }
    return (
      <Text key={key} dimColor>
        {raw}
      </Text>
    )
  }

  // Render section rows (multi-column)
  for (const row of SECTION_ROWS) {
    if (row === null) {
      // Verb × location grid
      renderVerbGrid(contentWidth, addLine)
      continue
    }

    const cols: string[][] = []
    const sectionNames: string[] = []
    for (const name of row) {
      const section = sectionMap.get(name)
      if (section) {
        const colWidth = Math.floor(contentWidth / row.length)
        cols.push(buildSectionStrings(section, colWidth))
        sectionNames.push(name)
        rendered.add(name)
      }
    }

    if (cols.length === 0) continue

    // Merge columns side by side
    const colWidth = Math.floor(contentWidth / cols.length)
    const maxLines = Math.max(...cols.map((c) => c.length))

    for (let i = 0; i < maxLines; i++) {
      const parts: React.ReactNode[] = []
      for (let c = 0; c < cols.length; c++) {
        const raw = (cols[c][i] ?? "").padEnd(colWidth)
        const colKey = `r${lineIdx}-c${c}`

        // Parse and colorize inline
        const headerMatch = raw.match(/^(── )(.+?)( ─+)(.*)$/)
        if (headerMatch) {
          parts.push(
            <React.Fragment key={colKey}>
              <Text dimColor>{headerMatch[1]}</Text>
              <Text bold color="cyan">
                {headerMatch[2]}
              </Text>
              <Text dimColor>{headerMatch[3] + headerMatch[4]}</Text>
            </React.Fragment>,
          )
          continue
        }
        const entryMatch = raw.match(/^( +)(.+?)( \.+ )(.*)$/)
        if (entryMatch) {
          // Pad the description to fill column
          const usedLen = entryMatch[1].length + entryMatch[2].length + entryMatch[3].length + entryMatch[4].length
          const pad = Math.max(0, colWidth - usedLen)
          parts.push(
            <React.Fragment key={colKey}>
              {entryMatch[1]}
              {renderKeyColored(entryMatch[2], colKey)}
              <Text dimColor>{entryMatch[3]}</Text>
              <Text>{entryMatch[4]}</Text>
              {pad > 0 ? " ".repeat(pad) : null}
            </React.Fragment>,
          )
          continue
        }
        parts.push(
          <Text key={colKey} dimColor>
            {raw}
          </Text>,
        )
      }
      addLine(<Text key={`row-${lineIdx}`}>{parts}</Text>)
    }

    // Blank line between rows
    addLine(<Text key={`blank-${lineIdx}`}> </Text>)
  }

  // Render any sections not in the layout
  for (const section of sections) {
    if (rendered.has(section.category)) continue
    rendered.add(section.category)
    const strs = buildSectionStrings(section, contentWidth)
    for (const raw of strs) {
      addLine(renderColoredLine(raw, `extra-${lineIdx}`))
    }
    addLine(<Text key={`blank-${lineIdx}`}> </Text>)
  }

  // Quick access
  const qaWidth = contentWidth - 5
  addLine(renderColoredLine(sectionHeaderStr("Quick Access", contentWidth), `qa-hdr-${lineIdx}`))
  addLine(renderColoredLine("  " + renderEntryStr(["1-9"], "jump to favorite board", qaWidth), `qa-fav-${lineIdx}`))
  addLine(<Text key={`qa-blank-${lineIdx}`}> </Text>)

  return lines
}

// ── Verb × Location grid ────────────────────────────────────────────

function renderVerbGrid(contentWidth: number, addLine: (el: React.ReactElement) => void) {
  const headerWidth = contentWidth - 5
  const title = "VERBS × LOCATIONS"
  const lineLen = Math.max(0, headerWidth - title.length)

  addLine(
    <Text key="vg-hdr">
      <Text dimColor>{"── "}</Text>
      <Text bold color="cyan">
        {title}
      </Text>
      <Text dimColor>{" " + "─".repeat(lineLen)}</Text>
    </Text>,
  )

  // Column layout: location label + 3 verb columns with gutters
  const locW = 14
  const colW = 12

  // Column headers
  addLine(
    <Text key="vg-col-hdr">
      {"  "}
      <Text dimColor>{"".padEnd(locW)}</Text>
      <Text bold color="cyan">
        {"go (g)".padEnd(colW)}
      </Text>
      <Text bold color="cyan">
        {"move (m)".padEnd(colW)}
      </Text>
      <Text bold color="cyan">
        {"add (a)"}
      </Text>
    </Text>,
  )

  for (let i = 0; i < VERB_GRID.length; i++) {
    const row = VERB_GRID[i]
    const loc = (row.key + " " + row.location).padEnd(locW)
    const g = row.goto
    const m = row.move
    const a = row.add
    addLine(
      <Text key={`vg-${i}`}>
        {"  "}
        <Text color="yellow">{row.key}</Text>
        <Text>{" " + row.location.padEnd(locW - row.key.length - 1)}</Text>
        {g ? <Text color="yellow">{g.padEnd(colW)}</Text> : <Text dimColor>{"—".padEnd(colW)}</Text>}
        {m ? <Text color="yellow">{m.padEnd(colW)}</Text> : <Text dimColor>{"—".padEnd(colW)}</Text>}
        {a ? <Text color="yellow">{a}</Text> : <Text dimColor>{"—"}</Text>}
      </Text>,
    )
  }

  addLine(<Text key="vg-blank"> </Text>)
}

// ── Main component ──────────────────────────────────────────────────

const MIN_WIDTH = 30
const MIN_HEIGHT = 10

export function HelpOverlay({ width, height, scrollOffset = 0 }: HelpOverlayProps) {
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return (
      <Box
        position="absolute"
        marginLeft={Math.max(0, Math.floor((width - 20) / 2))}
        marginTop={Math.max(0, Math.floor((height - 3) / 2))}
        flexDirection="column"
        borderStyle="single"
        borderColor="white"
        data-dialog="help"
      >
        <Text color="white">Terminal too small</Text>
        <Text dimColor>Press ? or ⎋</Text>
      </Box>
    )
  }

  const boxWidth = Math.max(MIN_WIDTH, Math.min(100, width - 4))
  const contentWidth = boxWidth - 6

  const contentLines = useMemo(() => {
    const sections = getHelpScreenData()
    return buildContentLines(sections, contentWidth)
  }, [contentWidth])

  const totalLines = contentLines.length
  const chromeLines = 8
  const boxHeight = Math.max(MIN_HEIGHT, Math.min(totalLines + chromeLines, height - 2))
  const visibleLines = boxHeight - chromeLines

  const maxScroll = Math.max(0, totalLines - visibleLines)
  const clampedOffset = Math.min(scrollOffset, maxScroll)
  const visibleContent = contentLines.slice(clampedOffset, clampedOffset + visibleLines)

  const canScrollUp = clampedOffset > 0
  const canScrollDown = clampedOffset < maxScroll
  const scrollHint = canScrollUp || canScrollDown ? `${canScrollUp ? "↑" : " "}j/k${canScrollDown ? "↓" : " "}` : ""

  const marginLeft = Math.max(0, Math.floor((width - boxWidth) / 2))
  const marginTop = Math.max(0, Math.floor((height - boxHeight) / 2))

  const footer = (
    <Box>
      <Text dimColor>⎋ to close</Text>
      {scrollHint && (
        <>
          <Text dimColor>{"  "}</Text>
          <Text color="yellow">{scrollHint}</Text>
        </>
      )}
    </Box>
  )

  return (
    <Box position="absolute" marginLeft={marginLeft} marginTop={marginTop} data-dialog="help">
      <ModalDialog width={boxWidth} height={boxHeight} title="Keyboard Shortcuts" hotkey="?" footer={footer}>
        {visibleContent}
      </ModalDialog>
    </Box>
  )
}
