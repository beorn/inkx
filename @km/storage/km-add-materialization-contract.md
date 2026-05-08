---
aliases:
  - km-storage.km-add-materialization-contract
  - km-storage-km-add-materialization-contract
created_at: 2026-05-08T18:46:25.644Z
---

# [x] Document and enforce km.add materialization contract #P1

## Acceptance

- [x] Storage rules do not implicitly materialize backlinks for sigil/path files.
- [x] `km.add` materializes matching item nodes by default, not body blocks.
- [x] `km.default:: true` selects initial placement for generated additions in both `km.add` materialization and the `km add` CLI.
- [x] `km.add:: .` expands to the rule owner's path-form, reducing rename/move fragility for identity-node boards.
- [x] Tests cover no-materialization-without-`km.add`, H1 `km.add`, `km.default`, self alias, and item-only materialization.
- [x] Architecture/model docs state the link/backlink/embed/materialization contract.
- [x] Agent steering docs reference the contract for `@agent/N` slot queues.
