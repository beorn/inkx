/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
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
import { chipsFromQuery, type Chip } from "../state/omnibox-chips.ts"
import { ghostFor, type GhostCandidate } from "../state/omnibox-ghost.ts"
import { previewForRow, type PreviewContent } from "../state/omnibox-preview.ts"

// =============================================================================
// Empty-buffer prefix guide
// =============================================================================

const PREFIX_GUIDE: ReadonlyArray<readonly [sigil: string, label: string]> = [
  ["(none)", "search everything"],
  [":", "commands"],
  ["+", "projects"],
  ["@", "contexts"],
  ["#", "tags"],
  ["[", "regular nodes (no tasks)"],
  ["/", "find on screen"],
]

const TASK_BRACKETS: ReadonlyArray<readonly [bracket: string, label: string]> = [
  ["[]", "any task"],
  ["[ ]", "todo"],
  ["[/]", "wip"],
  ["[!]", "blocked"],
  ["[x]", "done"],
  ["[-]", "dropped"],
]

const GUIDE_SIGIL_WIDTH = 10

function GuideRow({ sigil, label }: { sigil: string; label: string }): React.ReactElement {
  return (
    <Box flexDirection="row">
      <Box width={GUIDE_SIGIL_WIDTH}>
        <Text>{sigil}</Text>
      </Box>
      <Text color="$fg-muted">{label}</Text>
    </Box>
  )
}

function GuideHeading({ children }: { children: string }): React.ReactElement {
  return (
    <Text bold color="$fg-muted">
      {children}
    </Text>
  )
}

// =============================================================================
// Parse chips strip — visible "what the parser understood" legend
// =============================================================================

/**
 * One-line strip of chips that mirrors the buffer's parsed structure.
 * Renders only when the buffer parses to at least one recognized token —
 * empty buffers fall through to the prefix guide.
 *
 * Implements `km-tui.omnibox-parse-chips` — the "visible narrowing legend"
 * pattern from Emacs Consult and which-key. Pure presentation; the
 * derivation lives in `state/omnibox-chips.ts` so the same data is
 * available to tests, the preview pane, and any future debug surface.
 *
 * Acceptance:
 *  (a) chips render above the buffer, one per parsed token
 *  (b) chips update on every keystroke without jitter (component is pure
 *      and re-renders only when `chips` changes by reference)
 *  (c) chip color/style differs per token kind via theme tokens
 *  (d) typing an unknown token shows it as a `text` chip, not nothing
 *  (g) chips are display-only; tokens are still edited via the buffer
 */
function ParseChips({ chips }: { chips: readonly Chip[] }): React.ReactElement | null {
  if (chips.length === 0) return null
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      data-testid="omnibox-parse-chips"
      // Single-line strip with vertical breathing room above and below
      // so it doesn't collide with the input cursor row.
      marginTop={1}
      marginBottom={1}
      gap={1}
    >
      {chips.map((chip) => (
        <Text key={chip.key} color={chip.color} data-chip-kind={chip.kind}>
          {chip.label}
        </Text>
      ))}
    </Box>
  )
}

// =============================================================================
// Preview pane — Telescope/Helm-style detail of the highlighted row
// =============================================================================

/**
 * One-line summary + body lines for the currently-highlighted row.
 * Implements `km-tui.omnibox-preview-pane`. Pure presentation — the
 * derivation lives in `state/omnibox-preview.ts`.
 *
 * Acceptance:
 *  (a) preview pane renders for node results (content + breadcrumbs)
 *  (b) preview pane renders for command results (description + summary)
 *  (c) toggle via `preview` prop (default off)
 *  (d) doesn't interfere with bottom-left layout (caller suppresses)
 */
