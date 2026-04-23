#!/usr/bin/env bun
/**
 * km-logview bootstrap — thin entry so the bin can be an executable .ts file.
 */

// Silence loggily output that would otherwise leak through the alt-screen UI
// (notably silvery's "keypress over budget" perf warnings). Set BEFORE importing
// anything that creates a loggily logger at module init. Users can re-enable
// with: LOG_LEVEL=warn bun km-logview ...
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "error"

// Force truecolor unless the user has opted out. Silvery auto-detects colour
// support but some terminal / SSH / multiplexer / pipe combinations leave it
// at "mono" (zero color codes emitted) — which was the real cause of
// "nothing is colorized" reports. NO_COLOR still wins (higher priority).
if (!process.env.FORCE_COLOR && !process.env.NO_COLOR) {
  process.env.FORCE_COLOR = "3"
}

// Optional: KM_LOGVIEW_DEBUG=1 writes /tmp/km-logview-env.txt with env + tty
// capability snapshot, for diagnosing "nothing is colorized" reports.
if (process.env.KM_LOGVIEW_DEBUG) {
  const fs = await import("node:fs")
  const out = process.stdout as NodeJS.WriteStream & { hasColors?: (n?: number) => boolean }
  fs.writeFileSync(
    "/tmp/km-logview-env.txt",
    JSON.stringify(
      {
        TERM: process.env.TERM,
        COLORTERM: process.env.COLORTERM,
        FORCE_COLOR: process.env.FORCE_COLOR,
        NO_COLOR: process.env.NO_COLOR,
        isTTY: out.isTTY,
        hasColors_default: out.hasColors?.(),
        hasColors_256: out.hasColors?.(256),
        hasColors_16M: out.hasColors?.(16_777_216),
      },
      null,
      2,
    ),
  )
}

const { main } = await import("./index.tsx")
await main()
