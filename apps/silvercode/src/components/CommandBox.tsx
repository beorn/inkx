import React, { useRef } from "react"
import { Box, Divider, Text, TextArea, TextInput } from "silvery"

/**
 * Unified command box — queue area stacked on the command input inside one
 * filled surface. User-visible behaviour (Claude Code style):
 *
 *   ┌──────────────────────────────────────  QUEUE ─┐
 *   │ > queued line 1                               │  ← dim when focus on input
 *   │ > queued line 2                               │
 *   ├───────────────────────────────────────────────┤  ← horizontal rule
 *   │ > |live input text                            │
 *   └───────────────────────────────────────────────┘
 *
 * Semantics:
 *   - Exactly ONE cursor visible at a time — controlled via `isActive` on
 *     silvery's TextArea (queue) vs TextInput (command). Focus lives in
 *     the parent via `queueFocused`.
 *   - Non-focused area renders text in `$fg-muted` so it's clearly secondary
 *     but still readable. Focused area uses normal `$fg`.
 *   - Each queued line gets a leading grey `>` prompt, mirroring the
 *     command input's `>`.
 *   - `QUEUE` label pinned top-right of the outer box, shown only when
 *     the queue has content. Left-aligned release hint ("esc / ctrl+enter
 *     to release") shows only while the queue is focused.
 *   - Horizontal rule between queue and input renders only when both are
 *     visible (queue non-empty).
 *
 * Parent (App.tsx) owns focus state + keybindings:
 *   - up-arrow / Ctrl+P on empty input with non-empty queue → focus queue
 *   - Esc / Ctrl+Enter from queue → release back to input
 *
 * CommandBox itself is "dumb": it only renders based on props.
 */
export function CommandBox({
  queueText,
  queueFocused,
  onQueueChange,
  onQueueRelease,
  inputValue,
  onInputChange,
  inputDisabled,
  onSubmit,
  onExit,
  promptColor = "$primary",
}: {
  queueText: string
  queueFocused: boolean
  onQueueChange: (text: string) => void
  onQueueRelease: () => void
  inputValue: string
  onInputChange: (text: string) => void
  inputDisabled?: boolean
  onSubmit: (text: string) => void
  onExit: () => void
  /** Mode-tied color for the `>` prompt (plan=$info / auto=$success / etc.) */
  promptColor?: string
}): React.ReactElement {
  const armedAt = useRef<number>(0)

  const hasQueue = queueText.length > 0
  // For the read-only preview: collapse blank separator lines from
  // "\n\n"-joined entries — one `>` per content line only.
  const previewLines = hasQueue ? queueText.split("\n").filter((l) => l.length > 0) : []
  // For the editable TextArea: use the RAW line count (including blank
  // separator lines) so all queued entries are visible inside the editor.
  // Grow with content up to 12 rows.
  const rawLineCount = hasQueue ? queueText.split("\n").length : 1
  const queueHeight = Math.min(Math.max(rawLineCount, 1), 12)

  // Color policy: focused side pops at $fg, unfocused fades to $fg-muted.
  const queueTextColor = queueFocused ? "$fg" : "$fg-muted"
  // Prompt colors — use the mode color on whichever side has focus,
  // muted on the other.
  const inputPromptColor = queueFocused ? "$fg-muted" : promptColor

  // Divider title doubles as the QUEUE label — no extra header row, no
  // vertical padding above/below the rule. When focused, the hint replaces
  // the label so the user sees how to release.
  const dividerTitle = queueFocused ? "esc / ctrl+enter to release" : "QUEUE"

  return (
    <Box backgroundColor="$bg-surface-subtle" paddingX={2} paddingY={1} flexShrink={0} flexDirection="column">
      {/* Queue region — one `>` per content line; blank separator lines
          from `\n\n`-joined entries are filtered out for a compact stack.
          We show a non-editable "prompted" preview when the queue is
          UNFOCUSED and swap to the live editable TextArea when FOCUSED. */}
      {hasQueue && !queueFocused && (
        <Box flexDirection="column">
          {previewLines.map((line, i) => (
            <Box key={i} flexDirection="row">
              <Text color="$fg-muted">{"> "}</Text>
              <Text color={queueTextColor}>{line}</Text>
            </Box>
          ))}
        </Box>
      )}
      {hasQueue && queueFocused && (
        <Box flexDirection="column">
          <TextArea
            value={queueText}
            onChange={onQueueChange}
            isActive
            submitKey="ctrl+enter"
            onSubmit={() => onQueueRelease()}
            height={queueHeight}
          />
        </Box>
      )}

      {/* Labeled divider — single row with "QUEUE" / release hint inline.
          Separates queued buffer from live input. Renders only when queue
          is non-empty so the input stands alone otherwise. */}
      {hasQueue && <Divider title={dividerTitle} />}

      {/* Command input — UNMOUNTED when the queue has focus so there's
          never more than one visible cursor on screen (silvery TextInput
          always renders its inverse-block visual cursor regardless of
          isActive; only the hardware cursor is gated). When the queue
          releases, this remounts and re-focuses. `inputValue` is
          controlled in App.tsx so remounting doesn't lose the buffer.
          A static Text render takes the input's slot while the queue is
          focused so the box doesn't reflow. */}
      <Box flexDirection="row">
        {queueFocused ? (
          <Box flexDirection="row">
            <Text color="$fg-muted" bold={false}>
              {"> "}
            </Text>
            <Text color="$fg-muted">{inputValue || " "}</Text>
          </Box>
        ) : (
          <TextInput
            value={inputValue}
            onChange={onInputChange}
            onSubmit={(v) => {
              if (!v.trim()) return
              onSubmit(v)
            }}
            onEOF={() => {
              const now = Date.now()
              if (armedAt.current > 0 && now - armedAt.current < 1500) {
                onExit()
                return
              }
              armedAt.current = now
            }}
            isActive={!inputDisabled}
            prompt="> "
            promptColor={inputPromptColor}
            promptBold
            placeholder={inputDisabled ? "spawning…" : ""}
          />
        )}
      </Box>
    </Box>
  )
}