function PreviewPane({ content }: { content: PreviewContent }): React.ReactElement {
  return (
    <Box
      data-testid="omnibox-preview"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      borderStyle="single"
      borderColor="$border-subtle"
    >
      {/* Heading row — title + optional hint */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={content.disabled ? "$fg-muted" : "$fg-accent"}>
          {content.title}
        </Text>
        {content.hint && <Text color="$fg-muted">{content.hint}</Text>}
      </Box>
      {/* Body lines (description for commands, breadcrumb for nodes) */}
      {content.lines.map((line, i) => (
        <Text key={`line-${i}`} color="$fg-default">
          {line}
        </Text>
      ))}
      {/* "What Enter will do" summary — always present, dimmed */}
      <Small>{content.summary}</Small>
    </Box>
  )
}

/** Shown inside the omnibox when the buffer is empty and no sigil is set.
 * Horizontally centered, pushed down a few rows from the input for a quiet
 * "first time here?" feel. */
function PrefixGuide(): React.ReactElement {
  return (
    <Box flexDirection="row" justifyContent="center" marginTop={2}>
      <Box flexDirection="column">
        <GuideHeading>PREFIXES</GuideHeading>
        <Box flexDirection="column" marginTop={1}>
          {PREFIX_GUIDE.map(([sigil, label]) => (
            <GuideRow key={sigil} sigil={sigil} label={label} />
          ))}
        </Box>
        <Box marginTop={1}>
          <GuideHeading>TASKS</GuideHeading>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {TASK_BRACKETS.map(([bracket, label]) => (
            <GuideRow key={bracket} sigil={bracket} label={label} />
          ))}
        </Box>
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
  /**
   * Optional accept-ghost callback (km-tui.omnibox-interactions, Phase 7).
   * When the connector wires this, Tab / Space / Right-Arrow at the end of
   * the buffer trigger it with the full ghost-completed buffer. Pure
   * delegation — the connector decides whether to update via SET_BUFFER
   * directly or run a follow-up action.
   */
  onAcceptGhost?: (completedBuffer: string) => void
  /**
   * Show a preview pane below the result list (km-tui.omnibox-preview-pane).
   * Default: off. Recommended for center-layout dialogs on terminals
   * with enough vertical room (>= 24 rows). Bottom-left layout always
   * suppresses this — the find-bar is a single line and has no preview.
   */
  preview?: boolean
  /**
   * Effective command id used in the preview's "Enter will run X" summary
   * for node rows. Connector typically passes the result of
   * `resolveEffectiveCommand(pane.state)` here.
   */
  previewEffectiveCommand?: string
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
  node: { label: "Node", hotkey: "[", placeholder: "Search regular nodes…", prompt: "" },
  local_find: { label: "Find", hotkey: "/", placeholder: "Find in view…", prompt: "" },
  universal: { label: "Search", hotkey: "", placeholder: "Type a command or search…", prompt: "" },
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
          <Text color="$fg-muted">{"/"}</Text>
          <Text bold>{pane.state.buffer.slice(1)}</Text>
          <Text color="$fg-muted">{` · ${results.length} matches`}</Text>
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
  onAcceptGhost,
  onRowClick,
  onRowHover,
  width,
  maxHeight,
  preview,
  previewEffectiveCommand,
}: Omit<UnifiedOmniboxProps, "layout"> & { width: number }): React.ReactElement {
  const buffer = pane.state.buffer
  const mode = modeOf(buffer)
  const chrome = modeChromeFor(mode)

  // Show the prefix guide in the empty-universal state: buffer is empty AND the
  // caller didn't override with a sigil-specific defaultCommand (e.g. `manage_favorites`
  // should still surface favorites, not the guide).
  const showGuide = buffer === "" && mode === "universal" && pane.state.defaultCommand === "default"

  // Live parse chips — strip rendered between the input and the result list
  // when the buffer parses to at least one token. Memoized on the buffer so
  // the chip array reference is stable across renders that don't change the
  // buffer (e.g. selection-only changes).
  const chips = React.useMemo(() => chipsFromQuery(buffer), [buffer])

  // Ghost completion — derive from the top-ranked result. We trim the
  // leading sigil from the candidate id (commands) so the ghost suffix
  // is right-aligned to the buffer's text portion. Pure derivation;
  // the connector wires `onAcceptGhost` to commit the completion.
  const ghost = React.useMemo(() => {
    const ghostCandidates: GhostCandidate[] = results.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
    }))
    return ghostFor(buffer, ghostCandidates)
  }, [buffer, results])
  // Build the completed-buffer string callers commit when the user accepts
  // the ghost (Tab / Space / Right-Arrow). Stable identity — only changes
  // when buffer or ghost change.
  const completedBuffer = ghost != null ? buffer + ghost : null
  const handleAcceptGhost = React.useCallback(() => {
    if (completedBuffer != null && onAcceptGhost) onAcceptGhost(completedBuffer)
  }, [completedBuffer, onAcceptGhost])

  // Preview-as-selection — derive content from the highlighted row when
  // the preview pane is enabled. Hidden when no row is selected (empty
  // results) so we don't show an empty pane.
  const selectedRow = results[selectedIndex] ?? null
  const previewContent = React.useMemo(
    () =>
      preview ? previewForRow(selectedRow, { effectiveCommand: previewEffectiveCommand }) : null,
    [preview, selectedRow, previewEffectiveCommand],
  )

  // Chrome budget (borderless dialog, opencode-style): title(2) + paddingY(2)
  // + input(1 row, borderless) + blank-line gap(1) = 6 rows. No outer border.
  // paddingX=3 pushes primary content (title, input, results) 2 cols right of
  // the previous inset and pulls fringe elements (esc, row hints) 2 cols left
  // of the previous outer edge.
  const overhead = 6
  const maxVisible = maxHeight ? Math.max(1, maxHeight - overhead) : 12

  return (
    <ModalDialog
      title={chrome.label}
      titleAlign="flex-start"
      titleRight={<Text color="$fg-muted">esc</Text>}
      width={width}
      height={maxHeight}
      paddingX={3}
      borderStyle={undefined}
      borderColor={undefined}
    >
      <Box flexDirection="column" width="100%">
        <TextInput
          value={buffer}
          onChange={onBufferChange}
          onSubmit={onConfirm}
          placeholder={chrome.placeholder}
          prompt={chrome.prompt}
          promptColor="$fg-accent"
        />
        {/* Ghost completion — rendered just below the input as a dim
            "press Tab to complete: <full-id>" hint. Acceptance happens via
            the parent connector binding Tab/Space/Right-Arrow to
            onAcceptGhost — we surface the available completion here so the
            user discovers the chord exists. */}
        {ghost != null && (
          <Box flexDirection="row" data-testid="omnibox-ghost" onClick={handleAcceptGhost}>
            <Small>
              {"  ↳ "}
              {buffer}
              {ghost}
              {"  (Tab to complete)"}
            </Small>
          </Box>
        )}
        {/* Parse chips — empty when the buffer is empty/whitespace, so this
            gracefully degrades to a single blank line in that case. */}
        <ParseChips chips={chips} />
        {/* One-line gap between the input and the results/guide — visual
            breathing room so the input doesn't abut the first row. */}
        {chips.length === 0 && <Text> </Text>}
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
        {/* Preview pane — Telescope/Helm-style detail of the highlighted
            row. Only renders for center layout (bottom-left passes through
            UnifiedOmnibox without ever reaching here). */}
        {previewContent && <PreviewPane content={previewContent} />}
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
