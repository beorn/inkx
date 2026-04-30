---
id: "@km/inbox/8rkws"
aliases:
  - km-8rkws
  - "@km/_orphan/8rkws"
created_at: 2026-01-31T18:44:44Z
closed_at: 2026-02-03T17:34:18Z
---

# [x] Batch refactor: add API pattern migration support for createTestRenderer removal @km/_orphan #task #P2

## Context

The inkx API migration requires renaming deprecated test APIs across the codebase.

## Completed: createTestRenderer → createRenderer (2026-02-03)

✅ Renamed `createTestRenderer` to `createRenderer` across ~57 test files + 14 docs
✅ Renamed `columns:` to `cols:` in renderer creation options
✅ All tests pass (2339 tests, 116 files)
✅ Committed: inkx 0c93b99, km cbd735b9

## Remaining: lastFrame/stdin.write migration

From analysis:
- ~350 uses of lastFrame() across ~20 inkx test files
- ~50 uses of frames[] 
- ~10 uses of lastBuffer()
- ~5 uses of stdin.write() in km test helpers
- ~5 uses of app.html in km (→ app.ansi)

### Pattern Changes Needed

\`\`\`typescript
// OLD PATTERN
const { lastFrame, stdin } = render(<App />)
expect(stripAnsi(lastFrame())).toContain('Hello')
stdin.write('\x1b[A')  // up arrow

// NEW PATTERN  
const app = render(<App />)
expect(app.text).toContain('Hello')
await app.press('ArrowUp')
\`\`\`

### API Naming (finalized in @km/_orphan/deprecations)

| Old | New | Notes |
|-----|-----|-------|
| lastFrame() | app.ansi | ~350 usages in inkx tests |
| stripAnsi(lastFrame()) | app.text | Already ~180 usages in km |
| lastBuffer() | app.term.buffer | ~10 usages |
| lastFrameText() | app.text | Few usages |
| app.html | app.ansi | 5 usages in km |
| stdin.write(key) | await app.press(keyName) | 5 usages in km helpers |

## Definition of Done
- [x] createTestRenderer → createRenderer migrated
- [x] columns → cols in renderer options migrated
- [ ] lastFrame() → app.ansi migrated
- [ ] stripAnsi(lastFrame()) → app.text migrated  
- [ ] stdin.write → app.press migrated
- [ ] app.html → app.ansi migrated
- [ ] frames[] removed
- [ ] All tests pass

## Related
- Parent: @km/_orphan/deprecations
- Sibling: inkx-mig (broader runtime migration)
- Feature: inkx-unified-api