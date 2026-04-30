import React, { useRef } from "react"
import { Box, Text, TextArea, useBoxRect } from "silvery"
import type { TextAreaHandle } from "silvery"

/**
 * Wire format → display format. The controller stores queued entries
 * joined by `\n\n` (Claude's paragraph break). The user sees one entry
 * per line — collapse the double newline to a single one for display.
 */
function wireToDisplay(wire: string): string {
  return wire.split("\n\n").join("\n")
}

/**
 * Display format → wire format. Every newline the user types becomes a
 * paragraph break on the wire. Round-tripping a wire-format buffer
 * through `wireToDisplay` then `displayToWire` is the identity (assuming
 * no entry contains a literal newline of its own — entries are typed
 * as single-line follow-ups, the multi-line case is rare and acceptable
 * to flatten).
 */
function displayToWire(display: string): string {
  return display.split("\n").join("\n\n")
}

/**
 * Command box — Option B model. Two always-live silvery `<TextArea>`
 * widgets stacked, with a labeled divider between when the queue is
 * non-empty:
 *
 *   ┌──────────────────────────────── QUEUE ────────┐
 *   │ > queued entry 1                              │   ← TextArea (queue)
 *   │ > queued entry 2                              │      always live
 *   │ > queued entry 3                              │
 *   ├──────────────────────────── QUEUE HELD ───────┤   ← divider (yellow when focused)
 *   │ > current input                               │   ← TextArea (command)
 *   └───────────────────────────────────────────────┘      always live
 *
 * Focus is just "which TextArea has the cursor". `focusedRegion` toggles
 * via cursor-boundary handoff: Up at top of command → queue; Down at
 * bottom of queue → command. Driven by silvery's `onEdge` callback.
 *
 * Semantics:
 *   - Enter in command: send/enqueue the current buffer (parent's onSubmit).
 *   - Enter in queue: insert a newline (= start a new queued entry).
 *   - Ctrl+Enter / Ctrl+J in queue: force-flush the entire queue
 *     (parent's onQueueSubmit). Same byte as LF; works in both legacy
 *     and Kitty keyboard modes.
 *   - Per-region coloring: focused region pops at $fg; other dims to $fg-muted.
 *
 * Wire format vs display: the controller stores the queue buffer with
 * entries joined by `\n\n` (paragraph break in Claude's input). SessionPromptComposer
 * shows one entry per line with its own `>` prefix — `wireToDisplay`
 * collapses `\n\n` → `\n` for the TextArea, `displayToWire` expands every
 * newline back on edit so the wire format stays canonical.
 *
 * Maps to ACP: drives the outbound `session/prompt` request body
 * (text + ambient resources + image attachments). Slash commands are
 * surfaced via `<AvailableCommandsPalette>` rendered above when the
 * input starts with '/'.
 */
