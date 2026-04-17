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
  /** Optional icon color token (`$primary`, `$muted`, etc.). */
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

  const bg = isSelected ? "$selection-bg" : "$popover-bg"
  const fg = disabled ? "$muted" : isSelected ? "$selection" : undefined
  const iconFg = disabled ? "$muted" : isSelected ? "$selection" : iconColor

  return (
    <Box width="100%" height={1} backgroundColor={bg} flexDirection="row" onMouseEnter={onHover} onClick={onClick}>
      {/* Icon — fixed 3-col region (glyph + space) */}
      <Box flexGrow={0} flexShrink={0}>
        <Text color={iconFg}>
          {isSelected ? "▸ " : "  "}
          {icon}{" "}
        </Text>
      </Box>

      {/* Title + context — flex-grow, truncates */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
        <Text color={fg} wrap="truncate" bold={isSelected && !disabled}>
          <InlineText
            text={title}
            decorations={titleDecorations}
            context={isSelected && !disabled ? { colorOverride: "$selection" } : undefined}
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

      {/* Hint — fixed width, never truncated */}
      {hint && (
        <Box flexGrow={0} flexShrink={0}>
          <Small color={isSelected ? "$selection" : undefined}>{hint}</Small>
        </Box>
      )}
    </Box>
  )
}
