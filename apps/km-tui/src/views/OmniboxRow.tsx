/**
 * OmniboxRow — one-line row renderer for the unified omnibox (Phase 3).
 *
 * Renders a normalized OmniboxRowData descriptor. Adapters (commandToRow,
 * nodeToRow) convert domain objects (CommandDef, KNode) into descriptors,
 * keeping the row component decoupled from the registry and the repo.
 *
 * Constraint: must be exactly 1 line tall, because Silvery's SelectList
 * hardcodes estimateHeight={1} in its virtualization layer.
 */
import React from "react"
import { Box, Muted, Small, Text } from "@silvery/ag-react"
import type { TextDecoration } from "../text/inline-ast-types.ts"
import { InlineText } from "../text/InlineComponents.tsx"

/**
 * Normalized row descriptor. Commands and nodes both flow through this
 * shape so the row renderer doesn't branch on domain type.
 */
export interface OmniboxRowData {
  /**
   * Raw id of the backing domain object — a CommandDef.id for commands,
   * a KNode.id for nodes. Consumers disambiguate via `kind`, not by
   * parsing a namespaced prefix.
   */
  id: string
  /** Domain of the row — used to branch confirm-handling and rendering hints. */
  kind: "command" | "node"
  /** Icon character (nerd font glyph or emoji). */
  icon: string
  /** Optional icon color token (`$fg-accent`, `$fg-muted`, etc.). */
  iconColor?: string
  /** Primary label — command name or node title. */
  title: string
  /** Optional search-highlight decorations for the title. */
  titleDecorations?: TextDecoration[]
  /** Secondary context — parent path, command description, tags. */
  context?: string
  /** Right-aligned hint — keybinding, sigil, or favorite key. */
  hint?: string
  /** Whether this row is currently highlighted in the SelectList. */
  isSelected?: boolean
  /** Disabled state (greys the row, makes Enter a no-op + bell). */
  disabled?: boolean
}

/**
 * One-line row renderer. Three horizontal regions:
 *  1. Icon (fixed width)
 *  2. Title + context (flex-grow, truncates)
 *  3. Hint (fixed width, never squeezed)
 *
 * Optional mouse handlers: `onHover` fires on mouse-enter (callers use this
 * to move the keyboard cursor to the hovered row — tree-view behavior),
 * `onClick` fires on click (callers use this to select + confirm).
 */
export function OmniboxRow({
  data,
  onHover,
  onClick,
}: {
  data: OmniboxRowData
  onHover?: () => void
  onClick?: () => void
}): React.ReactElement {
  const { icon, iconColor, title, titleDecorations, context, hint, isSelected, disabled } = data

  // Selected row is the omnibox cursor — use $bg-cursor/$fg-cursor (scheme's
  // terminal cursor color) for native-feel highlight per design system.
  const bg = isSelected ? "$bg-cursor" : "$bg-surface-overlay"
  const fg = disabled ? "$fg-muted" : isSelected ? "$fg-cursor" : undefined
  // Selection rules win over everything: on a selected row ALL content —
  // including $fg-muted icons — takes the selection fg (black).
  // For unselected muted icons (e.g. the command ':' marker), we render via
  // the <Small> preset below (MECE: fine print = $fg-muted + dimColor bundled).
  const iconIsMuted = iconColor === "$fg-muted"
  const iconFg = disabled ? "$fg-muted" : isSelected ? "$selection" : iconColor
  const iconUsesFinePrint = iconIsMuted && !isSelected && !disabled

  return (
    <Box width="100%" height={1} backgroundColor={bg} flexDirection="row" onMouseEnter={onHover} onClick={onClick}>
      {/* Icon — glyph + single trailing space. The selection state is
          communicated entirely by the row's bg color; no cursor glyph (▸)
          and no leading padding. */}
      <Box flexGrow={0} flexShrink={0}>
        {iconUsesFinePrint ? <Small>{icon} </Small> : <Text color={iconFg}>{icon} </Text>}
      </Box>

      {/* Title + context — flex-grow, truncates */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
        <Text color={fg} wrap="truncate" bold={isSelected && !disabled}>
          <InlineText
            text={title}
            decorations={titleDecorations}
            context={isSelected && !disabled ? { stripInlineColors: true } : undefined}
          />
          {context &&
            (isSelected ? (
              <Text color="$selection">
                {"  "}
                {context}
              </Text>
            ) : (
              <Muted>
                {"  "}
                {context}
              </Muted>
            ))}
        </Text>
      </Box>

      {/* Hint — fixed width, never truncated. Plain Text (not <Small>) so the
          keybinding reads at default fg — it's navigation-relevant meta that
          the user scans; muting it makes discovery harder. On selection it
          takes $selection (black) like the rest of the row's content. */}
      {hint && (
        <Box flexGrow={0} flexShrink={0}>
          <Text color={fg}>{hint}</Text>
        </Box>
      )}
    </Box>
  )
}
