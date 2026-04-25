# Queue UX — Option B design: two TextAreas with seamless cursor boundary

## Context

The queue-editor UX has accumulated ~12 bugs in a single day of iteration. Root cause per `/big` analysis: the queue is modeled as an editable UI widget (QueueEditor with N TextInputs + parent focus state + holdQueue/tryFlush/release ceremony) instead of what it actually is — a _second editable region_ alongside the command input.

Every bug has been us re-implementing textarea semantics (cursor movement, selection, keybindings, focus-gated coloring) across N widgets. Silvery's `<TextArea>` already does all of this for ONE widget.

## Design

### The two-TextArea model

```
┌──────────────────────────────── QUEUE ────────┐   ← divider only when queue non-empty
│ > queued entry 1                              │
│ > queued entry 2                              │   ← silvery <TextArea>, multi-line
│ > queued entry 3                              │      always live, always editable
├───────────────────────────────────────────────┤   ← divider
│ > _current input                              │   ← silvery <TextArea>, multi-line
└───────────────────────────────────────────────┘      always live, always editable
```

One TextArea for the queue. One TextArea for the command input. BOTH always live. No "focused mode." No "hold release."

Focus is just "which TextArea the cursor is in right now" — driven by natural cursor movement.

### Focus model

- Single state: `focusedRegion: "queue" | "command"` (App.tsx)
- Each `<TextArea>` gets `isActive={focusedRegion === ...}`
- Default: `"command"` on startup
- Whichever region has focus renders text `$fg`; other region renders `$fg-muted`. Same per-region rule we just shipped — but now it's the ONLY focus signal.

### Cursor boundary handoff

The load-bearing novelty. When the cursor is at the TOP of the command TextArea and the user presses Up, focus moves to the queue TextArea with the cursor at the end of the last line. Symmetrically: cursor at BOTTOM of queue + Down → command TextArea, cursor at start.

This requires silvery TextArea to signal boundary hits. Proposed silvery API (new `km-silvery.textarea-edge-callback` sub-bead):

```tsx
<TextArea
  value={...}
  onChange={...}
  onEdge={(edge: "top" | "bottom" | "left" | "right") => boolean}
  // Fires when arrow key is pressed AT the boundary (before silvery clamps).
  // Return `true` to consume the key (silvery won't clamp). Return `false`
  // or don't set the callback → silvery does normal clamp-to-boundary.
/>
```

App.tsx wiring:

```tsx
// Command TextArea
<TextArea
  ...
  isActive={focusedRegion === "command"}
  onEdge={(edge) => {
    if (edge === "top" && queueText.length > 0) {
      setFocusedRegion("queue")
      setQueueCursorToEnd()  // via ref or controlled prop
      return true  // consume
    }
    return false
  }}
/>

// Queue TextArea
<TextArea
  ...
  isActive={focusedRegion === "queue"}
  onEdge={(edge) => {
    if (edge === "bottom") {
      setFocusedRegion("command")
      setCommandCursorToStart()
      return true
    }
    return false
  }}
/>
```

No silvercode-side `useInput` boundary detection, no per-key intercept. Silvery owns the textarea; silvercode consumes the edge event.

### Send semantics

- **Enter in command**: send/enqueue current command buffer. If Claude idle → send immediately. If Claude busy → append to queue buffer. Clear command TextArea.
- **Enter in queue**: force-flush the entire queue (existing `controller.flushQueue(id)` — bypasses idle gate). Claude CLI buffers stdin during mid-turn, so this lands as the next turn's input safely.
- **Shift+Enter in either**: native silvery TextArea behavior — newline within the current buffer.
- **Backspace at start of a queue line where previous line is empty**: silvery TextArea native — merges lines. User sees two entries collapsing into one.

### Buffer representation

Queue buffer stored by controller as **entries joined by `\n\n`** (the wire format — each `\n\n` becomes a paragraph break when sent to Claude).

But the queue TextArea displays the buffer with entries joined by **single `\n`** (no blank rows). On every `onChange`:

- controller buffer ← TextArea value with `\n` → `\n\n` expansion on send
- OR store controller buffer in single-`\n` form and expand at send-time

Pick single-`\n` for display consistency. Send-time serializer re-expands.

