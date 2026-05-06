---
mentions:
  - km
id: "@km/silvery/vendor-pre-existing-fails"
aliases:
  - km-silvery.vendor-pre-existing-fails
  - km-silvery-vendor-pre-existing-fails
created_by: claude:c6244087
created_at: 2026-04-23T09:08:47Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.vendor-pre-existing-fails
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T02:08:47Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] Triage 27 pre-existing vendor test failures — focus×3, useBoxMetrics×4, use-ag-node×3, others @km/silvery #task #P2

blocks:: [[@km/silvery]]

Surfaced during Plateau Phase 2 (commit af7d8b28). None are caps-related (grep-confirmed by Phase 2 agent). Breakdown from test:vendor run:

- focus×3 (ink/focus compat generated tests)
- useBoxMetrics×4
- use-ag-node×3
- pipeline-bugfixes×2 (measure-fit-transform: fit-content)
- text-frame
- click-to-position
- box-in-text-warning
- bearly llm×5
- bearly recall×2
- termless viterm×4 (matchers)
- termless integration×1
- termless-memleak harness

Many look like real regressions worth fixing, not just flaky or known-broken. Need to triage which are flaky vs real. focus×3 and useBoxMetrics×4 flagged by agent as 'look like real regressions'.

