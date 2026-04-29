---
id: "@km/tui/cursor-gate-refactor"
aliases:
  - km-tui.cursor-gate-refactor
  - km-tui-cursor-gate-refactor
created_by: Bjørn Stabell
created_at: 2026-04-15T01:39:36Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.cursor-gate-refactor
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T18:39:36Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.cursor-gate-refactor
    depends_on_id: km-tui.cursor-under-root-crash
    type: blocks
    created_at: 2026-04-14T18:39:45Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Find ghost writer of stale cursor + add write-time validation gate @km/tui #task #P3

blocks:: [[@km/tui]], [[@km/tui/cursor-under-root-crash]]

Follow-up to @km/tui/cursor-under-root-crash (reactive recovery shipped in 791067dd1). The elegant fix is a single setCursor(id) gate that rejects non-descendants at WRITE time, making the class of bug impossible. Prerequisite: identify the ghost writer — the code path that set the cursor to a node under ref/People/Family/Bjorn.md when rootId=projects/+mamamuse. Candidates: (1) sel adapter cross-root leak, (2) PaneSignals pane-to-pane leak, (3) hidden persistence source not yet found, (4) tui.tsx:325-331 initialCursor via filtered createVisibleLens, (5) missing sel.node.select() at a SET_ROOT call site (the reducer comment says cursor is managed at call site — one may be missing). Once identified, decide: fix the specific call site (narrow), or refactor to a single setCursor gate (broad). Deferred until the reactive fix surfaces another incident with a stack trace.