/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI.
 * Multi-column layout with verb × location grid. Scrollable with j/k.
 *
 * IMPORTANT: Use flexbox layout (Box + flexGrow) and Fill component for all
 * alignment — dot leaders, section header dashes, etc. NEVER manually compute
 * character widths or repeat counts. Think of this as a web app with CSS, not
 * a text app with string arithmetic.
 */
import React, { useMemo } from "react"
import { Box, Text, Fill, ModalDialog, H2, H3, Small } from "@silvery/ag-react"
import { KeyBinding } from "./shared-components.tsx"
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
  ["System"],
  "verb-grid",
]

// ── Key display formatting ──────────────────────────────────────────
// Uses KeyBinding from shared-components for chord dot separators and / alternatives.

// ── Section header ──────────────────────────────────────────────────

function SectionHeaderLine({ title, hint }: { title: string; hint?: string }): React.ReactElement {
  return (
    <Box flexDirection="row">
      <H2>{title.toUpperCase()}</H2>
      {hint && (
        <>
          <Text> </Text>
          <Small>{hint}</Small>
        </>
      )}
      <Text> </Text>
      <Box flexGrow={1} flexBasis={0}>
        <Fill>
          <Text dimColor>{"─"}</Text>
        </Fill>
      </Box>
    </Box>
  )
}

// ── Description text (/ separators rendered faint) ──────────────────

function DescText({ text }: { text: string }): React.ReactElement {
  if (!text.includes(" / ")) return <Text>{text}</Text>
  const parts = text.split(" / ")
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color={"$muted"}>{"/"}</Text>}
          <Text>{part}</Text>
        </React.Fragment>
      ))}
    </>
  )
}

// ── Entry line (key...description with dot leaders) ─────────────────

function EntryLine({ keys, desc }: { keys: string[]; desc: string }): React.ReactElement {
  return (
    <Box flexDirection="row">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text> </Text>}
          <KeyBinding keys={k} />
        </React.Fragment>
      ))}
      <Text> </Text>
      <Box flexGrow={1} flexBasis={0}>
        <Fill>
          <Text color={"$disabled-fg"}>{"·"}</Text>
        </Fill>
      </Box>
      <Text> </Text>
      <DescText text={desc} />
    </Box>
  )
}

// ── Section building ────────────────────────────────────────────────

