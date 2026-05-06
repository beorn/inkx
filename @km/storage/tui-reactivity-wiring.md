---
mentions:
  - km
  - Bjørn
id: "@km/storage/tui-reactivity-wiring"
aliases:
  - km-storage.tui-reactivity-wiring
  - km-storage-tui-reactivity-wiring
created_by: Bjørn Stabell
created_at: 2026-04-03T07:35:28Z
closed_at: 2026-04-03T07:57:14Z
close_reason: StoreProvider + withReactive(createStoreFromRepo(repo)) wired in
  tui.tsx. Signal hooks exported. Commit 469b8a2c.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Wire Store/withReactive into km TUI — fine-grained signals @km/storage #task #P2 @Bjørn Stabell

Currently @km/tui uses useSyncExternalStore(repo.subscribe, getSnapshot) for broad reactivity. With withReactive + useNodeSignal, we can enable fine-grained per-node signals:

- Store initialization: createStore = withReactive(createStoreFromRepo(repo))
- Hook switch: Components switch from useSyncExternalStore → useNodeSignal(store, id)
- Benefits: Only affected nodes re-render (1 card vs entire 2000-node board on keystroke)

Scope:

1. Modify app startup (createApp/repo.ts) to create store + wrap with withReactive
2. Update all component hooks to use useNodeSignal instead of repo.subscribe
3. Run tests to verify no behavioral changes (just performance improvement)

