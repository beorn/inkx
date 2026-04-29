---
id: "@km/silvercode/queue-stuck-thinking-l4"
aliases:
  - km-silvercode.queue-stuck-thinking-l4
  - km-silvercode-queue-stuck-thinking-l4
created_by: claude:2405c72e
created_at: 2026-04-28T21:19:41Z
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

Parked from /loop session 2026-04-28 evening at user direction (focus on cleanup, not new architectural work).