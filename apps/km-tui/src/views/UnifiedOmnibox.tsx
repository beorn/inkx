/**
 * UnifiedOmnibox — the single sigil-dispatched omnibox, rendered via silvery primitives.
 *
 * Thin presentation wrapper over silvery's `ModalDialog + TextInput + PickerList`.
 * All domain logic (sigil detection, slippery rule, command/node projection,
 * confirm/cancel handlers) lives in `state/omnibox.ts`, `state/omnibox-projection.ts`,
 * and `UnifiedOmniboxConnector` in WorkspaceChrome.tsx. This file owns only the
 * mode-derived chrome (title, hotkey, placeholder, footer caption) and the
 * declarative mapping from props → primitives.
 *
 * Key routing (Up/Down/Enter/Esc) stays in the connector via `dialogTargetRef`
 * so the existing command-system plumbing (dialog.nav_up, dialog.confirm,
 * etc.) continues to drive the selection index.
 *
 * See docs/design/omnibox.md and apps/km-tui/src/state/omnibox.ts.
 */
import React from "react"
import { Box, ModalDialog, PickerList, Small, Text, TextInput } from "@silvery/ag-react"
import { OmniboxRow, type OmniboxRowData } from "./OmniboxRow.tsx"
import type { OmniboxPane } from "../state/omnibox.ts"
import { modeOf } from "../state/omnibox.ts"

// =============================================================================
// Empty-buffer prefix guide
// =============================================================================

const PREFIX_GUIDE: ReadonlyArray<readonly [sigil: string, label: string]> = [
  [":", "commands"],
  ["+", "projects"],
  ["@", "contexts"],
  ["#", "tags"],
  ["/", "find on screen"],
]

