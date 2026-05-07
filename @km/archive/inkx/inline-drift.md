---
mentions:
  - km
  - claude
id: "@km/inkx/inline-drift"
aliases:
  - km-inkx.inline-drift
  - km-inkx-inline-drift
created_at: 2026-02-04T11:23:52Z
closed_at: 2026-02-04T12:46:52Z
assignee: claude:27f1a547
---

# [x] inkx: inline mode cursor positioning drifts upward during streaming updates @km/inkx #bug #P1 @claude:27f1a547

## Summary

When using inkx's inline render mode (mode: "inline") with streaming updates (useSyncExternalStore + flush()), the rendered output becomes garbled as content height grows. The summary/status line renders progressively higher on screen, overlapping with dots output.

## Reproduction

Run the dotz reporter in streaming mode:

```bash
bun run test:dotz
```

The dots section renders roughly correctly, but the summary line (and package table, slow tests) drift upward with each incremental update, causing garbled overlapping text.

## Root Cause Analysis

In `vendor/beorn-inkx/src/pipeline/output-phase.ts`, the `changesToAnsi()` function for inline mode:

1. Computes `maxY = Math.max(...changes.map(c => c.y))` — the furthest row with changes
2. Moves cursor UP by `maxY` lines: `\x1b[${maxY}A`
3. Then renders changes relative to that position

The assumption is that the cursor is at the bottom of the render region. But when content height increases between frames (new categories/files/dots appear), the cursor position assumption breaks — the cursor-up distance is wrong, causing upward drift.

## Why Tests Don't Catch This

- `dotz-streaming.test.tsx` only checks `chunks.length` increases after flush, not cursor positioning
- `createRenderer` from inkx/testing uses fullscreen buffer rendering, not inline mode
- No existing inkx tests exercise inline mode incremental rendering

## Needed

1. Fix cursor tracking in inline mode to account for height changes between frames
2. Add inline mode tests that verify cursor positioning across frames with growing content
3. Consider a test utility that captures cursor movement sequences and validates final screen state

## Related

- @km/_orphan/silvery-legacy-stale (stale pixel bugs in incremental rendering)
- @km/_orphan/jmxuh (output-phase ANSI diff stale backgrounds)

