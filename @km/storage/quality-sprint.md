---
id: "@km/storage/quality-sprint"
aliases:
  - km-storage.quality-sprint
  - km-storage-quality-sprint
created_by: Bjørn Stabell
created_at: 2026-04-16T01:27:35Z
closed_at: 2026-04-16T01:50:32Z
close_reason: "All three tasks completed and merged:
  normalizeNodeName/normalizeRefHref (4caab6f5b), rebuild-titles fix
  (4f8dc38fe), column-order-persist (ab086b508..e3d92db2d). 6502 tests pass. 70
  new tests added across the sprint."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.quality-sprint
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-15T18:27:35Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Storage data-model quality sprint — normalizeRefHref + column-persist + rebuild-titles @km/storage #task #P2

blocks:: [[@km/storage]]

Tracking bead for three parallel tasks launched 2026-04-15. (1) normalizeRefHref() + tests — first coding step of link-model-canonical, also fixes link-resolution-ambiguity by normalizing both write paths. (2) column-order-persist — persist column reorder across state.db rebuild. (3) rebuild-different-titles — fix divergent title derivation between runtime and WAL rebuild.