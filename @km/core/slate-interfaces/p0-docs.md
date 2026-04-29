---
id: "@km/core/slate-interfaces/p0-docs"
aliases:
  - km-core.slate-interfaces.p0-docs
  - km-core-slate-interfaces-p0-docs
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:29:46Z
closed_at: 2026-03-28T07:39:03Z
close_reason: "KILLED: Merged into P1. Docs-before-code violates 'docstrings
  document reality, not plans.' Architecture doc written AS the pattern is
  implemented, not before."
owner: bjorn@stabell.org
---

# [x] Phase 0: Document the target architecture + update /code review layer rules @km/core #task #P2

## Goal
Before any code changes: document the 3-layer architecture, update /code review to enforce it, update docs/.

## Changes
1. **docs/design/architecture-layers.md** (NEW) — Domain / Operations / Application layer rules with import boundaries
2. **.claude/skills/code/review-code.md** — Update Architecture section with 3-layer rules and enforcement checks
3. **docs/README.md** — Update architecture description with new layer model
4. **packages/*/CLAUDE.md** — Each package gets a 'Layer' annotation saying what it is

## Layer Rules (to document + enforce)
- Domain (@km/_orphan/core): pure data + helpers, zero deps. NEVER imports repo.
- Operations (@km/tree): needs repo. Pure functions over domain types.  
- Application (@km/_orphan/commands, @km/_orphan/board, @km/tui): state machines, UI, effects.
- Each layer only imports from layers below.

## /complete
- ls docs/design/architecture-layers.md → exists
- grep 'Domain.*Operations.*Application' docs/design/architecture-layers.md → >0
- grep 'layer' .claude/skills/code/review-code.md → updated
- All package CLAUDE.md files have Layer annotation