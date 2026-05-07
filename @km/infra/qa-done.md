---
mentions:
  - km
  - claude
id: "@km/infra/qa-done"
aliases:
  - km-infra.qa-done
  - km-infra-qa-done
created_by: claude:a5c7f7de
created_at: 2026-02-14T20:45:36Z
closed_at: 2026-02-14T21:04:46Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] QA: mandatory visual verification + full regression before close @km/infra #task #P1 @claude:a5c7f7de

## Problem

Bugs are being closed as "fixed" but visual inspection reveals they're not actually fixed.
Over the last 72h: 57 bugs created, ~45 closed. Several were reopened after user found them still broken:

- @km/tui/collapse-blank: closed then re-observed by visual inspector
- @km/_orphan/axswu: breadcrumb corruption "fixed" 3 times (@km/_orphan/e3rwl closed, @km/_orphan/axswu still open)
- TextArea bugs: closed twice, user says "all problems are still there"

## Root Cause Analysis

### Why bugs get marked "fixed" prematurely

1. **Headless test passes, visual bug remains** — agent writes text-content check, doesn't verify layout/colors/alignment
2. **test:fast used as "done" gate** — excludes slow/fuzz/vendor tests (catches ~60% of regressions)
3. **Visual verification is recommended but not mandatory** — easy to skip under time pressure
4. **No post-close verification step** — once closed, no re-validation
5. **Agents close beads without root cause analysis** — symptom fixed, same bug reappears elsewhere

### Repeat bug clusters (last 72h)

| Category                                                      | Reports | Still Open | Pattern                                           |
| ------------------------------------------------------------- | ------- | ---------- | ------------------------------------------------- |
| Incremental rendering (stale pixels, ghost chars, breadcrumb) | 4       | 2          | inkx doesn't fully repaint on DOM change          |
| Cursor state after operations                                 | 5       | 1          | Cursor becomes stale/invalid after tree mutations |
| Collapse feature cascade                                      | 5       | 1          | New feature = burst of interaction bugs           |
| Undo/redo gaps                                                | 3       | 0          | Structural ops not fully undoable                 |

## Proposed Changes

### P0: Must-have for "definition of done"

1. **Mandatory visual TTY verification for ALL TUI bugs/features** — launch interactive TTY, execute repro steps, take screenshot, compare before/after. Close reason must include "Visual: ✓"
2. **Mandatory test:all before close** — not test:fast. If test:all has pre-existing failures, document them. New failures = revert fix.
3. **Mandatory root cause in close reason** — structured format:

```
Fixed: [what changed]
Root cause: [why it happened]
Detection gap: [why tests missed it]
Prevention: [bead ID or n/a]
```

### P1: High-value improvements

4. **withDiagnostics mandatory for TUI fixes** — checkIncremental, checkReplay, checkStability must all pass
5. **Prevention bead required for non-trivial bugs** — creates structural fix for the bug class
6. **Fuzz regression check before commit** — add `bun test:fuzz` to session completion
7. **Explorer→Fixer handoff includes screenshots** — fixer must re-verify visually, not just headless

### P2: Nice-to-have

8. **Close reason template enforcement** — bd hook that validates close reason format
9. **Post-merge re-verification for P0/P1** — re-run tests after push to catch concurrent conflicts
10. **Detection gap tracking** — aggregate gap categories to identify systemic weaknesses

