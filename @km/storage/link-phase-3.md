---
id: "@km/storage/link-phase-3"
aliases:
  - km-storage.link-phase-3
  - km-storage-link-phase-3
created_by: Bjørn Stabell
created_at: 2026-04-17T04:08:11Z
closed_at: 2026-04-17T04:38:17Z
close_reason: "Shipped in 6712ff91e + c3d4f091e on main. Schema flipped 9→3 cols
  (host_id, href, rel). Link→KLink. SCHEMA_VERSION 3→4, DATA_VERSION 1→2
  (transparent rebuild).
  resolveLinks/resolveLinksBatch/updateTargetName/removeLinksFromSourceByRelati\
  onship/getBacklinksByName/normalizeRefHref all deleted. 6583 tests passing,
  tsc clean (14 pre-existing log.span issues unrelated). Deviation:
  idx_links_embed_one is regular index, not UNIQUE — markdown paragraph
  coalescing can produce multiple embed rows per host; invariant enforced at
  write time via buildEmbedChild."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.link-phase-3
    depends_on_id: km-storage.link-model-canonical
    type: parent-child
    created_at: 2026-04-16T21:08:24Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 3: storage schema flip — 3-col links table, KLink type, drop dead code @km/storage #task #P2

blocks:: [[@km/storage/link-model-canonical]]

Phase 3 of @km/storage/link-model-canonical. Foundational agent work: flip links table to (host_id, href, rel), rename Link→KLink, rewrite addLink, drop resolveLinks/resolveLinksBatch/updateTargetName, update all writers + consumers, bump DATA_VERSION+SCHEMA_VERSION. Gate: bun fix + bun run test:fast green.