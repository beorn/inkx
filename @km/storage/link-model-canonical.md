---
id: "@km/storage/link-model-canonical"
aliases:
  - km-storage.link-model-canonical
  - km-storage-link-model-canonical
created_by: Bjørn Stabell
created_at: 2026-04-07T20:43:30Z
closed_at: 2026-04-17T04:39:50Z
close_reason: >-
  Shipped 2026-04-16. All 7 phases complete.


  Phase 1 (1c36916fa): KLink API skeleton in @km/core (klink.ts, klink-ref.ts,
  klink-resolver.ts, sigils.ts). 80 tests.

  Phase 2 (b2206a773): Parser wiring — every ExtractedLink carries canonical
  href via normalizeLinkHref. 8 tests.

  Phase 3 (6712ff91e + c3d4f091e): Schema flipped 9→3 cols (host_id, href, rel).
  SCHEMA_VERSION 3→4, DATA_VERSION 1→2 (transparent rebuild). Link→KLink. Dead
  code dropped:
  resolveLinks/resolveLinksBatch/updateTargetName/normalizeRefHref/7-variant
  MdForm/removeLinksFromSourceByRelationship/getBacklinksByName.

  Phase 4 (rename sweep): folded into Phase 3 commits — source_id→host_id,
  target_name→href, embedded+relationship→rel across storage+consumers.

  Phase 5 (retire dead code): folded into Phase 3.

  Phase 6 (9813326ba..ca998ec91): Docs mini-MECE — 8 canonical docs aligned with
  KLink model.

  Phase 7: close.


  Verification:

  - sqlite schema: CREATE TABLE links (host_id, href, rel) ✓

  - normalizeLinkHref wired into every writer path ✓

  - 6583 tests pass, 37 skipped, 0 failed

  - tsc clean (14 pre-existing log.span issues unrelated)

  - Active-doc terminology: 0 live source_id/target_name/target_id references;
  remaining 22 are in migration comments + transient EmbedUpdate.target_id for
  embed_of resolution (intentional).

  - km-storage.sigils epic folded in (closed); approach changed from 'strict
  namespaces + config file' to 'sigil-is-part-of-name' after design iteration.


  One deviation: idx_links_embed_one is non-UNIQUE (documented in links.md +
  schema comments) — markdown paragraph coalescing permits multiple embed rows
  per host; embed-one invariant enforced at write time via
  buildEmbedChild/handlers for dedicated embed nodes (embed_of set).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Links v1: ship KLink, 3-column cache, embed/link only @km/storage #task #P2 @Bjørn Stabell

Ship the link storage layer: one KLink type in the AST, a three-column links table as the cache, and 'embed'+'link' as the only rels. Design is canonical in docs/design/links.md. Code rename and schema migration not started.

## What ships

- Rename: Ref → KLink (type), refs → links (table and code paths), normalizeRefHref → normalizeLinkHref (function).
- Schema: links(host_id, href, rel) with idx_links_host_id, idx_links_href, and a partial unique index idx_links_embed_one.
- Runtime materialization: KNode.embed_of is populated from links WHERE rel='embed' at load; no embed_of DB column.
- Name index: case-insensitive lookup keyed on lowercased hierarchical names; self-references (km:#Section) resolve to host.
- Write protocol: DELETE+INSERT inside a transaction per host_id edit.
- TUI terminology: 'symlink' retired — 'embed' everywhere.
- Migration strategy: bump data version, auto-rebuild on first open (no manual .km/state.db delete).

## Blocker

normalizeLinkHref must be wired into every write path — parser, undo/redo replay, programmatic construction — before the schema flip. Pre-flight audit is step one.

## What does not ship

User-defined rels and property-link notation are deferred. rel stays the closed enum 'link' | 'embed' until a second epic widens it.