---
id: "@km/silvery/structural-hardening"
aliases:
  - km-silvery.structural-hardening
  - km-silvery-structural-hardening
created_by: claude:cc081a9a
created_at: 2026-04-27T06:17:45Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.structural-hardening
    depends_on_id: km-all.plateau-90
    type: parent-child
    created_at: 2026-04-27T11:00:53Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] [epic] Silvery structural hardening — invariants over guards @km/silvery #feature #P1

blocks:: [[@km/all/plateau-90]]

Architectural hardening of silvery: replace runtime guards / phantom types / retry constants with structural invariants that make invalid states unrepresentable.

Scope: lifecycle/resource ownership (Scope tokens, opaque branded handles, owner-registry assertions); render-phase ordering (render-plan-commit or double-buffer architecture so wrong-order paint/clear cannot be expressed); bounded layout convergence (replace MAX_SINGLE_PASS_ITERATIONS with attributed feedback-edge bounds + instrumentation that attributes pass causes to nodes/edges).

Origin: @km/all/plateau-90 R1 split (2026-04-27). Source review pro/Kimi at /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt — both models converged on "invariants over guards" as the architectural seam. Children recast per C1/C2/C3 in plateau-90 description: scope-resource-ownership, render-plan-commit, renderer-feedback-trace, bounded-convergence.

Acceptance: each child reaches L3+ on the plateau-90 quality rubric (API/lifecycle structure makes invalid state hard) or L4 (impossible by construction) with old workaround code deleted.