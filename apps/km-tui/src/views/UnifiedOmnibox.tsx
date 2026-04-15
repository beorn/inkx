/**
 * UnifiedOmnibox — sigil-dispatched command palette / picker surface.
 *
 * Renders a ModalDialog containing the live input box, a scrollable result
 * list, and a footer. Key handling and state mutation live outside the
 * component (the connector in WorkspaceChrome.tsx owns the reducer wiring).
 *
 * The result list uses SelectList-style cursor highlighting — the caller
 * passes `selectedIndex` and the component projects it onto rows.
 *
 * See docs/design/omnibox.md.
 */
import React from "react"
import { Box, ModalDialog, Small } from "@silvery/ag-react"
import type { UseEditContextResult } from "@silvery/ag-react"
import { InputBox } from "./shared-components.tsx"
import { OmniboxRow, type OmniboxRowData } from "./OmniboxRow.tsx"
import type { OmniboxPane } from "../state/omnibox.ts"
import { modeOf } from "../state/omnibox.ts"

export interface UnifiedOmniboxProps {
  /** The pane value-object from ui.omnibox — carries state + frozen spec. */
  pane: OmniboxPane
  /** Ranked, filtered, pre-projected rows for the current buffer/mode. */
  results: readonly OmniboxRowData[]
  /** Index of the currently-highlighted result row. */
  selectedIndex: number
  /** Live edit context for the input (beforeCursor/afterCursor/value). */
  editCtx: UseEditContextResult
  /** Dialog width in columns. */
  width: number
  /** Max dialog height in rows — drives auto-sizing and scroll. */
  maxHeight: number
  /** Mouse hover moves the keyboard cursor to the hovered row. */
  onRowHover?: (index: number) => void
  /** Mouse click selects + confirms the row. */
  onRowClick?: (index: number) => void
}

/**
 * Chrome lookup: title label, hotkey badge, input placeholder per sigil mode.
 * Deliberately no "omnibox" string — each mode labels itself with the action
 * the user is about to run.
 */
const modeChrome = {
  command: { label: "Command", hotkey: ":", placeholder: "Type a command…", ghost: "type to search commands" },
  context: { label: "Context", hotkey: "@", placeholder: "Search contexts…", ghost: "e.g. @someone" },
  tag: { label: "Tag", hotkey: "#", placeholder: "Search tags…", ghost: "e.g. #topic" },
  project: { label: "Project", hotkey: "+", placeholder: "Search projects…", ghost: "e.g. +name" },
  local_find: { label: "Find", hotkey: "/", placeholder: "Find in view…", ghost: "text to find" },
  universal: {
    label: "Search",
    hotkey: "",
    placeholder: "Type a command or search…",
    ghost: ": commands · @ # + nodes · / find",
  },
} as const

/**
 * Dialog chrome budget in rows — border(2) + input(1) + divider(1) +
 * title(1) + footer(1) + padding(2). Matches the legacy Omnibox so the
 * visual footprint of the two surfaces is the same during dogfood.
 */
const DIALOG_CHROME = 8

export function UnifiedOmnibox({
  pane,
  results,
  selectedIndex,
  editCtx,
  width,
  maxHeight,
  onRowHover,
  onRowClick,
}: UnifiedOmniboxProps): React.ReactElement {
  const buffer = pane.state.buffer
  const mode = modeOf(buffer)
  const chrome = modeChrome[mode] ?? modeChrome.universal

  // Ghost hint disappears as soon as the user types real content — a buffer
  // of just the leading sigil (`:` / `@` / `#` / `+` / `/`) still counts as
  // "effectively empty" because the sigil was pre-filled for them, not typed.
  const bufferIsSigilOnly = buffer.length === 0 || (buffer.length === 1 && ":@#+/~".includes(buffer))
  const ghostHint = bufferIsSigilOnly ? chrome.ghost : ""

  const resultCount = results.length
  const maxVisible = Math.max(1, maxHeight - DIALOG_CHROME)

  // Scroll offset: keep selection visible, centered when possible.
  const scrollOffset =
    resultCount > 0
      ? Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, resultCount - maxVisible)))
      : 0

  // Auto-size dialog height to content (clamped to maxHeight).
  const contentRows = Math.min(resultCount || 1, maxVisible)
  const dialogHeight = Math.min(DIALOG_CHROME + contentRows, maxHeight)

  const visibleResults = results.slice(scrollOffset, scrollOffset + maxVisible)

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Small>{"↑↓ nav  Enter select  Esc close"}</Small>
      {resultCount > maxVisible && (
        <Small>
          {scrollOffset > 0 ? "↑" : " "}
          {` ${selectedIndex + 1}/${resultCount} `}
          {scrollOffset + maxVisible < resultCount ? "↓" : " "}
        </Small>
      )}
    </Box>
  )

  return (
    <ModalDialog
      title={chrome.label}
      hotkey={chrome.hotkey}
      width={width}
      height={dialogHeight}
      footer={footerContent}
    >
      {/* Input — inside the dialog, fills the full dialog width via
          InputBox's `width="100%"` wrapper. Ghost hint shows only while
          the buffer is empty or sigil-only; it disappears the moment the
          user types real content. */}
      <Box flexShrink={0} width="100%">
        <InputBox
          beforeCursor={editCtx.beforeCursor}
          afterCursor={editCtx.afterCursor}
          prompt="> "
          promptColor="$primary"
          placeholder={chrome.placeholder}
          ghostHint={ghostHint}
          focusRing
        />
      </Box>

      {/* Result list — flex-grow fills the remaining dialog height. */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        {resultCount === 0 ? (
          <Small>No results</Small>
        ) : (
          visibleResults.map((row, i) => {
            const actualIndex = scrollOffset + i
            const isSelected = actualIndex === selectedIndex
            return (
              <OmniboxRow
                key={row.id}
                data={{ ...row, isSelected }}
                onHover={onRowHover ? () => onRowHover(actualIndex) : undefined}
                onClick={onRowClick ? () => onRowClick(actualIndex) : undefined}
              />
            )
          })
        )}
      </Box>
    </ModalDialog>
  )
}
