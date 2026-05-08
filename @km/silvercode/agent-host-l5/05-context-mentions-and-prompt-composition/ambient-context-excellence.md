---
mentions:
  - km
id: "@km/silvercode/ambient-context-excellence"
aliases:
  - km-silvercode.ambient-context-excellence
  - km-silvercode-ambient-context-excellence
created_by: claude:4de4a3ab
created_at: 2026-04-27T18:19:18Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.ambient-context-excellence
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T11:19:17Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [/] [epic] Ambient-context pipeline — make it bulletproof, well-tested, and observably correct @km/silvercode #epic #P0

blocks:: [[@km/silvercode]]

Execution tracker for the ambient-context safety pipeline. Design + plan: hub/silvercode/design/ambient-context-safety.md.

Purpose: re-enable tribe + recall ambient injection in the user's daily flow. Auto-delivered to the agent (no user-approval gate — the user has no bandwidth for routing and the product premise is autonomous coordination). Framed via wire-shape + observation-prefix so the agent reads ambient as memory of past activity, not user instruction.

Currently disabled because of the role-prefix-emission failure forensically captured in session e8967322 (2026-04-22).

Pro review 2026-04-27 (DeepSeek R1 + Kimi K2.6 + Gemini 3 Pro) reshaped the plan: added loop-closure layer (Bug B re-ingestion was missed in prior design), added per-adapter wire-byte verification (typed boundary may flatten to plain user-input bytes per backend), demoted notification-first user-queue to discarded, demoted fresh-session discipline to soft hygiene with content-quarantine as the real fix, cut split-test matrix to A vs B on Anthropic.

CHILDREN — file as separate beads as each phase starts:

P0 @km/silvercode/ambient-phase-0-quarantine        — recall-ignore forensic JSONL + violations log; remove literal triggers from docs; delete redundant project-level hook.
  P0 @km/silvercode/ambient-phase-1-thesis-proof      — hardcode Variant A locally; replay S13 against Anthropic; A emission < 1%, B emission > 10%.
  P0 @km/silvercode/ambient-phase-2-adapter-wire      — capture literal HTTP body per backend; verify ambient bytes never in user-input field; fix or disable.
  P0 @km/silvercode/ambient-phase-3-layers            — boundary tests + ambient-sanitize.ts + transcript.ts loop-closure + CI gate.
  P1 @km/silvercode/ambient-phase-4-eval              — S13/S14/S15 on Anthropic; baseline shows A >10× B; roll out to remaining 6 backends.
  P1 @km/silvercode/ambient-phase-5-soak              — re-enable in daily flow, 7-day zero-emission soak.
  P1 @km/silvercode/ambient-phase-6-completion        — real source adapters, per-source circuit breaker, doctor + replay tools.

EPIC ACCEPTANCE — close when:

1. All seven children closed.
2. Tribe + recall re-enabled by default in user's flow, auto-delivered to agent; per-source circuit breaker ships.
3. README's 'multi-agent coordination is safe' claim is empirically backed by Phase 4 results.
4. Design doc updated to reflect post-implementation state (any hypothesis confirmed/ruled out).

KEY DESIGN POINTS (from pro review):

- Bug B (re-ingestion) is load-bearing and was missing — Layer 3 transcript-serializer hardening.
- Adapter wire-bytes verification is a separate phase — typed ACP boundary is fiction if adapters flatten to user-role text.
- Auto-deliver to agent. NOT a user-approval queue. Rejected by user explicitly.
- Anthropic-first eval; the failure is Claude-priors-driven; backend factorial is noise.
- Content quarantine (no literal triggers in repo files indexed by recall) replaces fresh-session as the discovery-hazard fix.

WHY/WHAT vs HOW:

- For the why and what: read hub/silvercode/design/ambient-context-safety.md.
- For the how (per phase): read each child bead.

