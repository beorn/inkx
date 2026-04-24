import React, { useEffect } from "react"
import { Box, Small, Text, TextArea } from "silvery"

/**
 * Queue editor — a multi-line TextArea rendered above the CommandInput
 * when the user types further messages while Claude is mid-turn. Claude
 * Code's model: one textarea containing every queued message, submitted
 * as ONE turn on next idle. Users can cursor up into this editor to
 * edit / delete queued lines before flush.
 *
 * Focus semantics:
 *   - isActive=true when `focused` is true → editor owns keys, submission
 *     is paused (controller.holdQueue(true)).
 *   - Pressing Escape OR Ctrl+Enter releases focus back to the command
 *     input; submission resumes (holdQueue(false) triggers tryFlush).
 *   - Hides itself entirely when the buffer is empty — no visual clutter
 *     during normal idle typing.
 */
export function QueueEditor({
  value,
  focused,
  onChange,
  onRelease,
}: {
  value: string
  focused: boolean
  onChange: (text: string) => void
  /** Called when the editor gives up focus (Esc or Ctrl+Enter). */
  onRelease: () => void
}): React.ReactElement | null {
  // Row height: one row per line, capped at 8 so a runaway queue doesn't
  // eat the card.
  const lines = value.length === 0 ? 0 : value.split("\n").length
  const height = Math.min(Math.max(lines, 1), 8)
  // Entry count — paragraphs separated by blank lines. Matches the
  // controller's `\n\n`-join when appending new messages.
  const entries = value.length === 0 ? 0 : value.split("\n\n").length

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only react to the value going empty
  useEffect(() => {
    if (value.length === 0 && focused) onRelease()
  }, [value])

  if (value.length === 0) return null

  // Focused: accent-colored label + left border to signal keyboard ownership.
  // Unfocused: dim, no border — fades into the chrome so it doesn't compete
  // with the command input for the eye.
  const labelColor = focused ? "$accent" : "$muted"
  const borderColor = focused ? "$accent" : undefined

  return (
    <Box paddingX={2} paddingTop={1} flexShrink={0} flexDirection="column">
      {/* Header row — grow-spacer pushes the "↑ N queued" indicator to the
          right edge, claude-code-ish pill style. The release hint shows on
          the left only while focused so it doesn't take up space when the
          editor is idle. */}
      <Box flexDirection="row" gap={1}>
        {focused && <Small color="$muted">esc / ctrl+enter to release</Small>}
        <Box flexGrow={1} />
        <Small color={labelColor}>
          ↑ {entries} queued
        </Small>
      </Box>
      <Box
        backgroundColor="$bg-surface-subtle"
        paddingX={2}
        paddingY={1}
        minWidth={0}
        borderStyle={focused ? "single" : undefined}
        borderLeft={focused}
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderColor={borderColor}
      >
        <TextArea
          value={value}
          onChange={onChange}
          isActive={focused}
          submitKey="ctrl+enter"
          onSubmit={() => onRelease()}
          height={height}
        />
      </Box>
    </Box>
  )
}

/** Exposed so App.tsx can gauge whether the queue is non-empty without
 *  subscribing to the controller itself. */
export { type ReactElement } from "react"

// Separate file-level hint so the main export is simple; nothing else here.
export const QueueEditorEscapeKey = "Escape"
