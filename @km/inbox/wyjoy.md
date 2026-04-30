---
id: "@km/inbox/wyjoy"
aliases:
  - km-wyjoy
  - "@km/_orphan/wyjoy"
created_by: claude:b92140a2
created_at: 2026-03-17T17:29:15Z
closed_at: 2026-03-17T19:05:08Z
close_reason: All 5 bugs fixed with tests. 1216 tests passing.
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] P2: TUI unresolved paragraph slots after first outline still rendered as columns @km/_orphan #bug #P2 @claude:b92140a2

extractBody puts paragraph slots after the first outline child into indexSections, not indexBody. Unresolved slots in that position become column candidates instead of body fallback. Fix: classify by slot semantics, not extractBody position.