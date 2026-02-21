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

/** Format keys for display: join with / separator, pad to fixed width */
function KeyColumn({ keys, width }: { keys: string[]; width: number }) {
  const display = keys.join("/")
  return <Text color="yellow">{display.padEnd(width)}</Text>
}

/** Build content lines from auto-generated help data */
function buildContentLines(sections: HelpSection[]): React.ReactElement[] {
  const lines: React.ReactElement[] = []
  const KEY_WIDTH = 14
  const DESC_WIDTH = 48

  for (const section of sections) {
    // Section header
    lines.push(<SectionHeader key={`s-${section.category}`} title={section.category.toUpperCase()} />)

    // Single-column layout: one item per line (fits in 64-char content area)
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

    // Blank line after section
    lines.push(<Text key={`${section.category}-blank`}> </Text>)
  }

  // Add favorites/columns note at the end
  lines.push(<SectionHeader key="s-extra" title="FAVORITES & COLUMNS" />)
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

  // Generate content from registry (memoized since data is static)
  const contentLines = useMemo(() => {
    const sections = getHelpScreenData()
    return buildContentLines(sections)
  }, [])

  const totalLines = contentLines.length

  // Calculate content dimensions
  const boxWidth = Math.max(MIN_WIDTH, Math.min(70, width - 8))
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
