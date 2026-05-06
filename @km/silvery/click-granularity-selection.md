---
mentions:
  - km
  - claude
id: "@km/silvery/click-granularity-selection"
aliases:
  - km-silvery.click-granularity-selection
  - km-silvery-click-granularity-selection
created_by: claude:2405c72e
created_at: 2026-04-26T05:33:31Z
closed_at: 2026-04-26T06:38:29Z
close_reason: "Shipped: 6c1f464b + bb60d163 + 3655890f (silvery). 13 tests
  across checkClickCount + dblclick word + tripleclick line + drag granularity +
  lifecycle. Session: km-session.0425-evening"
started_at: 2026-04-26T05:33:37Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.click-granularity-selection
    depends_on_id: km-silvery.architectural-plateau
    type: parent-child
    created_at: 2026-04-25T22:33:36Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.architectural-plateau
---

# [x] Double/triple click → word/line text selection @km/silvery #feature #P2 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]]

Wire double-click and triple-click into silvery's selection granularity. Foundation in place: SelectionGranularity, findWordBoundary, findLineBoundary, dblclick events. Missing: triple-click detection (only doubleClick exists in mouse-events.ts), auto-select-word-on-double-click and auto-select-line-on-triple-click defaults, integration with terminalSelectionUpdate. Affected: vendor/silvery/packages/ag-term/src/mouse-events.ts (add tripleClick state + check), and a default selection-on-click handler that snaps to word/line boundaries via headless/selection helpers.

