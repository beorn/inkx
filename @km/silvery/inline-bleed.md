---
mentions:
  - km
  - claude
id: "@km/silvery/inline-bleed"
aliases:
  - km-silvery.inline-bleed
  - km-silvery-inline-bleed
created_by: claude:e8fd4b92
created_at: 2026-03-10T21:35:33Z
closed_at: 2026-03-11T08:26:17Z
close_reason: Fixed by removing inline padding approach in output-phase.ts
  (cc8251f). Frozen content no longer bleeds below the active render area -
  cursor state properly tracks frozen line count.
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] Inline mode: old content bleeds below active render area after ScrollbackList advances @km/silvery #bug #P2 @claude:73d7a332

## Summary

In inline mode, when a ScrollbackList freezes items and advances (scrolling old items into terminal scrollback), residual lines from previous renders bleed through below the active render area. Each freeze/advance cycle makes it worse — more stale lines accumulate below the status bar.

## Reproduction

```bash
cd vendor/silvery
bun run examples/interactive/static-scrollback.tsx
# Press Enter 3-4 times to advance through the scripted exchanges
# After 2-3 advances, stale content (box borders, tool output lines) appears BELOW the status bar
```

Or programmatically via testEnv:

```ts
// 1. Create a ScrollbackList with items that freeze
// 2. Render in inline mode
// 3. Freeze items (triggering scrollback emission)
// 4. Verify no content exists below the footer/status bar
```

## What happens

After 3 Enter presses:

- Active content renders correctly (exchanges, prompt, status bar)
- Below the status bar, STALE lines appear from earlier renders:
  ```
  1:00  ⏎ send  tab auto  ^L clear  esc quit  ...  ← correct status bar
  │ trigger a refresh instead of throwing.          │ ← STALE: from Agent exchange #4
  │                                                 │ ← STALE
  ╰─────────────────────────────────────────────────╯ ← STALE: box bottom border
  ```
- Each subsequent advance adds more stale lines

## Expected behavior

No content below the status bar. The output phase should erase all lines below the active content height.

## Root cause hypothesis

In inline mode, `inlineFullRender()` (or the incremental path) writes the current frame starting from `scrollbackOffset`. When the content SHRINKS (because frozen items were emitted to scrollback and removed from the active render), the output phase doesn't erase the lines that the PREVIOUS frame occupied but the CURRENT frame doesn't. Those orphan lines remain visible.

The fix is likely in `packages/term/src/pipeline/output-phase.ts` — after writing the current frame, erase from `currentHeight` down to `previousHeight` (or to end-of-screen).

## Key files

- `packages/term/src/pipeline/output-phase.ts` — `inlineFullRender()` and `createOutputPhase()`
- `packages/term/src/pipeline/content-phase.ts` — height tracking
- `packages/react/src/components/ScrollbackList.tsx` — freeze/emit logic
- `examples/interactive/static-scrollback.tsx` — reproduction demo

## Test approach

Use `@silvery/test` virtual renderer in inline mode:

1. Render a ScrollbackList with 3+ items, each tall enough to exceed terminal height when combined
2. Freeze the first item (triggers scrollback emission)
3. Capture the buffer BELOW the active content area
4. Assert those lines are empty/cleared

Alternatively, capture raw ANSI output and verify erase-to-end sequences are emitted after the content.

