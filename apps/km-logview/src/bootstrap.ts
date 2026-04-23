#!/usr/bin/env bun
/**
 * km-logview bootstrap — thin entry so the bin can be an executable .ts file.
 */

// Silence loggily output that would otherwise leak through the alt-screen UI
// (notably silvery's "keypress over budget" perf warnings). Set BEFORE importing
// anything that creates a loggily logger at module init. Users can re-enable
// with: LOG_LEVEL=warn bun km-logview ...
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

const { main } = await import("./index.tsx")
await main()
