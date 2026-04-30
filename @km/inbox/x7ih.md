---
id: "@km/inbox/x7ih"
aliases:
  - km-x7ih
  - "@km/_orphan/x7ih"
created_at: 2026-01-20T13:54:28Z
closed_at: 2026-01-20T14:15:30Z
---

# [x] inkx bug: first row content renders at last row @km/_orphan #bug #P1

## Summary
Content intended for Y=0 (first row) renders at Y=termHeight-1 (last row) in inkx on startup.

## Root Cause
Two bugs in `vendor/beorn-inkx/src/pipeline/output-phase.ts`:

### Bug 1: Bare `\n` instead of `\r\n` in `bufferToAnsi()`
The `bufferToAnsi()` function used `\n` to move between rows, but in terminals `\n` only moves the cursor down - it does NOT reset to column 0. This caused rows to be written at wrong column positions.

**Fix:** Changed `if (y > 0) output += '\n';` to `if (y > 0) output += '\r\n';`

### Bug 2: Incorrect cursor position check in `changesToAnsi()`
The diff-based renderer `changesToAnsi()` starts with `cursorY = -1` (uninitialized). When the first change was at position (0, 0), the condition `y === cursorY + 1 && x === 0` incorrectly matched (0 === -1+1), causing a `\r\n` to be emitted instead of absolute positioning. This moved the first row content down one line.

**Fix:** Added `cursorY >= 0` check: `if (cursorY >= 0 && y === cursorY + 1 && x === 0)`

## Files Changed
- `vendor/beorn-inkx/src/pipeline/output-phase.ts` - Both fixes
- `vendor/beorn-inkx/src/output.ts` - Added clear screen to `enterAlternateScreen()` (belt and suspenders)

## Verification
- All tests pass (`bun run test:all`)
- Confirmed fix in Ghostty terminal