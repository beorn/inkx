---
id: "@km/tui/tab-disappear"
aliases:
  - km-tui.tab-disappear
  - km-tui-tab-disappear
created_by: Bjørn Stabell
created_at: 2026-03-31T23:53:01Z
closed_at: 2026-04-01T02:47:25Z
close_reason: "Stale useMemo in Card component: repo.getChildren cached with
  stable deps, never invalidated after reparent. Fix:
  useSyncExternalStore(repo.subscribe, repo.getSnapshot) + repoVersion in deps.
  Same fix in DetailView.tsx. 5 new visibility regression tests."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Tab indent on subsection makes node disappear from view @km/tui #bug #P0 @Bjørn Stabell

## Bug
Tab indent on a subsection makes it disappear from the board view. Cursor stays on the hidden node (appears missing). Node is NOT deleted — quit and reopen shows it fine.

## Root Cause
Card component in CardColumn.tsx had a stale useMemo for children:
```
const rawChildren = useMemo(() => repo.getChildren(card.id), [repo, card.id])
```
The deps [repo, card.id] never change — repo is the same object reference, card.id is stable. After indent reparents a node under this card, useMemo returns cached (empty) children.

This stale childCount=0 was passed to TreeNode via childCount prop, overriding TreeNode's own fresh children. hasChildren became false, and children were not rendered — even though TreeNode's internal rawChildren had the correct data (evidenced by the subtask badge 0/1 showing correctly).

## Fix
Added useSyncExternalStore(repo.subscribe, repo.getSnapshot) to Card component and included repoVersion in the useMemo deps. This ensures children derivation stays fresh after structural edits.

## Tests
5 new visibility tests added to indent-outdent.slow.test.ts covering:
- Indented node remains visible after Tab
- Indented node visible with no prior children
- All siblings visible after indent
- Cursor visible after indent
- Sequential indent keeps all nodes visible