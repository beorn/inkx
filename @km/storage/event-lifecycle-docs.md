---
id: "@km/storage/event-lifecycle-docs"
aliases:
  - km-storage.event-lifecycle-docs
  - km-storage-event-lifecycle-docs
created_by: Bjørn Stabell
created_at: 2026-03-31T21:42:47Z
closed_at: 2026-03-31T21:54:02Z
close_reason: "Written: packages/km-storage/src/watch/README.md — complete
  architecture reference with pipeline diagrams, module map, error handling
  rules, event type table, and known limitations."
---

# [x] Document end-to-end event lifecycle with state diagram @km/storage #task #P2

GPT 5.4 Pro review's #1 recommendation: document the event lifecycle end-to-end with a state diagram showing every path an event can take from creation to filesystem persistence, including error branches. Currently no authoritative reference for the full pipeline. Should include: TUI edit → emit → DB apply → broadcast → fsSync → WriteQueue → .md file, reverse flow (watcher → reconcile → emit), error boundaries, undo interaction.