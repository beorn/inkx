/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI, organized around
 * the verb x location chord system.
 *
 * Scrollable with j/k when content exceeds viewport.
 */
import React from "react"
import { Box, Text } from "inkx"
import { ModalDialog } from "./shared-components.tsx"

interface HelpOverlayProps {
  width: number
  height: number
  scrollOffset?: number
}

// ── Content lines ────────────────────────────────────────────────────
// Each section is a flat array of React elements (one per line).
// We assemble them all, then slice for scrolling.

/** Section header with box-drawing decoration */
function SectionHeader({ title }: { title: string }) {
  return (
    <Text>
      <Text dimColor>{"── "}</Text>
      <Text bold color="cyan">
        {title}
      </Text>
      <Text dimColor>{" " + "─".repeat(Math.max(0, 56 - title.length))}</Text>
    </Text>
  )
}

/** Key = yellow, desc = dim */
function KD({ k, d }: { k: string; d: string }) {
  return (
    <>
      <Text color="yellow">{k}</Text>
      <Text dimColor> {d}</Text>
    </>
  )
}

/** Chord matrix cell: suffix + key combo, fixed width */
function ChordCell({ combo, width }: { combo: string; width: number }) {
  if (combo === "—") {
    return <Text dimColor>{combo.padEnd(width)}</Text>
  }
  return <Text color="yellow">{combo.padEnd(width)}</Text>
}

/** Build all content lines as an array of React elements */
function buildContentLines(): React.ReactElement[] {
  const lines: React.ReactElement[] = []

  // ── VERBS x LOCATIONS (the centerpiece) ──────────────────────────
  lines.push(<SectionHeader key="s-chord" title="VERBS x LOCATIONS" />)
  lines.push(
    <Text key="chord-hdr">
      {"  "}
      <Text dimColor>{"           "}</Text>
      <Text bold color="green">
        {"GO (g)    "}
      </Text>
      <Text bold color="magenta">
        {"MOVE (m)  "}
      </Text>
      <Text bold color="blue">
        {"ADD (a)"}
      </Text>
    </Text>,
  )

  const matrix: Array<[string, string, string, string, string]> = [
    ["i", "inbox", "gi", "mi", "ai"],
    ["j", "today", "gj", "mj", "aj"],
    ["h", "home", "gh", "mh", "ah"],
    ["+", "project", "g+", "m+", "a+"],
    ["[", "node", "g[", "m[", "a["],
    ["#", "tag", "g#", "m#", "a#"],
    ["@", "person", "\u2014", "\u2014", "a@"],
  ]

  for (const [suffix, label, go, move, add] of matrix) {
    lines.push(
      <Text key={`chord-${suffix}`}>
        {"  "}
        <Text color="yellow">{suffix}</Text>
        <Text dimColor>{"  " + label.padEnd(8)}</Text>
        <ChordCell combo={go} width={10} />
        <ChordCell combo={move} width={10} />
        <ChordCell combo={add} width={10} />
      </Text>,
    )
  }
  lines.push(<Text key="chord-blank"> </Text>)

  // ── TASK (t-prefix) ──────────────────────────────────────────────
  lines.push(<SectionHeader key="s-task" title="TASK (t)" />)
  lines.push(
    <Text key="task-row">
      {"  "}
      <KD k="tt" d="dialog" />
      {"  "}
      <KD k="to" d="owner" />
      {"  "}
      <KD k="td" d="date" />
      {"  "}
      <KD k="t!" d="priority" />
      {"  "}
      <KD k="ts" d="status" />
    </Text>,
  )
  lines.push(<Text key="task-blank"> </Text>)

  // ── NAVIGATION ───────────────────────────────────────────────────
  lines.push(<SectionHeader key="s-nav" title="NAVIGATION" />)
  lines.push(
    <Text key="nav-1">
      {"  "}
      <KD k="hjkl" d="move" />
      {"  "}
      <KD k="JK" d="block nav" />
      {"  "}
      <KD k="gg" d="first" />
      <Text dimColor> / </Text>
      <KD k="G" d="last" />
    </Text>,
  )
  lines.push(
    <Text key="nav-2">
      {"  "}
      <KD k="{}" d="history" />
      {"  "}
      <KD k="z" d="zoom in" />
      <Text dimColor> / </Text>
      <KD k="Z" d="out" />
      {"  "}
      <KD k="PgUp/Dn" d="page" />
    </Text>,
  )
  lines.push(
    <Text key="nav-3">
      {"  "}
      <KD k="HL" d="fold/unfold" />
      {"  "}
      <KD k="<>" d="fold all" />
      {"  "}
      <KD k="+-" d="content lines" />
    </Text>,
  )
  lines.push(<Text key="nav-blank"> </Text>)

  // ── EDITING ──────────────────────────────────────────────────────
  lines.push(<SectionHeader key="s-edit" title="EDITING" />)
  lines.push(
    <Text key="edit-1">
      {"  "}
      <KD k="i" d="edit title (start)" />
      {"  "}
      <KD k="Enter" d="edit title (end)" />
    </Text>,
  )
  lines.push(
    <Text key="edit-2">
      {"  "}
      <KD k="I" d="edit body (start)" />
      {"  "}
      <KD k="S-Enter" d="edit body (end)" />
    </Text>,
  )
  lines.push(
    <Text key="edit-3">
      {"  "}
      <KD k="o/O" d="new below/above" />
      {"  "}
      <KD k="c/C" d="capture" />
      {"  "}
      <KD k="e" d="archive" />
    </Text>,
  )
  lines.push(
    <Text key="edit-4">
      {"  "}
      <KD k="d" d="cut" />
      {"  "}
      <KD k="y" d="copy" />
      {"  "}
      <KD k="p" d="paste" />
      {"  "}
      <KD k="x/X" d="done/cycle" />
    </Text>,
  )
  lines.push(
    <Text key="edit-5">
      {"  "}
      <KD k="Tab/S-Tab" d="indent" />
      {"  "}
      <KD k="u/U" d="undo" />
      {"  "}
      <KD k="Alt+hjkl" d="shift" />
    </Text>,
  )
  lines.push(<Text key="edit-blank"> </Text>)

  // ── SEARCH & DIALOGS ─────────────────────────────────────────────
  lines.push(<SectionHeader key="s-search" title="SEARCH & DIALOGS" />)
  lines.push(
    <Text key="dlg-1">
      {"  "}
      <KD k="/" d="find" />
      {"  "}
      <KD k=":" d="omnibox" />
      {"  "}
      <KD k="F" d="search/replace" />
    </Text>,
  )
  lines.push(
    <Text key="dlg-2">
      {"  "}
      <KD k="T" d="task dialog" />
      {"  "}
      <KD k="G" d="filter" />
      {"  "}
      <KD k="A" d="AI" />
      {"  "}
      <KD k="P" d="preview pane" />
    </Text>,
  )
  lines.push(<Text key="dlg-blank"> </Text>)

  // ── SELECTION & SYSTEM ───────────────────────────────────────────
  lines.push(<SectionHeader key="s-sel" title="SELECTION & SYSTEM" />)
  lines.push(
    <Text key="sel-1">
      {"  "}
      <KD k="Space" d="select" />
      {"  "}
      <KD k="v" d="visual mode" />
      {"  "}
      <KD k="S-arrows" d="extend" />
      {"  "}
      <KD k="C-a" d="select all" />
    </Text>,
  )
  lines.push(
    <Text key="sel-2">
      {"  "}
      <KD k="P" d="smart pane" />
      {"  "}
      <KD k="Esc" d="layered dismiss" />
      {"  "}
      <KD k="," d="settings" />
      {"  "}
      <KD k="q" d="quit" />
    </Text>,
  )
  lines.push(<Text key="sel-blank"> </Text>)

  // ── BARE SYMBOLS ─────────────────────────────────────────────────
  lines.push(<SectionHeader key="s-bare" title="BARE SYMBOLS (node mode)" />)
  lines.push(
    <Text key="bare-1">
      {"  "}
      <KD k="@" d="assign (=a@)" />
      {"  "}
      <KD k="#" d="tag (=a#)" />
      {"  "}
      <KD k="+" d="project (=m+)" />
      {"  "}
      <KD k="[" d="node (=m[)" />
    </Text>,
  )
  lines.push(<Text key="bare-blank"> </Text>)

  // ── SMART OPEN ───────────────────────────────────────────────────
  lines.push(<SectionHeader key="s-open" title="SMART OPEN" />)
  lines.push(
    <Text key="open-1">
      {"  "}
      <KD k="go" d="Finder/browser" />
      {"  "}
      <KD k="gO" d="terminal/editor" />
      {"  "}
      <KD k="C-o" d="smart open" />
    </Text>,
  )

  return lines
}