/** Shown inside the omnibox when the buffer is empty and no sigil is set. */
function PrefixGuide(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Small>PREFIXES</Small>
      <Box flexDirection="column" marginTop={1}>
        {PREFIX_GUIDE.map(([sigil, label]) => (
          <Box key={sigil} flexDirection="row">
            <Box width={3}>
              <Text color="$muted">{sigil}</Text>
            </Box>
            <Text>{label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export interface UnifiedOmniboxProps {
  /** The pane value-object from ui.omnibox — carries state + frozen spec. */
  pane: OmniboxPane
  /** Ranked, filtered, pre-projected rows for the current buffer/mode. */
  results: readonly OmniboxRowData[]
  /** Currently-highlighted row index (caller-managed). */
  selectedIndex: number
  /** Called when the controlled buffer value changes (receives the raw keystroke value). */
  onBufferChange: (value: string) => void
  /** Called when the user presses Enter. */
  onConfirm: () => void
  /** Called when the user clicks a row (receives the row and its index). */
  onRowClick?: (row: OmniboxRowData, index: number) => void
  /** Called when the user hovers over a row. */
  onRowHover?: (index: number) => void
  /** Dialog width in columns. */
  width?: number
  /** Max dialog height — defaults to auto. */
  maxHeight?: number
  /**
   * When rendered as a "local find" bottom-left bar instead of a center dialog.
   * Derived from `buffer.startsWith("/")` by the caller.
   */
  layout?: "center" | "bottom-left"
}

// =============================================================================
// Mode chrome — title / hotkey / placeholder per mode
// =============================================================================

interface ModeChrome {
  label: string
  hotkey: string
  placeholder: string
  /** Prompt prefix shown before the text input. */
  prompt: string
}

const MODE_CHROME: Record<string, ModeChrome> = {
  command: { label: "Command", hotkey: ":", placeholder: "Type a command…", prompt: "" },
  context: { label: "Context", hotkey: "@", placeholder: "Search contexts…", prompt: "" },
  tag: { label: "Tag", hotkey: "#", placeholder: "Search tags…", prompt: "" },
  project: { label: "Project", hotkey: "+", placeholder: "Search projects…", prompt: "" },
  local_find: { label: "Find", hotkey: "/", placeholder: "Find in view…", prompt: "" },
  universal: { label: "Search", hotkey: "", placeholder: "Type a command or search…", prompt: "> " },
}

function modeChromeFor(mode: string): ModeChrome {
  return MODE_CHROME[mode] ?? MODE_CHROME.universal!
}

// =============================================================================
// Renderers
// =============================================================================

/** Bottom-left local-find variant — compact single-line bar. */
function BottomLeftOmnibox({
  pane,
  results,
  width,
}: {
  pane: OmniboxPane
  results: readonly OmniboxRowData[]
  width: number
}): React.ReactElement {
  return (
    <Box flexDirection="column" width={width}>
      <Box height={1} paddingX={1}>
        <Text>
          <Text color="$muted">{"/"}</Text>
          <Text bold>{pane.state.buffer.slice(1)}</Text>
          <Text color="$muted">{` · ${results.length} matches`}</Text>
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Centered dialog variant — the primary form. Composes silvery primitives:
 *
 *   <ModalDialog>
 *     <TextInput />
 *     <PickerList renderItem={OmniboxRow} />
 *   </ModalDialog>
 *
 * The dialog auto-sizes to content height (clamped to `maxHeight`). The
 * PickerList handles viewport clipping and scroll centering internally.
 */
function CenterOmnibox({
  pane,
  results,
  selectedIndex,
  onBufferChange,
  onConfirm,
  onRowClick,
  onRowHover,
  width,
  maxHeight,
}: Omit<UnifiedOmniboxProps, "layout"> & { width: number }): React.ReactElement {
  const buffer = pane.state.buffer
  const mode = modeOf(buffer)
  const chrome = modeChromeFor(mode)

  // Show the prefix guide in the empty-universal state: buffer is empty AND the
  // caller didn't override with a sigil-specific defaultCommand (e.g. `manage_favorites`
  // should still surface favorites, not the guide).
  const showGuide = buffer === "" && mode === "universal" && pane.state.defaultCommand === "default"

  // Chrome budget: border(2) + title(2) + input(3 — content + top/bot border) +
  // padding(2). No footer — the PrefixGuide covers discovery; nav keys (↑↓/Enter/Esc)
  // are standard modal idioms and don't earn screen real-estate here.
  const overhead = 9
  const maxVisible = maxHeight ? Math.max(1, maxHeight - overhead) : 12

  return (
    <ModalDialog
      title={chrome.label}
      titleAlign="flex-start"
      hotkey={chrome.hotkey || undefined}
      width={width}
      height={maxHeight}
    >
      <Box flexDirection="column" width="100%">
        <TextInput
          value={buffer}
          onChange={onBufferChange}
          onSubmit={onConfirm}
          placeholder={chrome.placeholder}
          prompt={chrome.prompt}
          promptColor="$primary"
          borderStyle="round"
          focusBorderColor="$focusborder"
        />
        {showGuide ? (
          <PrefixGuide />
        ) : (
          <PickerList
            items={results as OmniboxRowData[]}
            selectedIndex={selectedIndex}
            getKey={(row) => row.id}
            maxVisible={maxVisible}
            renderItem={(row, selected) => (
              <OmniboxRowClickable
                row={row}
                selected={selected}
                index={results.indexOf(row)}
                onClick={onRowClick}
                onHover={onRowHover}
              />
            )}
          />
        )}
      </Box>
    </ModalDialog>
  )
}

/**
 * Small wrapper that injects click/hover handlers into OmniboxRow. Keeps
 * OmniboxRow itself pure so it can be reused in other contexts (help list,
 * keybinding list) without wiring.
 */
function OmniboxRowClickable({
  row,
  selected,
  index,
  onClick,
  onHover,
}: {
  row: OmniboxRowData
  selected: boolean
  index: number
  onClick?: (row: OmniboxRowData, index: number) => void
  onHover?: (index: number) => void
}): React.ReactElement {
  const data: OmniboxRowData = { ...row, isSelected: selected }
  const handleMouseDown = React.useCallback(() => {
    onClick?.(row, index)
  }, [onClick, row, index])
  const handleMouseEnter = React.useCallback(() => {
    onHover?.(index)
  }, [onHover, index])
  return (
    <Box onMouseDown={handleMouseDown} onMouseEnter={handleMouseEnter}>
      <OmniboxRow data={data} />
    </Box>
  )
}

export function UnifiedOmnibox(props: UnifiedOmniboxProps): React.ReactElement {
  const { pane, results, width = 80, layout } = props
  const effectiveLayout = layout ?? (pane.state.buffer.startsWith("/") ? "bottom-left" : "center")
  if (effectiveLayout === "bottom-left") {
    return <BottomLeftOmnibox pane={pane} results={results} width={width} />
  }
  return <CenterOmnibox {...props} width={width} />
}
