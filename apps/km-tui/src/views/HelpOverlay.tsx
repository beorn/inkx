/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI.
 * Multi-column layout with verb × location grid. Scrollable with j/k.
 * Fill component handles dot leaders and section header fills.
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

/**
 * Sections arranged in rows. Each row is rendered side-by-side.
 * null = verb grid (special rendering). Sections not in any row
 * are appended at the end.
 */
const SECTION_ROWS: Array<string[] | "verb-grid"> = [
  ["Navigation", "Editing"],
  ["Selection", "Task"],
  ["View", "Panes"],
  ["System", "verb-grid"],
]

// ── Key display formatting ──────────────────────────────────────────

/**
 * Render key string with dim ` / ` separators for alternatives.
 * Keys are yellow, ` / ` separators are dim grey.
 */
function KeyText({ keys, prefix }: { keys: string; prefix: string }): React.ReactElement {
  if (!keys.includes(" / ")) {
    return (
      <Text key={`${prefix}-k0`} color="yellow">
        {keys}
      </Text>
    )
  }
  const segments = keys.split(" / ")
  return (
    <>
      {segments.map((seg, i) => (
        <React.Fragment key={`${prefix}-k${i}`}>
          {i > 0 && <Text dimColor>{" / "}</Text>}
          <Text color="yellow">{seg}</Text>
        </React.Fragment>
      ))}
    </>
  )
}

// ── Section header ──────────────────────────────────────────────────

function SectionHeaderLine({ title, fillWidth }: { title: string; fillWidth: number }): React.ReactElement {
  // Pre-compute dashes to fill remaining space after title.
  // Avoids Fill component's useContentRect which causes a 3s layout cascade.
  const dashCount = Math.max(0, fillWidth - title.length - 4) // 2 indent + 1 space + ~1 padding
  return (
    <Box flexDirection="row">
      <Text>{"  "}</Text>
      <Text bold color="cyan">
        {title.toUpperCase()}
      </Text>
      <Text> </Text>
      <Text dimColor>{"─".repeat(dashCount)}</Text>
    </Box>
  )
}

// ── Entry line (key...description with dot leaders) ─────────────────

function EntryLine({
  keys,
  desc,
  prefix,
  fillWidth,
}: { keys: string; desc: string; prefix: string; fillWidth: number }): React.ReactElement {
  // Pre-compute dots to fill space between key and description.
  const keyLen = keys.replace(/ \/ /g, " / ").length
  const dotCount = Math.max(1, fillWidth - keyLen - desc.length - 5) // 2 indent + 2 spaces + ~1 padding
  return (
    <Box flexDirection="row">
      <Text>{"  "}</Text>
      <KeyText keys={keys} prefix={prefix} />
      <Text> </Text>
      <Text dimColor>{".".repeat(dotCount)}</Text>
      <Text> </Text>
      <Text>{desc}</Text>
    </Box>
  )
}

// ── Section building ────────────────────────────────────────────────

function buildSectionLines(section: HelpSection, keyPrefix: string, fillWidth: number): React.ReactElement[] {
  const lines: React.ReactElement[] = []
  lines.push(<SectionHeaderLine key={`${keyPrefix}-hdr`} title={section.category} fillWidth={fillWidth} />)
  for (let i = 0; i < section.items.length; i++) {
    const item = section.items[i]
    const keyStr = item.keys.join(" ")
    lines.push(
      <EntryLine
        key={`${keyPrefix}-e${i}`}
        keys={keyStr}
        desc={item.description}
        prefix={`${keyPrefix}-e${i}`}
        fillWidth={fillWidth}
      />,
    )
  }
  return lines
}

// ── Main content building ───────────────────────────────────────────

