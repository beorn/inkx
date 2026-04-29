---
id: "@km/storage/fts-sigil-tokenchars"
aliases:
  - km-storage.fts-sigil-tokenchars
  - km-storage-fts-sigil-tokenchars
created_by: Bjørn Stabell
created_at: 2026-04-15T04:33:07Z
closed_at: 2026-04-15T04:42:53Z
close_reason: "Landed in 314d9a4fd. FTS5 nodes_fts now indexes
  id/name/title/content with unicode61 tokenchars='@#+[' — sigil queries like
  @next, #urgent, +taxes resolve at the index level. Schema version bumped to 2
  (stored in meta table); migrateSchema returns { ftsDropped } so callers know
  when to rerun SCHEMA + rebuild FTS. toFts5Query quotes sigil-bearing tokens to
  satisfy FTS5 query parser. 13 new tests in
  packages/km-storage/tests/fts-sigil.test.ts covering index columns,
  tokenization, triggers, migration path, idempotency. 1234 km-storage tests +
  2292 km-tui tests green. JS-side findByNameOrTitle fallback in Omnibox
  preserved pending dogfooding verification — removal is a follow-up bead."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-storage.fts-sigil-tokenchars
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-14T21:33:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] FTS5 schema: sigil tokenchars + name/title columns @km/storage #task #P2 @Bjørn Stabell

blocks:: [[@km/storage]]

FTS5 default unicode61 tokenizer strips @#+[ from tokens and nodes_fts doesn't index name/title. Files named @next.md or titled #urgent are unfindable via sigil queries. Fix: add name+title columns to nodes_fts, configure tokenchars '@#+[', update escapeFts5Token to preserve those chars. Migrate existing DBs via schema_version in meta table.