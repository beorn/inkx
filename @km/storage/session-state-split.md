---
mentions:
  - km
  - claude
id: "@km/storage/session-state-split"
aliases:
  - km-storage.session-state-split
  - km-storage-session-state-split
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:05:02Z
closed_at: 2026-04-22T06:50:32Z
close_reason: "Complete: packages/km-storage/src/session/session-db.ts with
  factory openSessionDb({ home?, dbPath? }), 5 session tables keyed by RepoId
  (cursor/recent/collapsed/pane_layout/undo), KM_SESSION_DB env override, WAL,
  migration helper for legacy .km/state.db session state. 11 tests passing.
  Consumer wires once at app startup."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.session-state-split
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T15:30:39Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.session-state-split
    depends_on_id: km-storage.stable-ids
    type: blocks
    created_at: 2026-04-21T12:05:03Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-storage
      - type: link
        target: km-storage.stable-ids
---

# [x] Split session state from content state — three durability tiers @km/storage #task #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]], [[@km/storage/stable-ids]]

Separate content, session, and ephemeral state into distinct stores with distinct durability contracts.

## Why

Pro review + cloudi deep-dive both flagged that session state is currently treated as 'acceptable scope debt' under Family A. It should be first-class with its own store.

## Three tiers

| Tier                    | Example                                         | Store                       |
| ----------------------- | ----------------------------------------------- | --------------------------- |
| Content (per repo)      | Nodes, bodies, links                            | RepoStore + MarkdownAdapter |
| Session (per workspace) | Workspace layout, undo history, recently-opened | ~/.km/session.db            |
| Ephemeral (memory)      | Cursor position, hover, transient focus         | In-memory only              |

## Benefits

- Undo becomes durable across sessions
- Workspace layout persists across restart
- Session state doesn't pollute content repo's DB
- Clear data lifecycle contracts

## Depends on

- @km/storage/three-seam-boundary (session DB is separate from RepoStore)
- @km/storage/stable-ids (session state refs documents by DocId, not path)

See hub/km/source-of-truth-rfc-v2.md §2.3 + §4.4

