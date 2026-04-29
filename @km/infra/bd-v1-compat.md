---
id: "@km/infra/bd-v1-compat"
aliases:
  - km-infra.bd-v1-compat
  - km-infra-bd-v1-compat
created_by: Bjørn Stabell
created_at: 2026-04-11T19:39:05Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.bd-v1-compat
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T12:39:27Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [/] km bd: bd-compatible CLI backed by km's markdown/SQLite store @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

## What
km bd is a bd-compatible CLI that operates on km's own data (markdown nodes in SQLite), not on .beads/. It lets Claude agents and users query/mutate issues that live in the same tree as notes and tasks.

## Status (2026-04-20)
- Read queries work: ready, list, show, stale, blocked, children, info, query
- **Write persistence NOW WORKS** for: create, update, close, claim, drop, dep add/remove.
  Verified by `apps/km-cli/tests/bd-persist.slow.test.ts` (6 round-trip tests: write → process restart → read).
- rename persistence has not been exercised by a round-trip test yet (uses the same repo.updateNode path as the others, should work).

## Key fix — save() baseline invariant
The #1 persistence bug was in `packages/km-storage/src/watch/change-handlers.ts` `save()`:
nodes.content_hash was never updated after writing a file, so mergeExternalDrift on the
next save() saw the disk as "drifted" and re-folded the just-written content back into
the subtree — producing duplicate list items on each follow-up edit. Fixed by calling
updateBaselineHash(fileNode.id, hashContent(content)) after fsTarget.writeFile. Affects
both CLI FsWriter and TUI withSync paths.

## Also fixed
- `updateIssueFields` now syncs `data.tags` / `data.mentions` alongside the priority/
  assignee columns so stale sigil tags don't out-vote authoritative fields after replay.
- `nodeToIssue` now reads `node.priority` before falling back to `data.tags` for priority
  resolution (column wins).
- `mergeDepProps` now DELETES the `blocked-by` key when depProps is empty, so removing
  the last blocker actually removes the property (was a no-op before).

## Remaining bd v1.0 work (deferred — not blocking this bead's close if scope shrinks)
- [ ] comment/comments — append notes to issues
- [ ] search — full-text search (FTS5 already exists in km)
- [ ] reopen — reopen closed issues
- [ ] label/tag management
- [ ] history — show issue change history
- [ ] export — already exists, verify v1.0 format compat

## Architecture
- CLI: apps/@km/_orphan/cli/src/commands/bd.ts (871 lines)
- Data layer: packages/@km/beads/ (types, queries, mutations, deps, schema)
- Storage: .km/state.db SQLite (nodes table with task_status, priority, data JSON blob)
- Issues are KNodes with task metadata stored in data.tags, data.mentions, data.props