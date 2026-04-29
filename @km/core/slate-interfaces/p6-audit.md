---
id: "@km/core/slate-interfaces/p6-audit"
aliases:
  - km-core.slate-interfaces.p6-audit
  - km-core-slate-interfaces-p6-audit
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:34:00Z
closed_at: 2026-03-28T07:39:11Z
close_reason: "KILLED: DRY audit folded into each phase's /complete. 'Phase N
  will handle cleanup' NEVER HAPPENS (refactoring.md Case Study 5). Each phase
  audits its own blast radius."
---

# [x] Phase 6: Codebase-wide DRY audit — migrate all code to use new interfaces @km/core #task #P3

## Goal
Systematic review of EVERY file in apps/ and packages/ to find code that should use the new domain interfaces. Migrate manual patterns to interface calls. Fix or bead any other issues found along the way.

## Scope
Review every .ts/.tsx file in:
- apps/@km/tui/src/ (~150 files)
- apps/@km/_orphan/cli/src/ (~30 files)
- packages/km-*/src/ (~60 files)

## What to look for
1. **Manual parent lookups** → NodeQuery.parent(tree, id)
2. **Manual getChildren + index math** → Position helpers or TreeOps
3. **Manual sibling iteration** → NodeQuery.siblings(tree, id) or TreeOps.shiftUp/Down
4. **Raw repo.moveNode with sort order computation** → TreeOps.moveTo(tree, id, pos)
5. **getSelectedCards patterns** → Selection.nodes(ctx) (if P4 done)
6. **Standalone isItem/isOutline calls** → Optionally migrate to KNode.isItem() (low priority)
7. **Any other code smells** discovered during review → fix inline or create beads

## Process
Use /max with parallel agents — one per directory. Each agent:
1. Reads every file in its directory
2. Identifies patterns that should use interfaces
3. Migrates simple cases inline
4. Creates beads for complex cases
5. Reports findings

## /complete
- Every file in apps/@km/tui/src/ reviewed
- Every file in packages/km-*/src/ reviewed  
- Manual patterns migrated where straightforward
- Beads created for complex cases
- All tests pass