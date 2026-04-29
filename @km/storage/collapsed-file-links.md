---
id: "@km/storage/collapsed-file-links"
aliases:
  - km-storage.collapsed-file-links
  - km-storage-collapsed-file-links
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:37:00Z
closed_at: 2026-04-21T07:00:55Z
close_reason: >-
  Shipped: link-edge extraction for collapsed files (C3 on the
  vault-node-explosion stream).


  Files matched by `collapseParse.patterns` now run a lightweight regex

  pass over their raw content to extract outgoing link edges into a new

  `collapsed_file_links` table. Backlink queries UNION over the parsed

  `links` table AND the collapsed-file edges, so targets see backlinks

  from collapsed sources without those sources being fully parsed.


  Real-vault measurement (~/Bear/Vault, memory-mode load with collapse-parse):
    nodes:                        65,685
    parsed links:                  4,048
    collapsed_file_links:         42,135  ← previously invisible
    collapsed files contributing:    248
    UNION backlink query:        0.133 ms

  Commits on main:
    e51de6383  test(km-storage): extractLinks regex coverage
    3801dea67  feat(km-storage): collapsed_file_links schema + discovery wiring
    f945dbf37  feat(km-storage): backlink query unions over collapsed-file edges
    92f3518cd  test(km-storage): real-vault measurement script
    8eb05d2d2  docs(hub/km): vault-diagnostic — C3 measurements

  Tests added:
    packages/km-storage/tests/extract-links.test.ts         (32 cases: wiki/md/mentions/tags, adversarial inputs, perf guardrail <50ms/100KB)
    packages/km-storage/tests/collapsed-file-links.test.ts  (9 integration cases: discovery, UNION, invalidation, cascade, backward compat)

  Invariants:

  - `collapsed_file_links` is additive; no changes to existing tables.

  - When `collapseParse.patterns` is empty (default), no extraction runs
    and the table stays empty — full backward compat.
  - Promotion via `parseStubFile` deletes the host's rows so the parsed
    `links` table becomes the sole edge source.
  - `deleteSubtree` cascades cleanup to `collapsed_file_links`.

  - Mentions (`@Name`) and tags (`#tag`) are opt-in; default off because
    chat transcripts are noisy.

  Known limitations (out of scope; future work):

  - `parseStubFile` runs the full parser but does NOT populate the
    `links` table. After promotion, a file's parsed edges stay invisible
    to backlink queries until the next full-load resolves them. The
    collapsed-file edges are correctly cleared (no stale rows). Fixing
    this is a separate bead — it's a pre-existing gap in the promotion
    pipeline, not a C3 regression.

  Typecheck: 0 errors (non-vendor, non-hub).

  Tests:     1985 pass (km-storage + km-markdown), 2339 pass (km-tui) — no
  regressions.


  C2 (vault-node-explosion) cut 89% of nodes; C3 recovers the outgoing

  links those collapsed files would otherwise hide from the backlink

  graph. Together they close the storage direction on the plateau arc.
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.collapsed-file-links
    depends_on_id: km-all.plateau
    type: parent-child
    created_at: 2026-04-20T23:37:19Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Link-edge extraction for collapsed files @km/storage #feature #P1 @claude:8b5b9e1c

blocks:: [[@km/all/plateau]]
