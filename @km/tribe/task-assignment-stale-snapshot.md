---
mentions:
  - km
  - claude
id: "@km/tribe/task-assignment-stale-snapshot"
aliases:
  - km-tribe.task-assignment-stale-snapshot
  - km-tribe-task-assignment-stale-snapshot
created_by: claude:cc081a9a
created_at: 2026-04-28T05:09:31Z
closed_at: 2026-04-28T06:33:03Z
close_reason: >-
  Fixed in @bearly/tribe 0.14.0 (vendor/bearly commit 284266a, branch
  bug/tribe-stale-snapshot).


  ## Resolution path


  The chief's stale snapshot lives inside the LLM session's context — outside
  any code path tribe controls. Instead of trying to fix the chief, the daemon
  now sits at the choke point where messages are delivered and enriches
  assign-typed channel envelopes at delivery time:


  - **bead_state**:
  title/status/priority/notes_excerpt/notes_truncated/updated_at, sourced fresh
  from `.beads/backup/issues.jsonl` on every delivery.

  - **reissue_count**: prior `type=assign` messages with the same sender →
  recipient → bead_id triple.


  Both are purely additive optional fields on the existing v4 wire envelope.
  Pre-0.14 clients ignore them. Receivers see current bead state + 'reissue 1'
  on the second assign for the same triple — closing the A/B/C escalation loop
  in 1 cycle instead of 3.


  ## Test


  `vendor/bearly/tests/tribe-assign-bead-snapshot.test.ts` — 9 cases:


  - 5 `readBeadSnapshot` unit tests (file missing / id missing / latest-wins /
  notes truncation / malformed JSON survival)

  - 4 `withBroadcast` integration tests (assign envelope carries bead_state,
  reissue_count increments, non-assign types unaffected, missing jsonl is
  graceful)


  All 474 bearly tests pass; same 2 pre-existing typecheck errors (in unrelated
  files) — no new errors introduced. `bun fix` clean on touched files.


  ## Files


  - `vendor/bearly/tools/lib/tribe/bead-snapshot.ts` (new) — journal reader

  - `vendor/bearly/tools/lib/tribe/broadcast-coalescer.ts` — extend
  PendingBroadcast

  - `vendor/bearly/tools/lib/tribe/compose/with-broadcast.ts` — wire the
  enrichment

  - `vendor/bearly/tools/lib/tribe/database.ts` — countPriorAssigns statement

  - `vendor/bearly/tools/lib/tribe/socket.ts` — protocol-doc note

  - `vendor/bearly/plugins/tribe/CHANGELOG.md` + `package.json` — 0.14.0

  - `vendor/bearly/tests/tribe-assign-bead-snapshot.test.ts` (new)


  ## What this does NOT fix


  The chief's own behavior — refusing to re-issue when the agent has provided
  evidence — lives inside the LLM's reasoning, not the daemon. Daemon-side
  enrichment makes the right answer obvious to the receiving agent so the loop
  terminates faster, but the LLM-level fix (chief refreshes its own snapshot
  before re-issuing) is still desirable. Tracked separately if/when needed.


  The A/B/C protocol from `feedback-stand-firm-on-pro-review.md` becomes much
  rarer in practice: receivers can decline path C ('execute anyway despite
  evidence') with a short 'bead is closed per the bead_state field — see commit
  X' instead of full A/B/C escalation.
started_at: 2026-04-28T06:17:00Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-tribe.task-assignment-stale-snapshot
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T22:09:42Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] Tribe task_assignment auto-regenerates stale bead snapshots, ignoring agent evidence + bead NOTES re-verification @km/tribe #bug #P2 @claude:cc081a9a

blocks:: [[@km/tribe]]

