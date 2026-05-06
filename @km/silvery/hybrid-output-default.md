---
mentions:
  - km
id: "@km/silvery/hybrid-output-default"
aliases:
  - km-silvery.hybrid-output-default
  - km-silvery-hybrid-output-default
created_by: claude:cc081a9a
created_at: 2026-04-27T05:46:02Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.hybrid-output-default
    depends_on_id: km-all.codepath-collapse
    type: parent-child
    created_at: 2026-04-26T23:18:25Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.codepath-collapse
---

# [ ] Make hybrid output the only path — finish phase 3 migration @km/silvery #feature #P2

blocks:: [[@km/all/codepath-collapse]]

Phase 3 shipped SILVERY_HYBRID_OUTPUT=1 with density-based dispatch. The flag still exists, meaning two output paths still exist. Plateau: hybrid is the only path, the flag is removed, the alternative output code is deleted.

Files in scope:

- vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts
- vendor/silvery/packages/ag-term/src/pipeline/output-density.ts
- hub/silvery/design/v05-layout/hybrid-output.md (mark complete)

/complete:

- grep 'SILVERY_HYBRID_OUTPUT' vendor/silvery/ → 0 hits
- grep 'hybrid' vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts → present (because it IS the path)
- The non-hybrid output code path is deleted (not gated)
- Phase 3 design doc marked complete; phase 4+ either filed as new beads or doc updated to current state

## Quality rubric (hub/quality-rubric.md)

Current level: L0 — SILVERY_HYBRID_OUTPUT=1 is an env-var feature flag gating two parallel output paths. Two implementations of the same thing is the canonical "tunable knob" pattern.
Target level: L4 — hybrid is the only path, the flag is removed, the alternative output code is deleted. With one path the wrong-output-mode bug class cannot exist (no flag means no flag-gated misroute can be expressed).

