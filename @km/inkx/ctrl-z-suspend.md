---
id: "@km/inkx/ctrl-z-suspend"
aliases:
  - km-inkx.ctrl-z-suspend
  - km-inkx-ctrl-z-suspend
created_by: claude:d1f60fb4
created_at: 2026-02-25T20:25:42Z
closed_at: 2026-02-25T21:40:58Z
---

# [x] Handle Ctrl+Z (SIGTSTP) for process suspend in render() @km/inkx #feature #P2

## Investigation Results

When stdin is in raw mode, Ctrl+Z (\x1a) doesn't generate SIGTSTP. inkx should handle terminal lifecycle events that ALL TUI apps need, with override hooks for app-specific behavior.

### Current State

**inkx handles**: SIGINT/SIGTERM (legacy render() only), SIGWINCH (via stdout resize event), raw mode setup/teardown, alternate screen, cursor visibility, mouse tracking, Kitty keyboard protocol, bracketed paste.

**inkx does NOT handle**: SIGTSTP (Ctrl+Z suspend), SIGCONT (resume), terminal focus in/out, SIGHUP (terminal disconnect), window title save/restore.

**@km/tui workaround** (raw-signals.ts): Intercepts \x1a on stdin, calls restoreTerminal(), sends SIGTSTP to self, re-enters on SIGCONT. BUT it's incomplete — doesn't re-enable Kitty protocol, bracketed paste, or mouse on resume.

### Proposed: Terminal Lifecycle Events for inkx

All should be handled by default with app-level override hooks.

#### 1. SIGTSTP / Ctrl+Z Suspend (P2 — this bead)
- **Default**: Save terminal state → restore normal terminal → SIGTSTP to self
- **On SIGCONT**: Re-enter raw mode → re-enable all protocols → force full redraw
- **Override**: `onSuspend?: () => boolean` (return false to prevent), `onResume?: () => void`
- **Protocols to save/restore**: raw mode, alt screen, cursor vis, mouse, Kitty keyboard, bracketed paste
- Gap: @km/tui's RESUME_SEQUENCES misses Kitty + bracketed paste + mouse re-enable

#### 2. SIGWINCH / Terminal Resize (already handled)
- **Current**: stdout.on("resize") → re-render
- **Enhancement**: Expose `onResize?: (cols: number, rows: number) => void` hook
- Already working, low priority

#### 3. Terminal Focus In/Out (new — P3)
- **Default**: Parse \x1b[I (focus in) and \x1b[O (focus out) if enabled via \x1b[?1004h
- **Override**: `onFocus?: () => void`, `onBlur?: () => void`
- **Use cases**: Dim unfocused pane, pause animations, reduce CPU when backgrounded
- Types already exist in inkx (FocusEvent/BlurEvent) but never generated

#### 4. SIGHUP / Terminal Disconnect (new — P3)
- **Default**: Graceful shutdown (unmount + cleanup), same as SIGTERM
- **Override**: `onDisconnect?: () => void`
- Important for SSH sessions, tmux detach

#### 5. SIGINT / Ctrl+C (partially handled)
- **Current**: Legacy render() unmounts. run()/createApp() don't handle it — @km/tui does.
- **Default**: Should be in inkx: restore terminal → exit(130)
- **Override**: `exitOnCtrlC?: boolean` (already exists as concept), `onInterrupt?: () => boolean`

#### 6. Window Title Save/Restore (new — P4)
- **Default**: Save title on enter (\x1b[22;2t), restore on exit (\x1b[23;2t)
- **Override**: `title?: string` (set custom), `restoreTitle?: boolean`

#### 7. Clipboard Access (new — P4)
- **Default**: OSC 52 read/write support
- **Override**: `onClipboardRead?: () => string`, `onClipboardWrite?: (text: string) => void`

### How Other Frameworks Handle This

**bubbletea (Go)**: Handles SIGTSTP/SIGCONT, SIGWINCH, SIGINT automatically. Exposes WindowSizeMsg, FocusMsg/BlurMsg. Suspend/resume is built into the event loop.

**crossterm/ratatui (Rust)**: Terminal::new() enters raw mode + alt screen. Drop trait restores. Signals handled via separate crate (signal-hook). No built-in suspend — app must handle.

**Textual (Python)**: App.suspend() method with on_suspend/on_resume signals. Full lifecycle hooks. Focus tracking built in.

**ncurses (C)**: The gold standard — endwin() on SIGTSTP, refresh() on SIGCONT. Has been doing this for 30+ years.

### Proposed API

```typescript
interface TerminalLifecycle {
  // Suspend/resume (Ctrl+Z)
  suspendOnCtrlZ?: boolean          // default: true
  onSuspend?: () => boolean | void  // return false to prevent
  onResume?: () => void

  // Exit (Ctrl+C)
  exitOnCtrlC?: boolean             // default: true
  onInterrupt?: () => boolean | void

  // Focus (requires terminal support)
  trackFocus?: boolean              // default: false (must opt in)
  onFocus?: () => void
  onBlur?: () => void

  // Window title
  title?: string
  restoreTitle?: boolean            // default: true
}
```

Pass via run()/createApp() options. The framework saves a snapshot of terminal state on suspend and restores it on resume — apps don't need to know the details.