export function SessionPromptComposer({
  queueText,
  onQueueChange,
  onQueueSubmit,
  inputValue,
  onInputChange,
  inputDisabled,
  onSubmit,
  onExit,
  focusedRegion,
  onFocusRegion,
  promptColor = "$primary",
}: {
  queueText: string
  onQueueChange: (text: string) => void
  /** Force-flush the queue NOW (Enter in queue region). */
  onQueueSubmit: () => void
  inputValue: string
  onInputChange: (text: string) => void
  inputDisabled?: boolean
  /** Submit the current command buffer (Enter in command region). */
  onSubmit: (text: string) => void
  /** Ctrl+D×2 exit. */
  onExit: () => void
  focusedRegion: "queue" | "command"
  /** Set focusedRegion (used by onEdge handoffs). */
  onFocusRegion: (region: "queue" | "command") => void
  /** Mode-tied color for the `>` prompt (plan=$info / auto=$warning / etc.) */
  promptColor?: string
}): React.ReactElement {
  const armedAt = useRef<number>(0)
  // Refs to the two TextAreas for cursor placement on boundary handoff.
  // Up→queue: cursor lands at end of last queue line. Down→command:
  // cursor lands at offset 0.
  const queueRef = useRef<TextAreaHandle | null>(null)
  const commandRef = useRef<TextAreaHandle | null>(null)

  const hasQueue = queueText.length > 0
  // Wire format vs display: the controller stores the queue buffer with
  // entries joined by `\n\n` (paragraph break in Claude's input). The user
  // sees one entry per line with its own `>` prefix and a single newline
  // between entries — collapse `\n\n` → `\n` for display, expand back on
  // every change.
  const displayQueueText = wireToDisplay(queueText)
  const queueDisplayLines = displayQueueText.length > 0 ? displayQueueText.split("\n") : []
  // Queue height: one row per display line, capped at 12 (per design —
  // scrolls beyond that via silvery's built-in TextArea scroll tracking).
  const queueRows = hasQueue ? Math.min(12, Math.max(1, queueDisplayLines.length)) : 0

  const queueIsFocused = focusedRegion === "queue"
  const commandIsFocused = focusedRegion === "command"

  // Per-region focus signals:
  //   - Hardware cursor — silvery's TextArea hides the cursor when
  //     `isActive=false`, so only the focused region shows a blinking caret.
  //   - Prompt color — focused region uses the mode color (`promptColor`,
  //     `$primary`/`$info`/`$warning`/...); unfocused region's prompt is
  //     `$fg-muted`. Bold on the prompt makes it pop further.
  //   - Divider title — `QUEUE` in `$fg-muted`, `QUEUE HELD` in `$warning`
  //     when the queue region owns focus (handled by `<QueueDivider/>`).
  //
  // TODO(km-silvery.textarea-color-dim): silvery TextArea has no `color` /
  // `dim` prop — when it lands, dim the unfocused TextArea body to
  // `$fg-muted` for a stronger focus signal. The structural focus is
  // already correct; this is a polish pass.

  return (
    // `userSelect="contain"` scopes drag-selection to the command box —
    // drags starting in the input/queue area can't extend into cards or
    // the side panel.
    <Box backgroundColor="$bg-surface-subtle" paddingY={1} flexShrink={0} flexDirection="column" userSelect="contain">
      {/* Queue region — silvery TextArea, always live. Hidden entirely
          when the buffer is empty (no divider, no widget).

          The user-visible display has ONE `>` prefix per line, with each
          queued entry on its own row separated by a single newline. The
          wire format keeps the canonical `\n\n` paragraph break Claude
          expects, so we transform on the way in (`wireToDisplay`) and back
          out (`displayToWire`). The prefix column renders one `>` glyph
          per visible line, cycling through the same focus colour as the
          command prompt so the focused side pops. */}
      {hasQueue && (
        <>
          <Box flexDirection="row">
            <Box flexDirection="column" flexShrink={0}>
              {Array.from({ length: queueRows }, (_, i) => (
                <Text key={i} color="$fg-muted">
                  {i < queueDisplayLines.length ? "> " : "  "}
                </Text>
              ))}
            </Box>
            <Box flexGrow={1}>
              <TextArea
                ref={queueRef}
                value={displayQueueText}
                onChange={(text) => onQueueChange(displayToWire(text))}
                isActive={queueIsFocused}
                showInactiveCursor={false}
                // Auto-grow with the content, capped at 12 rows (per
                // design — scrolls beyond that via TextArea's built-in
                // scroll tracking). Replaces the hand-rolled
                // `Math.min(12, Math.max(1, queueDisplayLines.length))`
                // height calculation.
                fieldSizing="content"
                minRows={1}
                maxRows={12}
                // Plain Enter inserts a newline (= adds a new queued
                // entry). Ctrl+J (= Ctrl+Enter on the wire — same byte
                // as LF) force-flushes the entire buffer. The previous
                // `submitKey="enter"` flushed on every plain Enter,
                // making it impossible to edit a multi-entry queue.
                submitKey="ctrl+enter"
                onSubmit={() => {
                  onQueueSubmit()
                }}
                onEdge={(edge) => {
                  // Down at bottom of queue → hand off to command,
                  // cursor at start of first line.
                  if (edge === "bottom") {
                    onFocusRegion("command")
                    commandRef.current?.setCursor(0)
                    return true
                  }
                  return false
                }}
              />
            </Box>
          </Box>

          <QueueDivider focused={queueIsFocused} />
        </>
      )}

      {/* Command region — silvery TextArea, always live. */}
      <Box flexDirection="row">
        <Text color={commandIsFocused ? promptColor : "$fg-muted"} bold>
          {"> "}
        </Text>
        <Box flexGrow={1}>
          <TextArea
            ref={commandRef}
            value={inputValue}
            onChange={onInputChange}
            isActive={commandIsFocused && !inputDisabled}
            showInactiveCursor={false}
            // Defaults give chat-input behavior (fieldSizing=content,
            // minRows=1, maxRows=8). Empty input is 1 row; multi-line
            // composition grows up to 8 rows then scrolls. Replaces the
            // hand-rolled `Math.max(1, Math.min(8, lines.length))`
            // height calculation.
            submitKey="enter"
            placeholder={inputDisabled ? "spawning…" : ""}
            onSubmit={(v) => {
              if (!v.trim()) {
                // Empty Enter — Ctrl+D-style double-tap to exit.
                const now = Date.now()
                if (armedAt.current > 0 && now - armedAt.current < 1500) {
                  onExit()
                  return
                }
                armedAt.current = now
                return
              }
              onSubmit(v)
            }}
            onEdge={(edge) => {
              // Up at top of command → hand off to queue, cursor at
              // end of last queue line.
              if (edge === "top" && hasQueue) {
                onFocusRegion("queue")
                queueRef.current?.setCursor(queueText.length)
                return true
              }
              return false
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Divider with a colored inline title. Reimplements silvery's Divider
 * (which hard-codes the title color via `<Text bold>`) so we can render
 * "QUEUE HELD" in `$warning` when the queue region owns focus. Same
 * "──── title ────" shape as silvery's Divider.
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
