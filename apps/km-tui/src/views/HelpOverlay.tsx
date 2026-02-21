/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI, auto-generated from the
 * keybinding registry and command definitions.
 *
 * Scrollable with j/k when content exceeds viewport.
 */
import React, { useMemo } from "react"
import { Box, Text } from "inkx"
import { ModalDialog } from "./shared-components.tsx"
import { getHelpScreenData, type HelpSection } from "@km/commands"

interface HelpOverlayProps {
  width: number
  height: number
  scrollOffset?: number
}

// ── Content lines ────────────────────────────────────────────────────
// Each section is a flat array of React elements (one per line).
// We assemble them all, then slice for scrolling.

/** Format keys for display: join with / separator, pad to fixed width */
function KeyColumn({ keys, width }: { keys: string[]; width: number }) {
  const display = keys.join("/")
  return <Text color="yellow">{display.padEnd(width)}</Text>
}

/** Chord-heavy sections that benefit from two-column layout */
const TWO_COL_SECTIONS = new Set(["Fold & Chords", "Task", "System"])

/** Build content lines from auto-generated help data */
function buildContentLines(sections: HelpSection[], contentWidth: number): React.ReactElement[] {
  const lines: React.ReactElement[] = []
  const headerWidth = contentWidth - 5 // "── " prefix + " " after title

  for (const section of sections) {
    const title = section.category.toUpperCase()
    const lineLen = Math.max(0, headerWidth - title.length)

    // Section header spanning full width
    lines.push(
      <Text key={`s-${section.category}`}>
        <Text dimColor>{"── "}</Text>
        <Text bold color="cyan">
          {title}
        </Text>
        <Text dimColor>{" " + "─".repeat(lineLen)}</Text>
      </Text>,
    )

    // Use two-column layout for compact sections when wide enough
    const useTwoCols = TWO_COL_SECTIONS.has(section.category) && contentWidth >= 76
    if (useTwoCols) {
      const colKeyW = 12
      const colDescW = Math.floor((contentWidth - 8) / 2) - colKeyW // 2+key+desc + 4gap + 2+key+desc
      for (let i = 0; i < section.items.length; i += 2) {
        const left = section.items[i]
        const right = section.items[i + 1]
        lines.push(
          <Text key={`${section.category}-${i}`}>
            {"  "}
            <KeyColumn keys={left.keys} width={colKeyW} />
            <Text dimColor>{left.description.slice(0, colDescW).padEnd(colDescW)}</Text>
            {right ? (
              <>
                {"    "}
                <KeyColumn keys={right.keys} width={colKeyW} />
                <Text dimColor>{right.description.slice(0, colDescW)}</Text>
              </>
            ) : null}
          </Text>,
        )
      }
    } else {
      const KEY_WIDTH = 14
      const DESC_WIDTH = contentWidth - KEY_WIDTH - 2
      for (let i = 0; i < section.items.length; i++) {
        const item = section.items[i]
        lines.push(
          <Text key={`${section.category}-${i}`}>
            {"  "}
            <KeyColumn keys={item.keys} width={KEY_WIDTH} />
            <Text dimColor>{item.description.slice(0, DESC_WIDTH)}</Text>
          </Text>,
        )
      }
    }

    // Blank line after section
    lines.push(<Text key={`${section.category}-blank`}> </Text>)
  }

  // Add favorites/columns note at the end
  const favTitle = "FAVORITES & COLUMNS"
  const favLineLen = Math.max(0, headerWidth - favTitle.length)
  lines.push(
    <Text key="s-extra">
      <Text dimColor>{"── "}</Text>
      <Text bold color="cyan">
        {favTitle}
      </Text>
      <Text dimColor>{" " + "─".repeat(favLineLen)}</Text>
    </Text>,
  )
  lines.push(
    <Text key="fav-1">
      {"  "}
      <Text color="yellow">{"0-9           "}</Text>
      <Text dimColor>Jump to favorite board</Text>
    </Text>,
  )
  lines.push(<Text key="fav-blank"> </Text>)

  return lines
}

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
  const boxWidth = Math.max(MIN_WIDTH, Math.min(90, width - 8))
  // Content area = boxWidth - border(2) - paddingX(4)
  const contentWidth = boxWidth - 6

  // Generate content from registry (memoized since data is static)
  const contentLines = useMemo(() => {
    const sections = getHelpScreenData()
    return buildContentLines(sections, contentWidth)
  }, [contentWidth])

  const totalLines = contentLines.length
  // ModalDialog: border (2) + paddingY (2) + title (1) + title spacer (1) + footer spacer (1) + footer (1) = 8 lines of chrome
  const chromeLines = 8
  const boxHeight = Math.max(MIN_HEIGHT, Math.min(totalLines + chromeLines, height - 6))
  const visibleLines = boxHeight - chromeLines

  // Clamp scroll offset
  const maxScroll = Math.max(0, totalLines - visibleLines)
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
