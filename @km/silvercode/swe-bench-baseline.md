---
mentions:
  - km
id: "@km/silvercode/swe-bench-baseline"
aliases:
  - km-silvercode.swe-bench-baseline
  - km-silvercode-swe-bench-baseline
created_by: claude:208595de
created_at: 2026-04-24T09:01:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.swe-bench-baseline
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T02:01:33Z
    created_by: claude:208595de
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] Benchmark Silvercode vs vanilla Claude Code on SWE-bench @km/silvercode #task #P3

blocks:: [[@km/silvercode]]

Validate the core product thesis: better tools (km MCP, tribe MCP, future domain MCPs) + better memory (auto-injection pipeline, @km/_orphan/as-memory, canonical event log) should lift Claude's effective SWE-bench resolve rate when wrapped in Silvercode.

## Hypothesis

Vanilla Claude Code on SWE-bench Verified achieves a baseline resolve rate determined purely by the model + Claude Code's default tool surface. Silvercode adds three layers on top of the same model:

1. Structured memory via km MCP — search, get_node, render_path give the agent a persistent knowledge graph
2. Auto-injection pipeline — km active context, bd state, tribe channel digest, peer-session state injected per-turn
3. Multi-agent coordination via tribe MCP — the agent can coordinate with peer sessions on complex multi-step tasks

Prediction: resolve rate lifts by a measurable margin (target >+3pp). Mechanism: better grounding in repo context (km), fewer redundant greps (memory), better long-horizon task persistence (tribe + replay).

Counter-hypothesis: context noise hurts more than it helps; injection dilutes task focus and resolve rate drops. Also possible: neutral (no meaningful delta).

## Methodology

1. Pick a representative SWE-bench Verified subset — 50–100 tasks covering the task-type distribution (bug fixes, refactors, features)
2. Baseline run: vanilla Claude Code CLI on the subset, standard settings, log resolve/fail + reasons
3. Treatment run: same subset through Silvercode with full MCP + auto-injection on, same model, same seed
4. Compare: overall resolve rate, per-task-type breakdown, token cost per task (measure the price of the lift), wall-clock time
5. Ablation: ideally re-run treatment with (a) MCP only no auto-inject, (b) auto-inject only no MCP. Identify which layer contributes the lift.

## When to run

Not now. This bead exists to prevent forgetting. Target: after M3 (auto-injection lands) at the earliest; more meaningful after M10 (full MCP + replay + recall). Costs real money (SWE-bench runs are expensive — thousands of model calls). Don't run speculatively.

## Acceptance criteria

- [ ] SWE-bench subset chosen and documented (which tasks, why)
- [ ] Baseline vanilla-CC run complete, results archived
- [ ] Treatment Silvercode run complete, results archived
- [ ] Comparison report written: overall delta, per-type breakdown, cost analysis, qualitative notes on failure modes
- [ ] Ablation study completed (MCP-only, inject-only)
- [ ] Decision recorded: does the result support the thesis? Double down on MCP/injection, or pivot?

## Related

- Doc: hub/silvery/future/ai-terminal/00-agent-workspace.md (the Validating section; Layer 1 agent-capability benchmarks)
- Parent: @km/silvercode
- Depends on: M3 auto-injection pipeline shipping

## References

- SWE-bench Verified: https://www.swebench.com
- aider's benchmark methodology (reference for how to run responsibly)
- Related benchmarks (post-MVP): Terminal-Bench 2.0, SWE-bench Pro, MAKER (Gas Town used this)