function buildContentLines(sections: HelpSection[], contentWidth: number): React.ReactElement[] {
  const lines: React.ReactElement[] = []
  const sectionMap = new Map<string, HelpSection>()
  for (const s of sections) sectionMap.set(s.category, s)

  const rendered = new Set<string>()

  // Render section rows (multi-column)
  for (const row of SECTION_ROWS) {
    const colFillWidth = Math.floor(contentWidth / row.length)
    // Collect columns for this row — sections or verb-grid
    const cols: React.ReactElement[][] = []
    for (const name of row) {
      if (name === "verb-grid") {
        cols.push(buildVerbGridLines(colFillWidth))
      } else {
        const section = sectionMap.get(name)
        if (section) {
          cols.push(buildSectionLines(section, `s${cols.length}-${section.category}`, colFillWidth))
          rendered.add(name)
        }
      }
    }

    if (cols.length === 0) continue

    if (cols.length === 1) {
      // Single column — full width
      lines.push(...cols[0])
    } else {
      // Multi-column: merge lines side by side using fixed-width Boxes
      const colWidth = Math.floor(contentWidth / cols.length)
      const maxLines = Math.max(...cols.map((c) => c.length))

      for (let i = 0; i < maxLines; i++) {
        lines.push(
          <Box key={`row-${lines.length}`} flexDirection="row">
            {cols.map((col, ci) => (
              <Box key={ci} width={colWidth}>
                {col[i] ?? null}
              </Box>
            ))}
          </Box>,
        )
      }
    }

    // Blank line between rows
    lines.push(<Text key={`blank-${lines.length}`}> </Text>)
  }

  // Render any sections not in the layout
  for (const section of sections) {
    if (rendered.has(section.category)) continue
    rendered.add(section.category)
    lines.push(...buildSectionLines(section, `extra-${section.category}`, contentWidth))
    lines.push(<Text key={`blank-${lines.length}`}> </Text>)
  }

  return lines
}

// ── Verb × Location grid ────────────────────────────────────────────

/** Column widths for the verb grid */
const VG_LOC_W = 16
const VG_COL_W = 10

function GridCell({ value }: { value?: string }): React.ReactElement {
  if (!value) return <Text dimColor>{"·"}</Text>
  return <Text color="yellow">{value}</Text>
}

function buildVerbGridLines(fillWidth: number): React.ReactElement[] {
  const lines: React.ReactElement[] = []

  // Section header
  const dashCount = Math.max(0, fillWidth - "CHORDS".length - 4)
  lines.push(
    <Box key="vg-hdr" flexDirection="row">
      <Text>{"  "}</Text>
      <Text bold color="cyan">
        {"CHORDS"}
      </Text>
      <Text> </Text>
      <Text dimColor>{"─".repeat(dashCount)}</Text>
    </Box>,
  )

  // Column headers (verb names)
  lines.push(
    <Box key="vg-col-hdr" flexDirection="row">
      <Text>{"  "}</Text>
      <Box width={VG_LOC_W} />
      <Box width={VG_COL_W}>
        <Text bold color="cyan">
          {"go"}
        </Text>
      </Box>
      <Box width={VG_COL_W}>
        <Text bold color="cyan">
          {"move"}
        </Text>
      </Box>
      <Box width={VG_COL_W}>
        <Text bold color="cyan">
          {"add"}
        </Text>
      </Box>
      <Text bold color="cyan">
        {"create"}
      </Text>
    </Box>,
  )

  // Prefix key row (chord prefix + ctrl alternatives)
  lines.push(
    <Box key="vg-prefix" flexDirection="row">
      <Text>{"  "}</Text>
      <Box width={VG_LOC_W}>
        <Text dimColor>{"prefix key"}</Text>
      </Box>
      <Box width={VG_COL_W} flexDirection="row">
        <Text color="yellow">{"g"}</Text>
      </Box>
      <Box width={VG_COL_W} flexDirection="row">
        <Text color="yellow">{"m"}</Text>
        <Text dimColor>{" / "}</Text>
        <Text color="yellow">{"⌃r"}</Text>
      </Box>
      <Box width={VG_COL_W} flexDirection="row">
        <Text color="yellow">{"a"}</Text>
        <Text dimColor>{" / "}</Text>
        <Text color="yellow">{"⌃l"}</Text>
      </Box>
      <Text color="yellow">{"c"}</Text>
    </Box>,
  )

  // Grid rows
  for (let i = 0; i < VERB_GRID.length; i++) {
    const row = VERB_GRID[i]
    if (row.separator) {
      lines.push(<Text key={`vg-sep-${i}`}> </Text>)
    }
    lines.push(
      <Box key={`vg-${i}`} flexDirection="row">
        <Text>{"  "}</Text>
        <Box width={VG_LOC_W} flexDirection="row">
          <Text color="yellow">{row.key}</Text>
          <Text>{" " + row.location}</Text>
        </Box>
        <Box width={VG_COL_W}>
          <GridCell value={row.goto} />
        </Box>
        <Box width={VG_COL_W}>
          <GridCell value={row.move} />
        </Box>
        <Box width={VG_COL_W}>
          <GridCell value={row.add} />
        </Box>
        <GridCell value={row.create} />
      </Box>,
    )
  }

  lines.push(<Text key="vg-blank"> </Text>)
  return lines
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
        <Text dimColor>Press ? or Esc</Text>
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
      <Text dimColor>Esc to close</Text>
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
