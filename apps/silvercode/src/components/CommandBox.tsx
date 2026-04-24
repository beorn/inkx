import React, { useRef } from "react"
import { Box, Text, TextArea, useBoxRect } from "silvery"
import type { TextAreaHandle } from "silvery"

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
 *   - Enter in queue: force-flush the entire queue (parent's onQueueSubmit).
 *   - Shift+Enter: native silvery behaviour — newline within the buffer.
 *   - Per-region coloring: focused region pops at $fg; other dims to $fg-muted.
 *
 * Wire format vs display: the controller stores the queue buffer with
 * entries joined by `\n\n` (paragraph break in Claude's input). The queue
 * TextArea renders that verbatim — blank rows between entries are part of
 * the wire format. Future polish (single-`\n` display + on-send re-expand)
 * can come later.
 */
export function CommandBox({
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
  // Refs to the two TextAreas so the boundary handoffs can move the
  // cursor on the receiving side. `setValue(value)` moves cursor to end
  // (used for Up→queue: cursor lands on end of last queue line). For
  // Down→command we want offset 0 — silvery's TextAreaHandle doesn't
  // currently expose `setCursor`, so we soft-call it via `as any`. Once
  // `km-silvery.textarea-edge-callback` lands the setCursor extension
  // (see SendMessage to silvery-onedge), this becomes a typed call.
  // TODO(km-silvery.textarea-edge-callback-handle): drop `as any` once
  // setCursor is on TextAreaHandle.
  const queueRef = useRef<TextAreaHandle | null>(null)
  const commandRef = useRef<TextAreaHandle | null>(null)

  const hasQueue = queueText.length > 0
  // Queue height: count newlines + 1, capped at 12 (per design — scrolls
  // beyond that via silvery's built-in TextArea scroll tracking).
  const queueRows = hasQueue ? Math.min(12, queueText.split("\n").length) : 0

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
    <Box
      backgroundColor="$bg-surface-subtle"
      paddingX={2}
      paddingY={1}
      flexShrink={0}
      flexDirection="column"
      userSelect="contain"
    >
      {/* Queue region — silvery TextArea, always live. Hidden entirely
          when the buffer is empty (no divider, no widget). */}
      {hasQueue && (
        <>
          <Box flexDirection="row">
            <Text color="$fg-muted">{"> "}</Text>
            <Box flexGrow={1}>
              <TextArea
                ref={queueRef}
                value={queueText}
                onChange={onQueueChange}
                isActive={queueIsFocused}
                height={queueRows}
                submitKey="enter"
                onSubmit={() => {
                  // Plain Enter in the queue region — force-flush.
                  // Shift+Enter still inserts a newline (silvery's
                  // submitKey="enter" only fires onSubmit on bare Enter).
                  onQueueSubmit()
                }}
                onEdge={(edge) => {
                  // Down at bottom of queue → hand off to command,
                  // cursor at start of first line.
                  if (edge === "bottom") {
                    onFocusRegion("command")
                    const cmd = commandRef.current as (TextAreaHandle & { setCursor?: (offset: number) => void }) | null
                    cmd?.setCursor?.(0)
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
            height={Math.max(1, Math.min(8, inputValue.split("\n").length))}
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
                // setValue(value) moves cursor to end of buffer — i.e.
                // end of last queue line. No-op on the buffer content.
                queueRef.current?.setValue(queueText)
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
