---
mentions:
  - km
id: "@km/silvery/exit-kitty-leak"
aliases:
  - km-silvery.exit-kitty-leak
  - km-silvery-exit-kitty-leak
created_by: Bjørn Stabell
created_at: 2026-04-03T19:26:49Z
closed_at: 2026-04-03T19:55:34Z
close_reason: "Fixed: async exit drain. exit() sends early disable via
  writeSync, defers cleanup to pump finally block which awaits 15ms for kernel
  buffer flush, then drains stdin. Signal handlers use sync best-effort. Correct
  I/O quiesce pattern, not a hack."
owner: bjorn@stabell.org
---

# [x] [bug] Kitty keyboard release event leaks to shell after exit (3;1:3u) @km/silvery #bug #P1

Kitty keyboard release events leak to shell after exit (e.g., "3;1:3u"). This must be solved at the silvery framework level — app developers should never have to think about it.

## The problem

Kitty REPORT_EVENTS sends press + release. When the exit key is pressed:

1. Terminal queues both press and release to kernel TTY buffer
2. App processes press → triggers cleanup → sends disableKittyKeyboard
3. stdin.read() drains Node buffer — but release is still in kernel buffer
4. Raw mode disabled → shell takes over stdin
5. Release arrives → shell echoes as "3;1:3u"

## Why this matters

Every silvery app (not just km) will have this problem. It's a framework bug, not an app bug. Silvery's exit path must guarantee clean terminal state — that's a core promise of a TUI framework.

## Constraint

REPORT_EVENTS is needed for modifier key tracking (Cmd+hover on links via useModifierKeys). Can't just drop it.

## The right fix (not a hack)

The cleanup function is currently synchronous (called from signal handlers). The proper fix is to make the exit path async where possible:

### For normal exit (return "exit" from useInput):

1. The `dispatchKeyToHandlers` return at create-app.tsx:2377 is in an async context (the event loop pump).
2. Instead of calling sync `cleanup()` → `exit()`, do:
   a. Immediately send disableKittyKeyboard + disableMouse (stop new events)
   b. Remove stdin data listener (stop processing)
   c. await a 10-20ms setTimeout (let event loop tick, receive late bytes)
   d. Drain stdin.read() (now has the release event)
   e. Send remaining cleanup sequences + disable raw mode
3. This is NOT a hack — it's giving the I/O system time to deliver queued bytes before we hand back to the shell.

### For signal exit (SIGINT, SIGTERM):

Keep the sync path as best-effort. Signal handlers can't await. The sync drain catches most cases; the rare Kitty leak on Ctrl+C is acceptable.

### For crash exit (uncaught exception):

Same as signal — sync best-effort.

## Implementation

- Split cleanup() into cleanupAsync() (normal exit) and cleanupSync() (signals/crash)
- The async path awaits a short drain period
- The sync path does best-effort immediate drain
- Test: press q in aichat demo, verify no garbled text after exit
- Test: Ctrl+C, verify clean exit (best-effort)

## Done when

- Normal exit from any silvery app: zero garbled text, guaranteed
- Signal exit: best-effort, acceptable rare leak
- App developers don't need to know or care about this

