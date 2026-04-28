#!/usr/bin/env bun
/**
 * silvercode bootstrap — thin entry so the bin can be an executable .ts file.
 *
 * Imports ./debug-log.ts as a side-effect: configures loggily's writer to
 * route to DEBUG_LOG (when set) and suppresses console output so stray
 * debug() calls can't leak into the alt-screen UI. Same pattern km-cli
 * uses.
 *
 * LOG_LEVEL defaults to `error` so loggily info/debug doesn't emit at
 * all when DEBUG_LOG isn't set (no console capture to worry about).
 */

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

// Must run before any debug() call fires.
import "./debug-log.ts"

// Hard-exit safety nets for SIGINT (Ctrl+C) and SIGTERM (timeout / kill / IDE
// terminate). Registered at the earliest possible point — before silvery
// loads, before any React tree mounts. silvery doesn't removeAllListeners,
// so these fire alongside its own handlers. 500 ms gives silvery + the
// App-level handler (in App.tsx) time to drain gracefully; if cleanup is
// slow, this force-exits. unref() so it doesn't hold the event loop open
// during normal quit.
//
// CAVEAT: this only protects against "soft hang during cleanup" (event
// loop is alive but cleanup awaits something). It does NOT protect
// against a wedged JS loop — `setTimeout` callbacks can't fire while
// JS is in a tight `while(true)` or runaway sync work, and the same
// is true for the signal handler itself. For that case, the parent
// MUST escalate to SIGKILL (e.g. `timeout --kill-after=2 8 ...`, or
// `kill -9 $!` after the SIGTERM grace period). Bead:
// km-silvercode.signal-hang-investigate.
let sigSeen = 0
function installFastExit(signal: "SIGINT" | "SIGTERM", code: number): void {
  process.on(signal, () => {
    sigSeen++
    const delay = sigSeen === 1 ? 500 : 0
    const t = setTimeout(() => {
      process.exit(code) // lint-ok: signal deadline
    }, delay) as unknown as { unref?: () => void }
    t.unref?.()
  })
}
installFastExit("SIGINT", 130)
installFastExit("SIGTERM", 143)

const { main } = await import("./index.tsx")
await main()
