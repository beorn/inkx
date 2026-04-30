---
id: "@km/inbox/hpgq"
aliases:
  - km-hpgq
  - "@km/_orphan/hpgq"
created_at: 2026-01-19T16:15:01Z
closed_at: 2026-01-21T11:49:33Z
---

# [x] Archive legacy Ink engine and views-ink components @km/_orphan #task #P0

## Background
The TUI was migrated from stock `ink` to `inkx`. We are now fully committed to inkx and no longer need the legacy Ink components.

## Current State
- All TUI components use inkx
- Legacy Ink components exist in views-ink/ but are no longer maintained
- Engine abstraction layer exists but is unused

## Action Required
Archive/remove the legacy Ink code.

## Acceptance Criteria (ALL must pass)

- [ ] **No imports from views-ink**: `grep -r 'views-ink' apps/km-tui/` returns only files within views-ink/ itself
- [ ] **No imports from engines/ink**: `grep -r 'engines/ink' apps/km-tui/` returns nothing
- [ ] **Directory removed/archived**: `views-ink/` either deleted or moved to `archive/`
- [ ] **Engine dir cleaned**: `engines/ink/` removed (only `engines/inkx/` remains)
- [ ] **Layout file removed**: `layout/ink.ts` deleted
- [ ] **No --tui=ink flag**: CLI flag removed or produces clear error message
- [ ] **tui.ts simplified**: No engine-switching conditional logic remains
- [ ] **Tests pass**: `bun run test:fast` succeeds
- [ ] **TUI launches**: `bun km view @next.md` works without errors

## Files to Archive/Remove

**Directories:**
- `apps/km-tui/packages/km-ink/src/views-ink/`
- `apps/km-tui/packages/km-ink/src/engines/ink/`

**Files:**
- `apps/km-tui/packages/km-ink/src/layout/ink.ts`

## Files to Modify

- `apps/km-tui/packages/km-ink/src/tui.ts` - remove engine selection
- `apps/km-tui/packages/km-ink/src/views/index.ts` - verify no views-ink imports
- CLI argument handling (if --tui flag exists)