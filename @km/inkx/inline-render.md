---
id: "@km/inkx/inline-render"
aliases:
  - km-inkx.inline-render
  - km-inkx-inline-render
created_by: claude:0087e729
created_at: 2026-02-11T17:32:40Z
closed_at: 2026-02-11T22:50:04Z
owner: bjorn@stabell.org
assignee: claude:2f3fc9d8
---

# [x] Inline mode rendering corruption when switching sections (storybook) @km/inkx #bug #P2 @claude:2f3fc9d8

## Problem

Running `bun storybook` (inline mode) reveals rendering corruption when switching sections with j/k. Content from the previous section bleeds through, the header doesn't fully clear, and visual artifacts appear where new content is shorter than old content.

## Root Cause

inkx inline mode (`mode: 'inline'`) uses relative cursor positioning (`\n` to move down, `\x1b[NA` to move up) and re-renders in place. Two issues:

1. **Buffer height capped at `stdout.rows`** (scheduler.ts:410) — content taller than the terminal is clipped at the buffer level, even though inline mode's output mechanism can handle taller content via newlines
2. **Incomplete clearing** — when switching from a tall section to a short one, leftover lines from the previous render are not erased

## Reproduction

```bash
bun storybook           # inline mode (default)
# Press j/k to switch sections — observe artifacts
bun storybook --fullscreen  # fullscreen mode works correctly
```

## Scope

Two sub-tasks:
1. **Fix inline re-render clearing**: When content shrinks, erase leftover lines below new content
2. **Allow inline buffer taller than terminal**: For content that exceeds stdout.rows, the buffer should grow (or use a virtual viewport)

## Files

- `vendor/beorn-inkx/src/scheduler.ts` — buffer height = stdout.rows
- `vendor/beorn-inkx/src/pipeline/output-phase.ts` — changesToAnsi inline mode, bufferToAnsi
- `vendor/beorn-inkx/src/render.tsx` — RenderOptions, mode handling