### State deletions

Delete these from App.tsx + controller:

- `queueFocused` state (replaced by `focusedRegion`)
- `holdQueue` / `isHeld` state machinery (queue is always "held" while cursor is in it; flush only fires on explicit Enter-in-queue or turn-end)
- The Esc / Ctrl+Enter release keybindings (no release concept)
- The up-arrow-with-inputValue-empty conditional (no conditional entry; Up at top of command always handles the boundary)
- `QueueEditor` component (its logic moves into the two-TextArea pair directly in CommandBox)

Keep:

- `controller.flushQueue(id)` for force-flush on Enter-in-queue
- turn-end subscribe handler auto-flushing queue buffer
- `setQueuedText` for controller ↔ queue TextArea binding

### Empty queue state

When queue is empty:

- Queue TextArea doesn't render at all. No divider.
- Up-arrow in command input at top of buffer → no-op (clamp at top)
- When user types during mid-turn and submits, the first Enter goes straight to Claude; if Claude is mid-turn, silvercode enqueues the text and the queue TextArea appears above the command.

### Visual chrome

- `>` prompt prefix: rendered as a gutter inside each TextArea (not a separate Box column alongside). Requires silvery TextArea to accept a `prefix` prop per-line OR we pre-pend in buffer (but then Backspace would eat the `>`). Cleanest: silvery adds a `linePrefix` prop. Fallback: render `>` column externally, side-by-side with TextArea, aligning row-for-row.
- Divider with inline QUEUE label between the two regions: `<Divider title={focusedRegion === "queue" ? "QUEUE HELD" : "QUEUE"} />` — title changes color to `$warning` when focus is in the queue. Keep the divider — user explicitly wants it; it signals the queue/command distinction + makes the Enter-semantic-split discoverable. Matches the look of the current shipped version.

### Scrolling

Queue TextArea caps at 12 rows (silvery's `rows` / `maxRows` props). When content exceeds cap, scrolls internally. Cursor stays visible via silvery's built-in scroll tracking.

## Why this is better than what we shipped

Every fix from today's session (per-entry TextInputs, boundary-check Down, per-region coloring, force-flush, shift+enter intercept, up-arrow-at-top entry, Ctrl+P/N aliases, all-white-while-editing) simplifies to:

- Two TextAreas + boundary callback + one focus state
- Per-region coloring drops out for free (isActive drives it)
- Keybindings are silvery's native (no reimplementation)
- useCursor race goes away (only ONE active TextArea at a time — silvery's per-instance effect is the right level)
- Focus transitions are one state change, no useEffect chain

## Why this is better than Option A

Option A (one TextArea, cursor-aware line rendering): requires silvery to support per-line style callbacks (bigger silvery API change). Visual is clever but the "why did Enter send when I was editing line 2?" confusion is real.

Option B's visual separation between queue and command makes the semantics self-documenting: Enter in command = "send this"; Enter in queue = "flush everything".

## Dependency

- **km-silvery.textarea-edge-callback** (P1, new): add `onEdge` callback to silvery TextArea. Without it, silvercode has to intercept Up/Down in its own useInput and read cursor position via a ref — fragile and re-implements what silvery already tracks.

## Acceptance

- Both TextAreas always live. No `queueFocused` / `holdQueue` state in App.tsx or controller.
- Up at top of command → cursor jumps to end of last queue line (focus swap)
- Down at bottom of queue → cursor jumps to start of first command line
- Enter in command sends; Enter in queue force-flushes
- Per-region white/dim coloring driven solely by `focusedRegion`
- Queue empty → queue region + divider don't render
- Silvery TextArea `onEdge` callback landed + tested + used
- All existing queue-batching / force-flush tests still pass
- Visual regression scenarios (via the visual test system) cover: focus swap, entry editing, boundary cursor position, flush on Enter-in-queue, empty-queue Up-arrow no-op

## Out of scope

- Multi-column queue display
- Queue search / filter
- Per-entry cancel (✕) button — can come later; for now, Backspace-at-line-start merges entries (native TextArea)
- Silvery TextArea `linePrefix` prop — we'll do the gutter-Box workaround for v1; silvery API can come after
