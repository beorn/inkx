---
mentions:
  - km
id: "@km/storage/rebuild-different-titles"
aliases:
  - km-storage.rebuild-different-titles
  - km-storage-rebuild-different-titles
created_by: Bjørn Stabell
created_at: 2026-04-06T20:49:03Z
closed_at: 2026-04-16T01:50:23Z
close_reason: Fixed in 4f8dc38fe — non-discoverOnly rebuild path now re-queues
  unparsed stubs for deferred parsing. H1 titles survive state.db rebuild. 4 new
  tests.
owner: bjorn@stabell.org
---

# [x] [bug] Rebuilding state.db from WAL produces different column titles than runtime @km/storage #bug #P2

After deleting state.db and rebuilding from changes.jsonl + filesystem, columns are renamed (e.g., 'Project TODOs' h1 → 'TODO' filename stem). Rebuild path uses different title-derivation than runtime.

