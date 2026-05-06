---
mentions:
  - km
  - claude
id: "@km/storage/parse-stub-links-gap"
aliases:
  - km-storage.parse-stub-links-gap
  - km-storage-parse-stub-links-gap
created_by: claude:8b5b9e1c
created_at: 2026-04-21T07:02:40Z
closed_at: 2026-04-22T06:43:59Z
close_reason: "Fixed: parseStubFile now walks parser wikilinks, resolves via
  createLinkResolver/resolveWikilink, batch-inserts canonical links rows +
  mirrors embed_of. Fixture in
  packages/km-storage/tests/parse-stub-links-gap.test.ts (2 tests). Adjacent
  collapsed-file-links test updated to assert new contract."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.parse-stub-links-gap
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T00:02:40Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] parseStubFile promotion doesn't populate links table — backlinks stay invisible until next full-load @km/storage #bug #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]]

Pre-existing pipeline gap surfaced (not caused) by C3 in commit 8eb05d2d2. When a collapsed file is promoted via parseStubFile (navigate-in triggers full parse), the parser creates child nodes but does NOT populate the 'links' table. After promotion:\n- collapsed_file_links rows for the file are correctly cleared (no stale data)\n- parsed nodes exist with link metadata in data JSON\n- but backlink queries (which read from 'links' table) can't see the parsed edges\n- edges become visible only after next full-load runs link resolution\n\nUser-visible symptom: open a collapsed file → its links don't appear as backlinks on target files until app restart or re-ingest.\n\nFix: parseStubFile should run the link-resolution pass after creating child nodes, populating the 'links' table in the same transaction as the node insert.\n\nAcceptance:\n1. Promote a collapsed file → target files' backlink queries immediately include the promoted file's edges\n2. No double-counting: promoted edges must not conflict with pre-existing collapsed_file_links rows\n3. Regression test: unit test promotes a file and asserts backlink query returns correct count

