---
id: "@km/infra/guardrails"
aliases:
  - km-infra.guardrails
  - km-infra-guardrails
created_by: claude:cc081a9a
created_at: 2026-04-27T06:18:13Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.guardrails
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-26T23:18:17Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] [epic] Infra guardrails — CI + pre-commit checks @km/infra #feature #P2

blocks:: [[@km/infra]]

Preventative tooling that catches whole classes of bug before they ship: CI pipelines, pre-commit hooks, lint scripts, fuzz harnesses, and integrity checks. The point is that these guardrails fire on every change, not as one-off audits.

Scope: continuous-fuzz wiring, submodule integrity checks (CI + pre-commit), lint scripts for upstream-waiting markers, and test-default settings that prevent flake. Each child should result in a check that runs automatically (CI workflow, pre-commit hook, or default config) — not a manual procedure.

Origin: @km/all/plateau-90 R1 split (2026-04-27). Source review pro/Kimi at /tmp/llm-cc081a9a-review-this-plan-critically-q8wi.txt — "5 fuzz failures in this sweep means fuzz is what's working; stop fuzzing → regress". This epic makes that fuzz-and-friends regime continuous.