---
mentions:
  - km
  - claude
id: "@km/all/fix-sweep-inline-edit-indent"
aliases:
  - km-all.fix-sweep-inline-edit-indent
  - km-all-fix-sweep-inline-edit-indent
created_by: claude:cc081a9a
created_at: 2026-04-26T21:46:19Z
closed_at: 2026-04-26T22:01:02Z
started_at: 2026-04-26T21:47:19Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-inline-edit-indent
    depends_on_id: km-all.fix-sweep-remaining-slow
    type: parent-child
    created_at: 2026-04-26T14:46:37Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-remaining-slow
---

# [x] Inline edit indent parity bug — body content edit indent 6 vs display 2 @km/all #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-remaining-slow]]

apps/@km/tui/tests/inline-edit.slow.spec.ts:2238 'edit indentation parity' fails: edit-mode indent (6) != display-mode indent (2), delta 4 > 2.

Real bug. Indent calculation differs between display formatter and edit-mode TextInput initialization.

Investigate:

- apps/@km/tui/src/views/ — display rendering (NodeView, body block)
- apps/@km/tui/src/edit/ — edit mode initialization
- silvery TextInput if applicable

Fix at the lowest correct layer. Add regression test pinning indent parity invariant.

NEVER work around — fix the indent calculation.

