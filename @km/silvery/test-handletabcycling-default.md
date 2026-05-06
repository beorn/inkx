---
mentions:
  - km
id: "@km/silvery/test-handletabcycling-default"
aliases:
  - km-silvery.test-handletabcycling-default
  - km-silvery-test-handletabcycling-default
created_by: claude:cc081a9a
created_at: 2026-04-27T05:46:04Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.test-handletabcycling-default
    depends_on_id: km-infra.guardrails
    type: parent-child
    created_at: 2026-04-26T23:18:26Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra.guardrails
---

# [ ] Default handleTabCycling: false in run() options for tests @km/silvery #task #P4

blocks:: [[@km/infra/guardrails]]

ai-chat tests had to opt out of tab cycling via handleTabCycling: false. Plateau: framework default in test environment so per-spec opt-out is not needed.

Files in scope:

- vendor/silvery/packages/ag-term/src/runtime (run options defaults)
- vendor/silvery/packages/ag-react/src/test (or wherever test harness defaults live)

/complete:

- grep 'handleTabCycling: false' vendor/silvery/tests/ → 0 hits (they inherit the default)
- Production run() callers still get the production default
- Test harness sets the test default

## Quality rubric (hub/quality-rubric.md)

Current level: L0 — per-spec opt-out (handleTabCycling: false sprinkled across ai-chat tests). Boilerplate workaround at every test call site.
Target level: L3 — test harness sets the test default; production callers still get the production default. API/lifecycle structure (one default in the harness factory) makes the per-spec opt-out unnecessary. L4 (impossible by construction) would be over-engineering for a test ergonomic — L3 is right-sized.

