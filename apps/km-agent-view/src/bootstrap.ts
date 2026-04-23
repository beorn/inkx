#!/usr/bin/env bun
/**
 * km-agent-view bootstrap — thin entry so the bin can be an executable .ts file.
 *
 * Mirrors apps/km-logview/src/bootstrap.ts. Silence loggily output that would
 * otherwise leak through the alt-screen UI (notably silvery's "keypress over
 * budget" perf warnings). Set BEFORE importing anything that creates a loggily
 * logger at module init. Users re-enable with: LOG_LEVEL=warn bun km-agent-view
 */

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

const { main } = await import("./index.tsx")
await main()
