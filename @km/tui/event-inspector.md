---
id: "@km/tui/event-inspector"
aliases:
  - km-tui.event-inspector
  - km-tui-event-inspector
created_by: Bjørn Stabell
created_at: 2026-04-01T06:13:00Z
---

# [ ] Live event inspector panel — shows sync pipeline events in real-time @km/tui #feature #P2

Live TUI panel showing all sync pipeline events: DB mutations, FS writes, watcher events, reconciliation ops. Each event shows: timestamp, type, target, data summary, pipeline step status (DB/FS/skipped). Helps diagnose sync issues in real-time without reading debug logs. Could extend the existing console panel (backtick key) or be a separate panel (e.g., Ctrl+E). Also useful for demos and development.