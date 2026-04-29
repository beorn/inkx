---
id: "@km/storage/persist-before-apply"
aliases:
  - km-storage.persist-before-apply
  - km-storage-persist-before-apply
created_by: Bjørn Stabell
created_at: 2026-03-31T21:42:51Z
closed_at: 2026-03-31T23:00:23Z
close_reason: "Reversed order in emitter.emit(): DB apply first (step 1),
  events.jsonl persist second (step 2). Crash between steps loses journal entry
  but DB is correct — strictly safer. README.md updated."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Event persisted to events.jsonl before DB apply — crash leaves ghost events @km/storage #bug #P2 @Bjørn Stabell

The emitter persists to events.jsonl BEFORE applying to DB. A crash between persist and apply leaves an event recorded but never applied. On next startup, the event may replay against stale state. Fix: apply to DB first, persist to events.jsonl second. Or: use a WAL-style two-phase commit.