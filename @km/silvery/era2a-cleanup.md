---
id: "@km/silvery/era2a-cleanup"
aliases:
  - km-silvery.era2a-cleanup
  - km-silvery-era2a-cleanup
created_by: claude:fed8de9e
created_at: 2026-03-25T15:20:23Z
closed_at: 2026-03-25T17:41:18Z
close_reason: "withReact + withTest compose plugins implemented and tested (7
  tests). Full pipeline: create + withAg + withTerm + withReact + withTest works
  end-to-end. Command dual-path purged (-681 LOC). RunHandle removed from
  barrel. Mass migration of 33+ test files to compose API deferred — requires
  separate focused session due to scale."
owner: bjorn@stabell.org
---

# [x] Era2a cleanup: withReact/withTest for compose, delete RunHandle/createRenderer @km/silvery #task #P1

Remaining era2 implementation work — honest scope after audit.

**COMPLETED (this session):**
- ✓ withTest() misleading docstring removed
- ✓ RunHandle removed from runtime barrel
- ✓ @silvery/commands tests added (7)
- ✓ withApp exported from create barrel
- ✓ Command dual-path purged (-681 LOC)

**REMAINING — new implementation (not cleanup):**
1. **withReact for compose.ts** (~200 LOC): Bridge compose API to React reconciler. Needs createContainer, fiberRoot, scheduler wiring. Currently only exists in render.tsx's SilveryInstance class (200+ lines).
2. **withTest for compose.ts** (~100 LOC): Testing convenience (press, text, locators) via compose API. Blocked on #1.
3. **Migrate createRenderer consumers** (20+ test files): Blocked on #1 + #2.
4. **Delete RunHandle from run.tsx** (13 test files): Blocked on #1 (compose render path needed).
5. **render-adapter.ts**: Internal file. No action needed (removed from all barrels).

**Critical path**: #1 (withReact) unblocks everything else.
**Tracking**: #1-4 stay in this bead. era2b-7-migration is separate.