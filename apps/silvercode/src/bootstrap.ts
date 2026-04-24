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

const { main } = await import("./index.tsx")
await main()
