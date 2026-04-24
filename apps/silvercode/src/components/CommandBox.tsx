import React, { useRef } from "react"
import { Box, Small, Text, TextArea, TextInput } from "silvery"

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
  const queueLines = hasQueue ? queueText.split("\n") : []
  const queueEntries = hasQueue ? queueText.split("\n\n").length : 0
  // TextArea needs a fixed height; grow with content up to 8 rows.
  const queueHeight = Math.min(Math.max(queueLines.length, 1), 8)

  // Color policy: focused side pops at $fg, unfocused fades to $fg-muted.
  const queueTextColor = queueFocused ? "$fg" : "$fg-muted"
  // Prompt colors — use the mode color on whichever side has focus,
  // muted on the other.
  const inputPromptColor = queueFocused ? "$fg-muted" : promptColor

  return (
    <Box backgroundColor="$bg-surface-subtle" paddingX={2} paddingY={1} flexShrink={0} flexDirection="column">
      {/* Header row — QUEUE label + release hint. Only shown when the queue
          has content (otherwise the command box looks like a plain input). */}
      {hasQueue && (
        <Box flexDirection="row" gap={1} paddingBottom={1}>
          {queueFocused ? <Small color="$muted">esc / ctrl+enter to release</Small> : null}
          <Box flexGrow={1} />
          <Small color={queueFocused ? "$accent" : "$muted"}>
            QUEUE · {queueEntries} {queueEntries === 1 ? "entry" : "entries"}
          </Small>
        </Box>
      )}

      {/* Queue region — each line prefixed with a grey `>`. The TextArea is
          an overlay on top of the rendered prompt-lines: the prompts sit
          behind the cursor area. Easier / more correct path: render the
          prompts + TextArea side-by-side in a single row per logical line
          is impractical (TextArea owns its own newline layout). Instead we
          show a non-editable "prompted" preview when the queue is UNFOCUSED
          and swap to the live editable TextArea when FOCUSED. */}
      {hasQueue && !queueFocused && (
        <Box flexDirection="column">
          {queueLines.map((line, i) => (
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

      {/* Horizontal rule — a single-row $border-colored Box. Rendered
          only when queue is present so the command input still looks
          standalone when nothing's queued. */}
      {hasQueue && <Box height={1} backgroundColor="$border" flexShrink={0} />}

      {/* Command input — UNMOUNTED when the queue has focus so there's
          never more than one visible cursor on screen (silvery TextInput
          always renders its inverse-block visual cursor regardless of
          isActive; only the hardware cursor is gated). When the queue
          releases, this remounts and re-focuses. `inputValue` is
          controlled in App.tsx so remounting doesn't lose the buffer.
          A static Text render takes the input's slot while the queue is
          focused so the box doesn't reflow. */}
      <Box flexDirection="row" paddingTop={hasQueue ? 1 : 0}>
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

