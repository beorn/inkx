---
id: "@km/silvery/click-granularity-defaultprevented-gate"
aliases:
  - km-silvery.click-granularity-defaultprevented-gate
  - km-silvery-click-granularity-defaultprevented-gate
created_by: claude:2405c72e
created_at: 2026-04-26T05:58:25Z
closed_at: 2026-04-26T06:38:50Z
close_reason: "Shipped: c8a722b4 (silvery). defaultPrevented click skips
  startWord/startLine. 4 tests. Session: km-session.0425-evening"
started_at: 2026-04-26T06:07:28Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.click-granularity-defaultprevented-gate
    depends_on_id: km-silvery.architectural-plateau
    type: parent-child
    created_at: 2026-04-25T22:58:26Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-silvery.click-granularity-defaultprevented-gate
    depends_on_id: km-silvery.click-granularity-selection
    type: blocks
    created_at: 2026-04-25T22:58:27Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Skip word/line auto-select if click handler called preventDefault @km/silvery #bug #P2 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]], [[@km/silvery/click-granularity-selection]]

Stream D wired double-click → word and triple-click → line auto-selection at the runtime mouse-event level, but does not gate on the component tree's defaultPrevented. If an onClick handler downstream eats the click (e.g., click-to-expand/collapse, button toggle), the selection wiring should skip startWord/startLine — the click was claimed by an interactive widget. Foreseen impact: any clickable widget (Link, button, expander, tab) that does not call preventDefault would see selection grab the word/line under the cursor, conflicting with the user's intent. Fix in vendor/silvery/packages/ag-term/src/runtime/create-app.tsx: when dispatching click/dblclick/tripleclick to the component tree, check defaultPrevented before applying startWord/startLine. The plain-click path already passes through ('don't consume — let the component tree handle mousedown'), but the auto-select-on-up doesn't gate on defaultPrevented. Apply same gating to mouseup → click → dblclick/tpl-click chain. Test: render an interactive widget with onClick that preventsDefault; double-click on it; assert no word selection.