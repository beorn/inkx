import React, { useEffect } from "react"
import { Box, Muted, Text, TextArea } from "silvery"

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
  // eat the card. +1 for the trailing line hint when focused.
  const lines = value.length === 0 ? 0 : value.split("\n").length
  const height = Math.min(Math.max(lines, 1), 8)

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only react to the value going empty
  useEffect(() => {
    if (value.length === 0 && focused) onRelease()
  }, [value])

  if (value.length === 0) return null

  return (
    <Box paddingX={2} paddingTop={1} flexShrink={0} flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Muted>queued · {lines} line{lines === 1 ? "" : "s"}</Muted>
        {focused && <Muted>— esc / ctrl+enter to release</Muted>}
      </Box>
      <Box backgroundColor="$bg-surface-subtle" paddingX={2} paddingY={1} minWidth={0}>
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
