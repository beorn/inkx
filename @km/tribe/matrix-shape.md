---
id: "@km/tribe/matrix-shape"
aliases:
  - km-tribe.matrix-shape
  - km-tribe-matrix-shape
created_by: claude:87d20187
created_at: 2026-04-27T17:42:37Z
closed_at: 2026-04-27T18:45:32Z
close_reason: "Integrated to main via /max. filter-collapse: bearly merge
  33fa6e1 (5 commits: schema v11 + wire v4 + tool collapse + tests + 0.13.0
  release), km bump a81915bb2. matrix-shape: km 98025468f exercises
  rooms/room_members tables. Both pushed to origin."
started_at: 2026-04-27T18:15:38Z
owner: bjorn@stabell.org
assignee: claude:87d20187
dependencies:
  - issue_id: km-tribe.matrix-shape
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T10:42:36Z
    created_by: claude:87d20187
    metadata: "{}"
---

# [x] Matrix portability — design epic for km+silvercode multi-actor convergence @km/tribe #feature #P3 @claude:87d20187

blocks:: [[@km/tribe]]

# Why

The empty `rooms` + `room_members` tables added in schema migration v10 (@km/tribe/event-classification) are scaffolding for an unscheduled future. Today every session joins the synthetic per-project default room; the tables exist but are unqueried and unused.

Two options for handling this honestly:

1. Park: document as scaffold; tables exist but are inert
2. Use: make at least one current query exercise the schema (e.g., tribe.members reads from room_members)

This bead picks option (2 + actively-tracked design) instead of deletion.

# What this epic tracks

The shape of km + silvercode when multi-actor scenarios materialize:

## Near-term (use today's tables)

- Make `tribe.members` query `room_members` instead of in-memory connected-sessions list. Functional no-op (every session is in the default room) but exercises the schema.
- Add a startup invariant: every active session has a row in room_members for the project's default room.

## Medium-term (multi-room within one daemon)

- Open product question: do silvercode panes share a project's default room, or each pane is its own sub-room? Sub-rooms support per-pane channels separated from the project-wide channel.
- Migration: when a second room is created, the existing default-room logic still works.

## Long-term (federated tribes, cross-project, cross-machine)

- Today: tribe is per-project-root, per-machine. Two worktrees of one repo = two tribes.
- Federated direction: a "team" tribe that bridges per-machine instances. Matrix-shape becomes load-bearing here.
- Out of scope until convergence pulls multi-user scenarios into scope.

# Acceptance (for the near-term step)

- tribe.members query exercises room_members; integration test verifies
- Startup invariant added; failing-invariant test
- README or runbook entry explains 'rooms is real, currently single-default-room'

# Reference

- Schema v10 migration in vendor/bearly/tools/lib/tribe/database.ts
- hub/architecture.md convergence section
- /big retrospective conversation 2026-04-27 (rooms tables: keep + use rather than delete)