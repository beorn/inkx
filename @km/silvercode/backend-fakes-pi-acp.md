---
id: "@km/silvercode/backend-fakes-pi-acp"
aliases:
  - km-silvercode.backend-fakes-pi-acp
  - km-silvercode-backend-fakes-pi-acp
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-pi-acp
    depends_on_id: km-silvercode.backend-fakes
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.backend-fakes
---

# pi-acp fake backend profile #task #P3

blocks:: [[@km/silvercode/backend-fakes]]

Add a pi-acp profile for the shared fake backend so the registry entry remains covered even when pi-acp is not installed locally.

## Scope

- Model pi-acp initialization, prompt, permissions, config options if present, cancellation, load/resume if advertised, and close.
- Include unsupported-feature scenarios so Silvercode reports clear fallback behavior.

## Acceptance

- Fake pi-acp profile can run the shared backend contract suite.
- Live-mode contract is skipped unless pi-acp is installed, but uses the same assertions when enabled.