function buildSectionLines(section: HelpSection, keyPrefix: string): React.ReactElement[] {
  const lines: React.ReactElement[] = []
  lines.push(<SectionHeaderLine key={`${keyPrefix}-hdr`} title={section.category} />)
  for (let i = 0; i < section.items.length; i++) {
    const item = section.items[i]
    if (!item) continue
    lines.push(<EntryLine key={`${keyPrefix}-e${i}`} keys={item.keys} desc={item.description} />)
  }
  if (section.category === "Panes") {
    lines.push(
      <Text key={`${keyPrefix}-foot`} dimColor>
        {"⌃v or v both work as prefixes"}
      </Text>,
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
    // Verb grid — special rendering
    if (row === "verb-grid") {
      lines.push(...buildVerbGridLines())
      lines.push(<Text key={`blank-${lines.length}`}> </Text>)
      continue
    }

    const cols: React.ReactElement[][] = []
    for (const name of row) {
      const section = sectionMap.get(name)
      if (section) {
        cols.push(buildSectionLines(section, `s${cols.length}-${section.category}`))
        rendered.add(name)
      }
    }

    if (cols.length === 0) continue

    if (cols.length === 1) {
      // Single column — full width
      lines.push(...(cols[0] ?? []))
    } else {
      // Multi-column: merge lines side by side using fixed-width Boxes
      const gap = 4
      const colWidth = Math.floor((contentWidth - gap * (cols.length - 1)) / cols.length)
      const maxLines = Math.max(...cols.map((c) => c.length))

      for (let i = 0; i < maxLines; i++) {
        lines.push(
          <Box key={`row-${lines.length}`} flexDirection="row">
            {cols.map((col, ci) => (
              <React.Fragment key={ci}>
                {ci > 0 && <Box width={gap} />}
                <Box width={colWidth} flexDirection="column">
                  {col[i] ?? null}
                </Box>
              </React.Fragment>
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
    lines.push(...buildSectionLines(section, `extra-${section.category}`))
    lines.push(<Text key={`blank-${lines.length}`}> </Text>)
  }

  return lines
}

// ── Verb × Location grid ────────────────────────────────────────────

/** Column widths for the verb grid */
const VG_LOC_W = 16
const VG_COL_W = 12

function GridCell({ value, showDot = true }: { value?: string; showDot?: boolean }): React.ReactElement {
  if (!value) return showDot ? <Text dimColor>{"·"}</Text> : <Text>{""}</Text>
  return <KeyBinding keys={value} />
}

function buildVerbGridLines(): React.ReactElement[] {
  const lines: React.ReactElement[] = []

  // Section header + blank line
  lines.push(<SectionHeaderLine key="vg-hdr" title="Shortcuts" />)

  // Column headers (verb names)
  lines.push(
    <Box key="vg-col-hdr" flexDirection="row">
      <Box width={VG_LOC_W} />
      <Box width={VG_COL_W}>
        <H3>{"go to"}</H3>
      </Box>
      <Box width={VG_COL_W}>
        <H3>{"move"}</H3>
      </Box>
      <Box width={VG_COL_W}>
        <H3>{"add/link"}</H3>
      </Box>
      <H3>{"create"}</H3>
    </Box>,
  )

  // Prefix key row (chord prefix + ctrl alternatives)
  lines.push(
    <Box key="vg-prefix" flexDirection="row">
      <Box width={VG_LOC_W}>
        <Text dimColor>{"prefix key"}</Text>
      </Box>
      <Box width={VG_COL_W} flexDirection="row">
        <Text color={"$fg"}>{"g"}</Text>
        <Text dimColor>{" or "}</Text>
        <Text color={"$fg"}>{"⌃g"}</Text>
      </Box>
      <Box width={VG_COL_W} flexDirection="row">
        <Text color={"$fg"}>{"m"}</Text>
        <Text dimColor>{" or "}</Text>
        <Text color={"$fg"}>{"⌃m"}</Text>
      </Box>
      <Box width={VG_COL_W} flexDirection="row">
        <Text color={"$fg"}>{"a"}</Text>
        <Text dimColor>{" or "}</Text>
        <Text color={"$fg"}>{"⌃l"}</Text>
      </Box>
      <Text color={"$fg"}>{"c"}</Text>
    </Box>,
  )

  // Grid rows
  for (let i = 0; i < VERB_GRID.length; i++) {
    const row = VERB_GRID[i]
    if (!row) continue
    if (row.separator) {
      lines.push(<Text key={`vg-sep-${i}`}> </Text>)
    }
    // Continuation rows (empty key) don't show · for empty columns
    const showDot = row.key !== ""
    lines.push(
      <Box key={`vg-${i}`} flexDirection="row">
        <Box width={VG_LOC_W} flexDirection="row">
          <Text color={"$fg"}>{row.key}</Text>
          <Text>{" " + row.location}</Text>
        </Box>
        <Box width={VG_COL_W} flexDirection="row">
          <GridCell value={row.goto} showDot={showDot} />
        </Box>
        <Box width={VG_COL_W} flexDirection="row">
          <GridCell value={row.move} showDot={showDot} />
        </Box>
        <Box width={VG_COL_W} flexDirection="row">
          <GridCell value={row.add} showDot={showDot} />
        </Box>
        <GridCell value={row.create} showDot={showDot} />
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
        borderColor={"$border"}
        data-dialog="help"
      >
        <Text color={"$fg"}>Terminal too small</Text>
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
          <Text color={"$info"}>{scrollHint}</Text>
        </>
      )}
    </Box>
  )

  return (
    <Box
      position="absolute"
      marginLeft={marginLeft}
      marginTop={marginTop}
      flexDirection="column"
      data-dialog="help"
      userSelect="contain"
    >
      <ModalDialog
        width={boxWidth}
        height={boxHeight}
        title="Keyboard Shortcuts"
        hotkey="?"
        titleColor={"$primary"}
        footer={footer}
      >
        {visibleContent}
      </ModalDialog>
    </Box>
  )
}
