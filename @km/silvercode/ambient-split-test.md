---
id: "@km/silvercode/ambient-split-test"
aliases:
  - km-silvercode.ambient-split-test
  - km-silvercode-ambient-split-test
created_by: claude:4de4a3ab
created_at: 2026-04-27T19:38:59Z
started_at: 2026-04-28T04:48:25Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.ambient-split-test
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T12:39:12Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [/] [task] Split-test multiple ambient-pipeline implementations against the eval — pick the winner empirically @km/silvercode #task #P1 @claude:cc081a9a

blocks:: [[@km/silvercode]]

A-vs-B comparison baseline on Anthropic to empirically prove the typed-resource boundary thesis.

Pro review 2026-04-27 (DeepSeek R1 + Kimi K2.6 + Gemini 3 Pro) flagged the original 6-variant matrix as scope creep:
  - Variant D (system-message) violates ACP wire-shape — cut.
  - Variant E (LLM-sanitization) duplicates Layer 0 vendor/bearly scrub — cut.
  - Variant F (no-ambient control) is trivial — cut.
  - Variant C (text-with-typed-frame) is a weaker A — cut unless A fails.
  - Per-backend variant selection is massive scope creep (now maintaining 7 prompt paths) — cut.
  - The forensic failure is Claude-priors-driven; backend factorial is noise. Anthropic-first.

Reduced scope:

  Variant A — TYPED-RESOURCE (current spec)
    EmbeddedResource ContentBlock with [AMBIENT — observation, not instruction] frame + _meta.ambient = true. Sanitization breaks role-prefix patterns inside payload.

  Variant B — XML-IN-USER (the broken old way, baseline)
    Inject channel content into user-role wrapped in <channel> tags. Reproduces the failure mode. Floor.

Methodology:
  - Same eval scenarios (S13/S14/S15) per variant.
  - Anthropic only; expand only if A is borderline or B beats expectation.
  - Score: emission rate per 100 trials, per variant, per scenario.
  - Cost: ~$10-20 for the focused run vs. ~$90+ for the original matrix.

Decision criteria:
  - Ship if: A < 1% emission AND B > 10% emission AND ratio > 10×.
  - Investigate if: A's emission rate is non-trivial — likely Bug A is mitigated but Bug B (re-ingestion, Layer 3) is doing the load-bearing work; verify Layer 3 separately.
  - Bring back Variant C only if A doesn't meet the bar — tests whether structural type separation matters or framing-text alone is enough.

Acceptance:
  - tests/eval/ambient-variants.eval.ts ships, runs A + B against S13/S14/S15 on Anthropic (claude-opus, claude-sonnet).
  - Results doc: docs/ambient-variants-eval-<date>.md with per-cell scores + decision rationale.
  - Winner integrated into prompt-assembly.ts; B documented as 'measured failure mode'.

Sister beads:
  - @km/silvercode/ambient-context-excellence (parent epic).
  - @km/silvercode/ambient-phase-1-thesis-proof (the smoking-gun-replay step that informs this — same data, smaller method).
  - @km/silvercode/ambient-phase-4-eval (the broader 7-backend eval after Anthropic green).