---
mentions:
  - km
  - claude
id: "@km/infra/refactor-1-dotz-simplify"
aliases:
  - km-infra.refactor-1-dotz-simplify
  - km-infra-refactor-1-dotz-simplify
created_at: 2026-01-28T23:05:16Z
closed_at: 2026-01-28T23:05:23Z
assignee: claude:18380d7e
---

# [x] Simplify DotzReporter to hybrid stdout/renderString approach @km/infra #task #P3 @claude:18380d7e

## Summary

Refactored DotzReporter from fullscreen React app to simpler hybrid approach:

### Changes

- **Live dots**: Direct stdout writes (no React during test execution)
- **Summary**: Uses `renderString()` for React-rendered output at end
- **Removed**: Fullscreen mode, keyboard controls, interactive grouping
- **Added**: Proper TERM=dumb and CI environment detection

### Why

- Fullscreen mode conflicted with vitest's own stdout output
- Inline mode cursor positioning caused garbled output
- Simpler approach is more reliable and maintainable

### Files Modified

- infra/vitest-dotz/index.tsx - simplified reporter implementation
- CLAUDE.md - documented that vendor/ packages are part of km

### Testing

- `bun run test:fast2` - TTY mode with live dots
- `TERM=dumb bun run test:fast2` - static summary only
- Both modes produce clean, readable output

