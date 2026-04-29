---
id: "@km/all/fix-sweep-board-features"
aliases:
  - km-all.fix-sweep-board-features
  - km-all-fix-sweep-board-features
created_by: claude:cc081a9a
created_at: 2026-04-26T21:46:31Z
closed_at: 2026-04-26T22:02:51Z
close_reason: Closed
started_at: 2026-04-26T21:47:35Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-board-features
    depends_on_id: km-all.fix-sweep-remaining-slow
    type: parent-child
    created_at: 2026-04-26T14:46:43Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Board features bugs: truncation + search scrolling artifacts @km/all #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-remaining-slow]]

apps/@km/tui/tests/board-features.slow.spec.ts has 2 failures:

## 1. Truncation ellipsis (line 147)
'truncation shows ellipsis for very long titles' — 200-char title shows centerEllipsis (⋯⋯ repeated) but test expects U+2026 (…). 

Possibilities:
(a) silvery Text wrap='truncate-end' regression — used to use … now uses ⋯
(b) Deliberate migration to centerEllipsis (@km/inkx/center-ellipsis bead history) — test predates migration and is wrong
(c) Different code path: truncation logic elsewhere

Verify with code archaeology. If (b), update test AND verify the contract is intentional.

## 2. Search scrolling artifacts (line 567)
'search scrolling renders results without artifacts' — search dialog shows correctly but background list shows 23 'Task NN' matches in screen text when ≤15 expected. Background bleeds through dialog (duplicate rendering / overlay z-order).

Likely silvery overlay rendering bug — modal dialog should clip background.

Investigate:
- silvery ModalDialog / overlay z-order in pipeline
- @km/tui search dialog rendering

Fix at lowest correct layer.