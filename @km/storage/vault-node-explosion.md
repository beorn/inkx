---
mentions:
  - km
  - Bjørn
id: "@km/storage/vault-node-explosion"
aliases:
  - km-storage.vault-node-explosion
  - km-storage-vault-node-explosion
created_by: Bjørn Stabell
created_at: 2026-04-18T18:14:20Z
closed_at: 2026-04-21T06:25:09Z
close_reason: >-
  Shipped: folder-level collapse-parse rule.


  Files matching `collapseParse.patterns` in `.km/config.yaml` become opaque

  mdfile/txtfile stubs (title + content, no descendant parse) on discovery

  and reconciliation. Collapsed stubs stay out of the background-parse

  queue and out of the stale-stub re-queue path. Users promote them on

  demand via the existing `parseStubFile` flow (triggered automatically

  when `km view <path>` targets a `_stub: true` node).


  Real-vault measurement (~/Bear/Vault, fresh memory-mode load):
    before (no collapse-parse):     540,496 nodes
    after  (raw/chats + archive):    65,682 nodes
    reduction:                         87.8%

  Matches the 89% predicted in hub/km/vault-diagnostic-2026-04-21.md.


  Commits on main:
    efd9db4bc  test(km-storage): collapse-parse glob matcher
    e2f3eee33  feat(km-storage): collapse-parse rule — opaque mdfile stubs
    8402edba5  test(km-storage): verification scripts for collapse-parse
    79113a45a  docs(hub/km): update vault-diagnostic — post-collapse numbers
    3af8e1aed  feat(km-storage): promote collapsed nodes on navigate-in
    b0a7aa59b  fix(km-storage): type annotation in collapse-parse promotion test

  Tests added:
    packages/km-storage/tests/collapse-parse.test.ts            (8 matcher tests)
    packages/km-storage/tests/collapse-parse-discovery.test.ts  (7 end-to-end tests)

  Verification tooling (kept in scripts/ for future re-runs):
    scripts/verify-collapse-parse.ts              (synthetic fixture)
    scripts/measure-collapse-parse-real-vault.ts  (memory-mode load)

  Backward compat: behavior unchanged when `collapseParse.patterns` is

  omitted or empty. No schema migration. Storage/parser pipeline untouched.


  Typecheck: 0 errors (non-vendor).

  Tests:     1888 storage+markdown pass, 2339 km-tui pass.


  Opt-in config example:
    collapseParse:
      patterns:
        - "raw/chats/**"
        - "archive/**"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-storage.vault-node-explosion
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-18T11:14:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [x] Investigate 549K nodes in vault — likely needs different strategy @km/storage #task #P1 @Bjørn Stabell

blocks:: [[@km/storage]]

Vault has 549,427 nodes across 18,192 files — ~30 nodes per file on average. This is likely too granular: every heading, list item, paragraph, task bullet counts as a node. Need to decide whether km should (a) still parse everything into nodes but materialize lazily, (b) reduce what becomes a node (e.g., only headings + tasks, not every block), (c) introduce a node-count budget with on-demand expansion, or (d) something else. Blocks perf work on @km/tui/board-mount-n-traversal — fixing the traversal is a band-aid if the underlying node count is a modeling problem.

