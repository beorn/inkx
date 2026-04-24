import React, { useEffect, useRef, useState } from "react"
import { Box, Divider, Text, TextInput, useBoxRect } from "silvery"
import { useInput } from "silvery/runtime"

/**
 * Unified command box — queue area stacked on the command input inside one
 * filled surface. User-visible behaviour (Claude Code style):
 *
 *   ┌──────────────────────────────── QUEUE ────────┐
 *   │ > queued entry 1                              │  ← one `>` per entry
 *   │ > queued entry 2                              │     in BOTH modes.
 *   ├──────────────────────────── QUEUE HELD ───────┤  ← yellow when focused
 *   │ > |live input text                            │
 *   └───────────────────────────────────────────────┘
 *
 * Semantics:
 *   - Each queued COMMAND renders as ONE row with a leading `>` prompt,
 *     compact — no blank rows between entries even while editing.
 *   - Editor mode renders ONE `TextInput` per entry; the active one shows
 *     the hardware cursor. Up/Down arrows navigate between entries;
 *     Down past the last entry releases focus back to the command input.
 *   - Multi-line entries (paste / slash output) collapse to a single line
 *     for editing — internal `\n` becomes a space. The controller stores
 *     entries joined by `\n\n`; the editor splits on `\n\n` and joins back.
 *   - Divider title: `QUEUE` in `$fg-muted` when unfocused, `QUEUE HELD`
 *     in `$warning` (yellow) when focused.
 *   - Text color: whichever side has focus renders in `$fg`; the other
 *     dims to `$fg-muted`.
 *
 * Parent (App.tsx) owns top-level focus state + entry-into-queue keys:
 *   - up-arrow / Ctrl+P on empty input with non-empty queue → focus queue
 *   - Esc / Ctrl+Enter from queue → release back to input
 *
 * QueueEditor owns per-entry navigation:
 *   - Enter on any entry → flush + release
 *   - Shift+Enter on any entry → insert a new empty entry below, focus it
 *   - Up / Down → move active entry index
 *   - Down past last entry OR Esc → release focus to command input
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
  // Entries — each paragraph separated by `\n\n` is one queued command.
  // Internal `\n` within an entry collapses to a space for display so the
  // editor stays one-row-per-entry.
  const entries = hasQueue ? queueText.split("\n\n").map((e) => e.replace(/\n/g, " ")) : []

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
          modes render one `>` per entry, no blank rows between. */}
      {hasQueue && !queueFocused && (
        <Box flexDirection="column">
          {entries.map((entry, i) => (
            <Box key={i} flexDirection="row">
              <Text color="$fg-muted">{"> "}</Text>
              <Box flexGrow={1}>
                <Text color={queueTextColor}>{entry}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {hasQueue && queueFocused && (
        <QueueEditor entries={entries} onQueueChange={onQueueChange} onQueueRelease={onQueueRelease} />
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
 * Per-entry queue editor. Renders one `<TextInput>` per queued entry with
 * a leading `>` prompt. Active row tracked locally; navigation between
 * rows uses Up/Down. Mounts with the LAST entry active so the user lands
 * on the most recently-queued command (matches the Claude Code idiom of
 * cursor-up recalling the latest input).
 *
 * Per-entry rendering avoids the blank-row / cursor-visibility / submit-key
 * issues the silvery TextArea has with `\n\n`-joined buffers — each
 * TextInput is a single-line readline editor with its own hardware cursor
 * and a clean Enter-to-submit semantic.
 */
function QueueEditor({
  entries,
  onQueueChange,
  onQueueRelease,
}: {
  entries: string[]
  onQueueChange: (text: string) => void
  onQueueRelease: () => void
}): React.ReactElement {
  // Active row — clamped against entry count so it stays valid as the
  // user splits or merges. Initial value = last entry (cursor lands on
  // the most recent queued command).
  const [active, setActive] = useState<number>(() => Math.max(0, entries.length - 1))
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  // Re-clamp when the entry list shrinks (Backspace-merge or external
  // controller mutation). React batches the change with the value update
  // so there's no flash where active points off the end.
  useEffect(() => {
    if (active >= entries.length) setActive(Math.max(0, entries.length - 1))
  }, [active, entries.length])

  const writeBack = (next: string[]): void => {
    onQueueChange(next.join("\n\n"))
  }

  const updateEntry = (i: number, value: string): void => {
    const next = entriesRef.current.slice()
    next[i] = value
    writeBack(next)
  }

  // Keyboard nav for the queue editor. We do NOT pass `onSubmit` to the
  // active TextInput — that flag controls silvery's `useReadline` hook
  // (`handleEnter: !!onSubmit`), and with `handleEnter=false` the
  // readline machinery EARLY-RETURNS on `key.return`, leaving the Enter
  // event for our parent useInput to handle. Same for Esc and the
  // vertical arrows (handleEscape / handleVerticalArrows default false).
  // This is the documented escape hatch — see useReadline.ts:163-169.
  //
  // Per-key behaviour:
  //
  //   Enter        flush + release
  //   Shift+Enter  insert a new empty entry below the active one, focus it
  //   Esc          release focus back to the command input (buffer kept)
  //   Up           move active row up (no wrap); top row stays
  //   Down         move active row down; past the last row → release
  useInput((_input, key) => {
    if (key.shift && key.return) {
      const idx = active
      const list = entriesRef.current
      const next = [...list.slice(0, idx + 1), "", ...list.slice(idx + 1)]
      writeBack(next)
      setActive(idx + 1)
      return
    }
    if (key.return) {
      onQueueRelease()
      return
    }
    if (key.escape) {
      onQueueRelease()
      return
    }
    if (key.upArrow) {
      setActive((i) => Math.max(0, i - 1))
      return
    }
    if (key.downArrow) {
      setActive((i) => {
        if (i >= entriesRef.current.length - 1) {
          onQueueRelease()
          return i
        }
        return i + 1
      })
      return
    }
  })

  // Render only the ACTIVE entry as a TextInput; the rest are plain Text
  // rows. silvery's `useCursor` is last-writer-wins and runs cleanup when
  // `visible: false` — if every inactive TextInput called useCursor with
  // visible=false, the active one's cursor state would be stomped by the
  // last inactive's effect. Restricting the live TextInput to the active
  // row keeps exactly one cursor on screen.
  return (
    <Box flexDirection="column">
      {entries.map((entry, i) => {
        if (i === active) {
          // No `onSubmit` prop — silvery's readline hook gates Enter
          // handling on `handleEnter: !!onSubmit`. Without onSubmit it
          // early-returns on key.return, key.escape, and the vertical
          // arrows, letting our parent useInput own those keys.
          return (
            <Box key={i} flexDirection="row">
              <TextInput
                value={entry}
                onChange={(v) => updateEntry(i, v)}
                isActive
                prompt="> "
                promptColor="$fg-muted"
              />
            </Box>
          )
        }
        return (
          <Box key={i} flexDirection="row">
            <Text color="$fg-muted">{"> "}</Text>
            <Box flexGrow={1}>
              <Text color="$fg-muted">{entry || " "}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
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
