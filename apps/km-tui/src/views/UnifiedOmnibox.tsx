/**
 * UnifiedOmnibox — the single sigil-dispatched omnibox component (Phase 6).
 *
 * Pure renderer: takes the current `OmniboxPane` plus a `results` row array
 * and renders a TextInput + SelectList + footer inside a ModalDialog.
 * Key handling and state mutation live outside the component — they flow
 * through the omniboxReduce reducer via the hosting TUI's input layer
 * (Phase 7 wires those up).
 *
 * v1 constraint: SelectList hard-codes estimateHeight={1}, so each row
 * must be one line. OmniboxRow (Phase 3) enforces that.
 *
 * See docs/design/omnibox.md and apps/km-tui/src/state/omnibox.ts.
 */
import React from "react"
import { Box, Muted, ModalDialog, Small, Strong, Text } from "@silvery/ag-react"
import { OmniboxRow, type OmniboxRowData } from "./OmniboxRow.tsx"
import type { OmniboxPane } from "../state/omnibox.ts"
import { modeOf, resolveEffectiveCommand } from "../state/omnibox.ts"

export interface UnifiedOmniboxProps {
  /** The pane value-object from ui.omnibox — carries state + frozen spec. */
  pane: OmniboxPane
  /** Ranked, filtered, pre-projected rows for the current buffer/mode. */
  results: readonly OmniboxRowData[]
  /** Dialog width in columns. Matches the host chrome. */
  width?: number
  /**
   * When rendered as a "local find" bottom-left bar instead of a center
   * dialog. Derived from `buffer.startsWith("/")` by the caller.
   */
  layout?: "center" | "bottom-left"
}

/** Mode label for the buffer header (tight, 1-line). */
function modeLabel(mode: string): string {
  switch (mode) {
    case "command":
      return "Command"
    case "context":
      return "Context"
    case "tag":
      return "Tag"
    case "project":
      return "Project"
    case "node":
      return "Node"
    case "local_find":
      return "Find"
    case "universal":
      return "Search"
    default:
      return mode
  }
}

/** Footer caption — what Enter will do right now. */
function footerCaption(pane: OmniboxPane): string {
  const cmd = resolveEffectiveCommand(pane.state)
  const hasArg = pane.state.selectedArgumentId != null
  if (!hasArg && cmd !== "local_find" && cmd !== "default") {
    return `enter ${cmd} · (no target) · esc cancel`
  }
  if (!hasArg) {
    return `enter · (no target) · esc cancel`
  }
  return `enter ${cmd} · esc cancel`
}

/** Centered dialog variant (the default v1 form). */
function CenterOmnibox({ pane, results, width }: Required<Omit<UnifiedOmniboxProps, "layout">>): React.ReactElement {
  const mode = modeOf(pane.state.buffer)
  return (
    <ModalDialog
      title={`${modeLabel(mode)} omnibox`}
      titleAlign="flex-start"
      width={width}
      footer={<Small>{footerCaption(pane)}</Small>}
    >
      <Box flexDirection="column" width="100%">
        {/* Buffer header — shows what the user is typing. */}
        <Box height={1} paddingX={1}>
          <Text wrap="truncate">
            <Strong>{pane.state.buffer || " "}</Strong>
            {pane.state.selectedArgumentId && (
              <Muted>
                {" · "}
                {pane.state.selectedArgumentId}
              </Muted>
            )}
          </Text>
        </Box>
        {/* Divider */}
        <Box height={1} paddingX={1}>
          <Muted>{"─".repeat(Math.max(0, width - 2))}</Muted>
        </Box>
        {/* Result rows (up to 12 for v1; full virtualization lands later). */}
        {results.length === 0 ? (
          <Box height={1} paddingX={1}>
            <Muted>{"(no results)"}</Muted>
          </Box>
        ) : (
          results.slice(0, 12).map((row) => <OmniboxRow key={row.id} data={row} />)
        )}
      </Box>
    </ModalDialog>
  )
}

/** Bottom-left local-find variant — compact single-line bar. */
function BottomLeftOmnibox({
  pane,
  results,
  width,
}: Required<Omit<UnifiedOmniboxProps, "layout">>): React.ReactElement {
  return (
    <Box flexDirection="column" width={width}>
      <Box height={1} paddingX={1}>
        <Text>
          <Muted>{"/"}</Muted>
          <Strong>{pane.state.buffer.slice(1)}</Strong>
          <Muted>{` · ${results.length} matches`}</Muted>
        </Text>
      </Box>
    </Box>
  )
}

export function UnifiedOmnibox({ pane, results, width = 80, layout }: UnifiedOmniboxProps): React.ReactElement {
  const effectiveLayout = layout ?? (pane.state.buffer.startsWith("/") ? "bottom-left" : "center")
  if (effectiveLayout === "bottom-left") {
    return <BottomLeftOmnibox pane={pane} results={results} width={width} />
  }
  return <CenterOmnibox pane={pane} results={results} width={width} />
}
