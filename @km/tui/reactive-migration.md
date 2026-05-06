---
mentions:
  - km
  - Bjørn
id: "@km/tui/reactive-migration"
aliases:
  - km-tui.reactive-migration
  - km-tui-reactive-migration
created_by: Bjørn Stabell
created_at: 2026-04-03T07:52:41Z
closed_at: 2026-04-03T08:13:41Z
close_reason: All 4 useSyncExternalStore(repo.subscribe) calls migrated to Store signals
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Migrate all TUI components from old reactive pattern to Store/withReactive signals @km/tui #task #P2 @Bjørn Stabell

Migrate every component from useSyncExternalStore(repo.subscribe, repo.getSnapshot) to useNodeSignal/useChildIdsSignal from the new Store/withReactive layer.

Current state:

- StoreProvider + withReactive(createStoreFromRepo(repo)) wired in tui.tsx (commit 469b8a2c)
- useSignal, useNodeSignal, useChildIdsSignal hooks available
- Components still use the old broad-subscription pattern

Migration scope:

1. Find all useSyncExternalStore(repo.subscribe, ...) calls in @km/tui
2. Replace with appropriate signal hook (useNodeSignal for single node, useChildIdsSignal for children)
3. Remove old subscription patterns
4. Verify no behavioral changes (same rendering, just finer-grained re-renders)

Old Way (broad — entire board re-renders on any mutation):
  const repoVersion = useSyncExternalStore(repo.subscribe, repo.getSnapshot)

New Way (fine-grained — only affected nodes re-render):
  const store = useStore()
  const nodeState = useNodeSignal(store, nodeId)

Done when: zero useSyncExternalStore(repo.subscribe, ...) calls remain in apps/@km/tui/src/

