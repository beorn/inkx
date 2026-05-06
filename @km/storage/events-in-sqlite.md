---
mentions:
  - km
id: "@km/storage/events-in-sqlite"
aliases:
  - km-storage.events-in-sqlite
  - km-storage-events-in-sqlite
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:27Z
owner: bjorn@stabell.org
closeReason: Superseded by @km/storage/events-table-replaces-jsonl which shipped
  via the events-table-plus-projection model in commits dc4d6439e..2b971fb12.
---

# [x] Move events.jsonl into SQLite — transactional with DB apply @km/storage #task #P3

From Pro review: DB apply + events.jsonl append are not atomic. If JSONL append fails after DB success, event journal is incomplete. SQLite is the authority but events.jsonl pretends to be.

FIX: Store events in a SQLite table (transactional with node mutations). Export to JSONL for debugging/export only. Eliminates partial-failure semantics between steps 1 and 2 of emit().

