---
id: "@km/storage/roundtrip-fuzz"
aliases:
  - km-storage.roundtrip-fuzz
  - km-storage-roundtrip-fuzz
created_by: claude:9b6678d0
created_at: 2026-02-11T23:31:42Z
closed_at: 2026-02-11T23:41:26Z
---

# [x] Content round-trip fuzz: DB→serialize→write→reparse→verify @km/storage #task #P2 @claude:9b6678d0

Add content-level round-trip fuzz tests for the full sync cycle: mutate DB → serialize to markdown → re-parse → verify DB is consistent. Catches silent data loss and node ID instability. Gaps: (1) no content verification in chaos fuzz, (2) no write-then-read-back round-trip, (3) no node ID stability testing, (4) no concurrent write+watch fuzz.