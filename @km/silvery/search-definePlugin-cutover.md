---
id: "@km/silvery/search-definePlugin-cutover"
aliases:
  - km-silvery.search-definePlugin-cutover
  - km-silvery-search-definePlugin-cutover
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:18:01Z
closed_at: 2026-04-21T19:06:17Z
close_reason: Killed with parent km-silvery.definePlugin. Re-cutover pattern
  will follow pipe() + with*() + createSlice from aichat prototype.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.search-definePlugin-cutover
    depends_on_id: km-silvery.authoring-elegance
    type: parent-child
    created_at: 2026-04-21T02:18:08Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] SearchDialog v2 — re-cutover against definePlugin at ≤80 LOC @km/silvery #feature #P2

blocks:: [[@km/silvery/authoring-elegance]]

HelpOverlay v2 landed at 33 LOC via definePlugin (gate: ≤50 LOC). SearchDialog is the hard case — text input + focus scope + multi-slice close. Target: plugin body ≤35 LOC (same as HelpOverlay v2) + dialog-chrome ≤45 LOC = ≤80 LOC total. Gate: if total exceeds 80, diagnose which dialog-chrome primitive silvery is missing and file it. Cycle 2 elegance review (2026-05-21) measures this.