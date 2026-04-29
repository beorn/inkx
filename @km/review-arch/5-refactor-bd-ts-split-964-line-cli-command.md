---
id: "@km/review-arch/5-refactor-bd-ts-split-964-line-cli-command"
aliases:
  - km-review-arch.5
  - km-review-arch-5
  - "@km/review-arch/5"
created_at: 2026-01-23T09:11:45Z
closed_at: 2026-01-23T09:31:52Z
---

# [x] Refactor bd.ts: split 964-line CLI command @km/review-arch #task #P3

## @km/review-arch/5-refactor-bd-ts-split-964-line-cli-command: Refactor bd.ts

**Scope:** Split 964 lines into 5 files

### New Structure
```
apps/km-cli/src/commands/
├── bd.ts              # Main commands (400 lines)
├── bd-format.ts       # Pure formatting (120 lines)
├── bd-query-helpers.ts # Query resolution (100 lines)
├── bd-config.ts       # Config subcommand (150 lines)
└── bd-migrate.ts      # Migration/export (180 lines)
```

### Pure Functions to Extract (bd-format.ts)
- `bdStatus(status)` → string mapping
- `formatDate(ts)` → date formatting
- `issueToBdJson(issue)` → JSON conversion
- `formatIssueList(issues)` → list output
- `formatIssueDetails(issue)` → detail output

### Migration Steps
1. Extract bd-format.ts (pure functions)
2. Extract bd-query-helpers.ts
3. Extract bd-config.ts (config subcommand)
4. Extract bd-migrate.ts (migrate/export)
5. Update bd.ts imports