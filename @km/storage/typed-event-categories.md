---
mentions:
  - km
id: "@km/storage/typed-event-categories"
aliases:
  - km-storage.typed-event-categories
  - km-storage-typed-event-categories
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:23Z
closed_at: 2026-04-22T06:05:13Z
close_reason: "No concrete driver. Pure architectural taxonomy (structural vs
  update vs read-only events) with no user-visible pain, no referenced design
  doc, and no blocker it unblocks. Per round-4 pro review: P3 speculation.
  Reopen if event-routing pain point forces the distinction."
owner: bjorn@stabell.org
---

# [x] Typed event categories — structural vs update vs read-only @km/storage #task #P3

From /big quality review: All events are treated uniformly in a flat switch. Task events only update metadata, session events are read-only, but the code path is the same.

FIX: Discriminated union categories:

- StructuralEvent = node_created | node_deleted | node_moved
- UpdateEvent = node_updated | task_claimed | task_completed
- ReadOnlyEvent = session_* | message | conflict_created

Handlers dispatch by category, not individual type. Eliminates switch duplication in db-events.ts + event-handlers.ts.

