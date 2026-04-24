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

// Ctrl+C hard-exit safety net. Registered at the earliest possible point —
// before silvery loads, before any React tree mounts. silvery doesn't
// removeAllListeners('SIGINT'), so this fires alongside its own handler.
// 500 ms gives silvery + the App-level handler (in App.tsx) time to drain
// gracefully; if something's stuck, this force-exits. unref() so it
// doesn't hold the event loop open during normal quit.
let sigintCount = 0
process.on("SIGINT", () => {
  sigintCount++
  const delay = sigintCount === 1 ? 500 : 0
  const t = setTimeout(() => {
    process.exit(130) // lint-ok: SIGINT deadline
  }, delay) as unknown as { unref?: () => void }
  t.unref?.()
})

const { main } = await import("./index.tsx")
await main()
