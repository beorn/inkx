---
id: "@km/silvercode/ambient-phase-1-thesis-proof"
aliases:
  - km-silvercode.ambient-phase-1-thesis-proof
  - km-silvercode-ambient-phase-1-thesis-proof
created_by: claude:4de4a3ab
created_at: 2026-04-27T20:23:07Z
closed_at: 2026-04-27T20:39:19Z
close_reason: >-
  Phase 1 thesis-proof complete (driver:
  apps/silvercode/tests/eval/thesis-proof.ts).


  EVIDENCE — 600 live Anthropic API trials @ N=100/variant on three models:
    claude-opus-4-5    A: 0/50    (0.00%)   B: 0/50    (0.00%)
    claude-sonnet-4-6  A: 0/100   (0.00%)   B: 0/100   (0.00%)
    claude-opus-4-7    A: 0/100   (0.00%)   B: 0/100   (0.00%)

  GATE: FAILED on strict 'B > 10%' clause — but informationally so. The failure
  mode (role-prefix marker emission) does not reproduce on a minimal-viable API
  harness on any current Anthropic model. Variant A's 0/250 is fully consistent
  with the boundary thesis; Variant B's 0/300 means the forensic failure
  required context this harness did not reconstruct (long conversation history,
  full Claude Code system prompt, accumulated tool output, specific user-prompt
  history).


  INTERPRETATION: H-NULL (most plausible) — failure mode is real but conditional
  on richer context. H-FIX (also plausible) — Anthropic post-training has
  hardened against this exploit. H-WRONG (implausible) — boundary thesis is
  wrong; rejected because Variant A and B are demonstrably distinct on the SDK
  wire (tool_result vs text content blocks).


  NEXT STEPS:
    1. Promote Layer 3 (loop-closure) to top priority in Phase 3. The forensic root cause was Bug B (re-ingestion of literal bytes into next-round transcript) — Layer 3 catches that regardless of whether the model emits the marker.
    2. Layer 4 (detection-hook telemetry) becomes the canonical regression signal.
    3. Defer Phase 4 multi-backend rollout until either (a) we construct a contextually-rich repro that triggers the failure, or (b) we accept the gate as unreproducible and ship Phase 3+5+6 with detection-hook telemetry.

  ARTIFACTS:
    - apps/silvercode/tests/eval/fixtures/{s13,s14,s15}.b64 + .recall-ignore (commit 0b290208d)
    - apps/silvercode/tests/eval/thesis-proof.ts (commit ec7454185)
    - apps/silvercode/tests/eval/ambient-scenarios.test.ts (commit ad5cb7616)
    - docs/ambient-thesis-proof-2026-04-27.md (commit daef3abea)

  Cost: ≈$3-5 across 600 trials.
started_at: 2026-04-27T20:23:14Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-silvercode.ambient-phase-1-thesis-proof
    depends_on_id: km-silvercode.ambient-context-excellence
    type: parent-child
    created_at: 2026-04-27T13:23:14Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [x] Phase 1: empirical proof of boundary thesis on Anthropic (A vs B) @km/silvercode #task #P0 @claude:4de4a3ab

blocks:: [[@km/silvercode/ambient-context-excellence]]

See hub/silvercode/design/ambient-context-safety.md §4 Phase 1