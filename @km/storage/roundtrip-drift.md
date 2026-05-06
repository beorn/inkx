---
mentions:
  - km
id: "@km/storage/roundtrip-drift"
aliases:
  - km-storage.roundtrip-drift
  - km-storage-roundtrip-drift
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:38Z
closed_at: 2026-04-03T02:31:08Z
close_reason: Formatting-only edits skip rewrite, update baseline hash only. 2 tests.
owner: bjorn@stabell.org
---

# [x] Handle formatting-only external edits without rewrite @km/storage #task #P2

From Pro review: Even if semantic diffs are correct, parse/serialize may not round-trip exact bytes. If external edit changes formatting only, we should: (1) detect no semantic DB change, (2) update baseline hash to external bytes, (3) NOT rewrite back to disk.

Currently: formatting-only edits may trigger unnecessary DB updates and file rewrites.

