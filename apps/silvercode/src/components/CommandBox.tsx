import React, { useRef } from "react"
import { Box, Divider, Text, TextArea, TextInput, useBoxRect } from "silvery"
import { useInput } from "silvery/runtime"

/**
 * Unified command box — queue area stacked on the command input inside one
 * filled surface. User-visible behaviour (Claude Code style):
 *
 *   ┌──────────────────────────────── QUEUE ────────┐
 *   │ > queued entry 1                              │  ← one `>` per entry,
 *   │ > queued entry 2                              │     even while editing.
 *   ├──────────────────────────── QUEUE HELD ───────┤  ← yellow when focused
 *   │ > |live input text                            │
 *   └───────────────────────────────────────────────┘
 *
 * Semantics:
 *   - Each queued COMMAND renders as ONE row with a leading `>` gutter.
 *     Multi-line commands (with internal `\n`) still collapse to a single
 *     `>` row — the gutter counts entries, not raw lines.
 *   - While FOCUSED, the queue is editable via a TextArea whose raw buffer
 *     is entries joined by `\n\n`. The `>` gutter renders to the left of
 *     the TextArea so the prefix is visible during editing.
 *   - Divider title: `QUEUE` in default muted color when unfocused,
 *     `QUEUE HELD` in `$warning` (yellow) when focused.
 *   - Text color: whichever side has focus renders in `$fg`; the other
 *     dims to `$fg-muted`.
 *   - Cursor: silvery TextArea shows the hardware cursor when `isActive`;
 *     we gate the input's cursor by unmounting the TextInput so only one
 *     cursor is ever visible.
 *
 * Parent (App.tsx) owns focus state + keybindings:
 *   - up-arrow / Ctrl+P on empty input with non-empty queue → focus queue
 *   - Enter from queue → flush + release back to input
 *   - Shift+Enter from queue → insert `\n\n` (new entry separator)
 *   - Esc from queue → release back to input (preserves buffer)
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
  // Entries — each paragraph separated by `\n\n` is one queued command
  // and gets ONE `>` gutter marker regardless of internal newlines.
  const entries = hasQueue ? queueText.split("\n\n") : []

  // Queue-editor keybindings that must fire BEFORE the TextArea handles
  // them. silvery's TextArea (submitKey="enter") treats Shift+Enter as a
  // submit (doesn't distinguish shift), and it doesn't handle Escape at
  // all. We intercept both at the parent level.
  //
  // - Shift+Enter  → append `\n\n` (entry separator) without submitting
  // - Escape       → release focus back to the command input (buffer kept)
  //
  // `isActive` gate ensures these only run when the queue editor owns focus.
  useInput(
    (_input, key) => {
      if (!queueFocused) return
      if (key.shift && key.return) {
        onQueueChange(queueText + "\n\n")
        return
      }
      if (key.escape) {
        onQueueRelease()
        return
      }
    },
    { isActive: queueFocused },
  )

  // Color policy: focused side pops at $fg, unfocused fades to $fg-muted.
  const queueTextColor = queueFocused ? "$fg" : "$fg-muted"
  const inputTextColor = queueFocused ? "$fg-muted" : "$fg"
  // Prompt colors — use the mode color on whichever side has focus,
  // muted on the other.
  const inputPromptColor = queueFocused ? "$fg-muted" : promptColor

  return (
    // `userSelect="contain"` scopes drag-selection to the command box —
    // drags starting in the input/queue area can't extend into cards or
    // the side panel.
    <Box
      backgroundColor="$bg-surface-subtle"
      paddingX={2}
      paddingY={1}
      flexShrink={0}
      flexDirection="column"
      userSelect="contain"
    >
      {/* Queue region — preview (unfocused) vs editor (focused). Both
          modes render one `>` per entry in a left gutter. */}
      {hasQueue && !queueFocused && (
        <Box flexDirection="column">
          {entries.map((entry, i) => (
            <Box key={i} flexDirection="row">
              <Text color="$fg-muted">{"> "}</Text>
              <Box flexGrow={1}>
                <Text color={queueTextColor}>{entry.replace(/\n/g, " ")}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {hasQueue && queueFocused && (
        <QueueEditor
          entries={entries}
          queueText={queueText}
          onQueueChange={onQueueChange}
          onQueueRelease={onQueueRelease}
          textColor={queueTextColor}
        />
      )}

      {/* Labeled divider — "QUEUE" unfocused / "QUEUE HELD" focused.
          Inline build (not silvery's Divider) so we can color the title. */}
      {hasQueue && <QueueDivider focused={queueFocused} />}

      {/* Command input — UNMOUNTED when the queue has focus so there's
          never more than one visible cursor on screen. When the queue
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
            <Text color={inputTextColor}>{inputValue || " "}</Text>
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

/**
 * Queue editor — TextArea bound to the raw `\n\n`-joined buffer, with a
 * left-column `>` gutter that renders one marker per entry. The gutter is
 * its own column in a flex-row alongside the TextArea so the `>` markers
 * stay visible while the user edits, regardless of cursor position.
 *
 * Gutter markers align to the FIRST LINE of each entry. Interior lines of
 * a multi-line entry (or the blank separator lines from `\n\n`) get a
 * space in the gutter so vertical alignment matches the TextArea rows.
 */
function QueueEditor({
  entries,
  queueText,
  onQueueChange,
  onQueueRelease,
  textColor,
}: {
  entries: string[]
  queueText: string
  onQueueChange: (text: string) => void
  onQueueRelease: () => void
  textColor: string
}): React.ReactElement {
  // Row-by-row gutter: for each line in the raw buffer, decide whether
  // that line is the first line of an entry (-> render `>`) or a
  // continuation / separator (-> render a space). This keeps the gutter
  // vertically aligned with the TextArea's wrapped rows.
  //
  // Note: this aligns on the SOURCE line index, not the wrapped render
  // index. Long entries that wrap in the TextArea will show `>` on their
  // first SOURCE line only; wrapped continuation rows get a space marker.
  // Without wrap-aware measurement (TextArea doesn't expose it), this is
  // the closest we get — a good-enough approximation for the common case
  // (short single-line entries).
  const rawLines = queueText.split("\n")
  const gutterMarkers: string[] = []
  let inEntryHead = true
  for (const line of rawLines) {
    if (line.length === 0) {
      gutterMarkers.push(" ")
      inEntryHead = true
    } else {
      gutterMarkers.push(inEntryHead ? ">" : " ")
      inEntryHead = false
    }
  }
  const height = Math.min(Math.max(rawLines.length, 1), 12)
  // Silent reference so `entries` counts participate in memo diffing.
  void entries.length

  return (
    <Box flexDirection="row">
      <Box flexDirection="column" flexShrink={0} paddingRight={1}>
        {gutterMarkers.map((m, i) => (
          <Text key={i} color="$fg-muted">
            {m}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <QueueTextArea
          value={queueText}
          onChange={onQueueChange}
          onSubmit={onQueueRelease}
          height={height}
          textColor={textColor}
        />
      </Box>
    </Box>
  )
}

/**
 * Thin wrapper over silvery's TextArea so we can pass submitKey="enter"
 * and keep Shift+Enter as an entry-separator insert (handled at the
 * parent level via useInput). silvery's TextArea submits on plain Enter
 * when submitKey="enter", and Shift+Enter would otherwise submit too —
 * the parent intercepts before dispatch.
 */
function QueueTextArea({
  value,
  onChange,
  onSubmit,
  height,
  textColor,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  height: number
  textColor: string
}): React.ReactElement {
  // `textColor` is informational — TextArea renders via $fg by default;
  // we keep the prop on the wrapper so future theming can dim the editor
  // while another pane has focus (not needed today since the editor is
  // only mounted when focused).
  void textColor
  return (
    <TextArea
      value={value}
      onChange={onChange}
      isActive
      submitKey="enter"
      onSubmit={() => onSubmit()}
      height={height}
    />
  )
}

/**
 * Divider with a colored inline title. Reimplements silvery's Divider
 * (which hard-codes the title color) so we can render "QUEUE HELD" in
 * `$warning` when the editor owns focus.
 */
function QueueDivider({ focused }: { focused: boolean }): React.ReactElement {
  const { width: contentWidth } = useBoxRect()
  const total = contentWidth > 0 ? contentWidth : 40
  const title = focused ? "QUEUE HELD" : "QUEUE"
  const titleColor = focused ? "$warning" : "$fg-muted"
  const pad = ` ${title} `
  const remaining = Math.max(0, total - pad.length)
  const left = Math.floor(remaining / 2)
  const right = remaining - left
  // `Divider` imported to keep the type dependency visible even though
  // we render our own layout here — silvery's Divider is the reference
  // implementation for the "──── title ────" shape.
  void Divider
  return (
    <Box flexDirection="row">
      <Text color="$border-default">{"─".repeat(left)}</Text>
      <Text bold color={titleColor}>
        {pad}
      </Text>
      <Text color="$border-default">{"─".repeat(right)}</Text>
    </Box>
  )
}
