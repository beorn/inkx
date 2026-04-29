---
id: "@km/silvercode/cross-agent-replay"
aliases:
  - km-silvercode.cross-agent-replay
  - km-silvercode-cross-agent-replay
created_by: claude:4de4a3ab
created_at: 2026-04-27T18:47:34Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.cross-agent-replay
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T11:47:34Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] [experiment] Cross-agent transcript replay — load Claude session into Codex (and vice versa) via prompt-replay; measure quality degradation @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Experiment: can silvercode take a transcript from agent A and replay it into a fresh agent B session as user/assistant message pairs, achieving 'kind-of-works' continuation?

Hypothesis: text-heavy conversations transit fine across vendors via prompt-replay. Tool calls (different shapes per vendor) are the obvious blocker but may be projectable to text. We've never measured this — the 'cross-agent resume reserved for explicit escape hatch' note in the README is speculation, not a measurement.

Spec:
  - apps/silvercode/src/cross-agent-replay.ts — transcriptToReplay(messages) → ContentBlock[]
    - Project prior turns as synthesized user/assistant text pairs.
    - Tool calls → text summary ('Tool X(args) returned Y').
    - Final block = the original user prompt.

Test (apps/silvercode/tests/cross-agent-replay.slow.test.tsx):
  - 3×3 source × target matrix (claude, codex, gemini), skip same-agent diagonals.
  - Per cell: spawn source, run 3 prompts, capture transcript, replay into target with 'continue where we left off'.
  - Score: 1.0 perfect / 0.5 partial / 0.0 confused. Anything ≥ 0.5 = 'kind-of-works.'

Outputs:
  - docs/cross-agent-replay-eval-<date>.md with empirical scores.
  - If any cell ≥ 0.5: ship /handoff <agent>:<sid> command.
  - If all cells < 0.5: negative-findings doc citing what blocks each pair.
  - README updated to reflect actual measured quality.

Out of scope: true ACP loadSession across agents (impossible — session ids are agent-internal); bidirectional sync.

Pair-bead: @km/silvercode/model-capability (model-switch is a subset).