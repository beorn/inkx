---
id: "@km/review-arch"
aliases:
  - km-review-arch
  - "@km/_orphan/review-arch"
created_at: 2026-01-23T09:11:13Z
closed_at: 2026-01-23T14:42:21Z
---

# [x] Architecture review: km project @km/review-arch #epic #P2

## Summary

6 critical, 4 high, 8 medium, 5 low

## Critical (blocks correctness)

- [08-cli.md:58](docs/08-cli.md#L58) - Docs say `km task`, code registers `km tasks`
- [08-cli.md:75-94](docs/08-cli.md#L75-L94) - Board shortcuts not implemented (`km @next`, `km @inbox`, etc.)
- [09-commands.md:51-92](docs/09-commands.md#L51-L92) - CommandContext interface mismatch (docs: 25+ fields, code: 10 fields)
- [README.md:50-76](README.md#L50-L76) - Multiple broken command examples

## High (causes bugs)

- [Board.tsx](apps/@km/tui/packages/@km/_orphan/ink/src/views/Board.tsx) - 1210 lines, monolithic component
- [bd.ts](apps/@km/_orphan/cli/src/commands/bd.ts) - 964 lines, mixed concerns
- [board-actions.ts](apps/@km/tui/packages/@km/_orphan/ink/src/board-actions.ts) - 1006 lines
- [db-queries.ts](packages/@km/storage/src/db-queries.ts) - 993 lines, 32 exports

## Medium (tech debt)

- [state.ts](apps/@km/tui/packages/@km/_orphan/ink/src/state.ts) - 959 lines
- [store.ts](packages/@km/storage/src/store.ts) - 924 lines
- [sync.ts](packages/@km/storage/src/watch/sync.ts) - 777 lines
- [parser.ts](packages/@km/markdown/src/parser.ts) - 518 lines
- CalDAV tests over-mocked
- Sync tests use hard-coded timeouts
- TODO comments in production code
- @km/_orphan/agent session tests incomplete

## Low (style/minor)

- Command naming inconsistency (verbs vs nouns)
- Backwards-compat re-exports in board-reducer.ts
- Test name style inconsistency
- Duplicate navigation tests
- Missing edge case tests

## Quick Wins

1. Fix docs/08-cli.md - Change `km task` to `km tasks`
2. Fix README examples - Update broken commands
3. Add `task` alias for `tasks` command

## Larger Refactors

1. Split Board.tsx - Extract keyboard, mouse, paste, dialogs (~5 files)
2. Split bd.ts - bd-cli.ts, bd-format.ts, bd-transform.ts (3 files)
3. Split db-queries.ts - Group by domain (4 files)
4. Implement board shortcuts - Sigil command parsing (2 files)

## Layer Architecture

✅ No layer violations - all fs/path usage justified with comments
