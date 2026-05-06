---
mentions:
  - km
  - claude
id: "@km/silvery/renderer-feedback-trace"
aliases:
  - km-silvery.renderer-feedback-trace
  - km-silvery-renderer-feedback-trace
created_by: claude:cc081a9a
created_at: 2026-04-27T06:33:10Z
closed_at: 2026-04-27T06:58:41Z
started_at: 2026-04-27T06:33:24Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.renderer-feedback-trace
    depends_on_id: km-silvery.structural-hardening
    type: parent-child
    created_at: 2026-04-26T23:33:24Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.structural-hardening
---

# [x] renderer-feedback-trace — pass-cause instrumentation @km/silvery #feature #P1 @claude:cc081a9a

blocks:: [[@km/silvery/structural-hardening]]

Emit a PassCause category for every render/layout pass beyond pass 1, attributable to nodes/edges. Pass causes counted from test runs / fuzz runs. Categories: text-measurement-feedback, viewport-dependent, scrollto-settle, resize-resettle, layout-invalidate, unknown.

Goal: provide instrumentation data so C3b (renderer-convergence-by-design / bounded-convergence) can attribute the convergence loop's iterations to specific feedback edges.

SILVERY_INSTRUMENT=1 env var prints a per-test-run histogram of pass causes; aggregated by node id / edge name. Default off — no behavioral change.

Outcome (from this work): histogram captured to hub/silvery/design/pass-cause-histogram.md; dominant pass-cause categories identified for C3b's attributed-feedback-edge bounds.

Source: @km/all/plateau-90 R1 split (2026-04-27). Sibling of paint-clear-invariant (C2) and scope-resource-ownership (C1).

