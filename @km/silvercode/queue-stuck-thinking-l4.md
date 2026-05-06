---
mentions:
  - km
id: "@km/silvercode/queue-stuck-thinking-l4"
aliases:
  - km-silvercode.queue-stuck-thinking-l4
  - km-silvercode-queue-stuck-thinking-l4
created_by: claude:2405c72e
created_at: 2026-04-28T21:19:41Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.queue-stuck-thinking-l4
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T14:19:44Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] L4 architectural reframe — Turn owner module + derived status getter @km/silvercode #task #P0

blocks:: [[@km/silvercode]]

Architectural follow-up to the L1 narrow runtime guard shipped in commit 32d71e571 (apps/silvercode/packages/agent-harness/src/session-reducer.ts case "status").

The L1 fix gates the case "status" reducer arm to only honour "requesting" when status is already running. That stops the queue-wedge symptom but the underlying design issue remains: status is a STORED field that any reducer arm can mutate, with no single owner of the turn lifecycle.

The L4 redesign (per opencode-validated pattern in /Users/beorn/Code/opencode/packages/opencode/src/session/{status,run-state}.ts):

1. Compress 6 states (spawning|idle|thinking|tool-running|awaiting-permission|ended) → 4 (spawning|idle|busy|ended). Move thinking/tool-running/awaiting-permission into a Busy payload: { kind: "thinking" | "tool" | "permission"; turnId; since }.
2. Introduce a Turn owner module (mirrors opencode's Runner). All status mutations route through it. case "status" reducer arm can only annotate the active turn — no active turn → log + drop.
3. status becomes a derived getter on the public projection, not a stored field. publicView(internal) returns { ...internal, status: deriveStatus(internal) }. Eliminates the entire class of "two writers disagree about status."

This is the L1 → L4 jump per hub/quality-rubric.md: runtime guard → architecturally impossible.

opencode reference (3 states only — idle | busy | retry): Runner abstraction owns work, lifecycle hooks (onIdle, onBusy) drive status. No state-machine library — tagged union + ownership discipline + derived getter is the whole pattern.

Bead @km/tui/tea has the same architectural target for @km/tui's own state machines. Coordinate scope: do they unify, or are silvercode and @km/tui separate machines that share the Turn-owner pattern?

## Recurrence log → unparked 2026-04-28 23:20

Originally parked 2026-04-28 21:19 ("focus on cleanup, not new architectural work"). Four hours later, recurrence #5 of the same class hit (Burnishing 61s+, MCP children sleeping, queue held — `claude-acp-1777439414160-1` synthetic-id session). The shape of each recurrence is different (different reducer arm flips status), but the class is identical. As long as `next.status` has 10 writers across 10 reducer arms, the bug-class survives every L1 patch.

Confirmed via /big reframing: the fix that makes this impossible is the L4 reframe in this bead. Patches keep deferring it; deferral keeps producing recurrences. Unparking.

## Phase plan

- **Phase A** — silvercode:status debug logger + dev-mode invariant assert. Tracked in [[@km/silvercode/session-store-trace]] (bumped P2 → P0). Ship first; provides evidence for B–D. ≤2 hours.
- **Phase B** — Turn-owner module (mirrors opencode `Runner`). All status-affecting transitions route through it. Reducer arms call `turn.start({turnId, kind})` / `turn.end({turnId})` instead of mutating `next.status` directly. Additive; reducer-side `next.status = X` lines stay (compatibility). ~1 day.
- **Phase C** — `deriveStatus(internal)` getter on the public projection. `controller.tryFlush` gates on `Turn.canAccept()` instead of `status === "idle"`. Delete the 10 stored `next.status` writes from session-reducer.ts (lines 335, 344, 482, 529, 615, 626, 702, 706, 716, 724). Delete the L1 guard at line 716 (no longer needed). ~1 day.
- **Phase D** — Property/fuzz tests on the reducer (any event sequence → consistent derived status). Delete stale workarounds (queue-focus-flush-guard's special case may collapse). Close this bead + the L1 bead `@km/silvercode/queue-stuck-thinking`. ~half day.

## Related beads

- [[@km/silvercode/queue-stuck-thinking]] — L1 fix (commit `32d71e571`). Closes when Phase D ships.
- [[@km/silvercode/session-store-trace]] — Phase A.
- [[@km/silvercode/claude-acp-init-timeout-no-fallback]] — orthogonal: synthetic-id phantom session at boot. Worth fixing alongside since it produces wedged sessions outside the L4 path.
- [[@km/tui/tea]] — same Turn-owner pattern target for the @km/tui state machines. Coordinate when Phase B ships so we extract a shared module rather than two parallel implementations.

## Implementation Notes

2026-05-05:

- Phase A is implemented via `setStatus()`, `statusTrace`, owner invariants, and liveness obligations in the agent-harness reducer.
- Added `deriveStatus()` and changed `publicView()` so callers observe status derived from lifecycle ownership: pending permissions, open tools, active turns, and terminal session state.
- This makes the controller queue gate read a derived public status through `store.state.get().status`; stale internal cached status strings no longer make public state appear busy.
- `turn-end` now closes tool liveness obligations owned by that turn, so late tool results cannot keep the public session stuck in `tool-running`.
- Codex transcript replay now ends an open replay turn before starting another overlapping `task_started`, preventing historical resumed sessions from leaking active-turn liveness.
- Dense activity summary expansion is bounded with existing `BoundedScroll`, preventing large expanded turn details from pushing the transcript out of the viewport.
- Verification: queue/status targeted run passed 43 tests; broader targeted run passed 142 tests with 1 skipped; root `npx tsc --noEmit --pretty false` passed.

