---
id: "@km/tui/recents-persist"
aliases:
  - km-tui.recents-persist
  - km-tui-recents-persist
created_by: Bjørn Stabell
created_at: 2026-04-17T15:59:39Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.recents-persist
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-17T08:59:39Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Persist omnibox recents across sessions @km/tui #task #P3

blocks:: [[@km/tui]]

v1 is in-memory (apps/@km/tui/src/state/recents-store.ts). Move to SQLite: (id, timestamp, kind in 'node'|'command'), keep top N=100 per kind, rehydrate on startup.