// Pre-build content lines (static data)
const contentLines = buildContentLines()
const TOTAL_LINES = contentLines.length

// Minimum dimensions to render the overlay
const MIN_WIDTH = 30
const MIN_HEIGHT = 10

export function HelpOverlay({ width, height, scrollOffset = 0 }: HelpOverlayProps) {
  // Guard against invalid dimensions - render fallback if too small
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

  // Calculate content dimensions
  const boxWidth = Math.max(MIN_WIDTH, Math.min(70, width - 8))
  // ModalDialog: border (2) + paddingY (2) + title (1) + title spacer (1) + footer spacer (1) + footer (1) = 8 lines of chrome
  const chromeLines = 8
  const boxHeight = Math.max(MIN_HEIGHT, Math.min(TOTAL_LINES + chromeLines, height - 6))
  const visibleLines = boxHeight - chromeLines

  // Clamp scroll offset
  const maxScroll = Math.max(0, TOTAL_LINES - visibleLines)
  const clampedOffset = Math.min(scrollOffset, maxScroll)

  // Slice visible content
  const visibleContent = contentLines.slice(clampedOffset, clampedOffset + visibleLines)

  // Scroll indicators
  const canScrollUp = clampedOffset > 0
  const canScrollDown = clampedOffset < maxScroll
  const scrollHint =
    canScrollUp || canScrollDown
      ? `${canScrollUp ? "\u2191" : " "}j/k scroll${canScrollDown ? "\u2193" : " "}`
      : ""

  // Center the box
  const marginLeft = Math.max(0, Math.floor((width - boxWidth) / 2))
  const marginTop = Math.max(0, Math.floor((height - boxHeight) / 2))

  const footer = (
    <Box>
      <Text dimColor>? or Esc to close</Text>
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
      <ModalDialog width={boxWidth} height={boxHeight} title="Keyboard Shortcuts" footer={footer}>
        {visibleContent}
      </ModalDialog>
    </Box>
  )
}
