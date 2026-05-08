---
id: "@km/silvercode/backend-fakes-copilot"
aliases:
  - km-silvercode.backend-fakes-copilot
  - km-silvercode-backend-fakes-copilot
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-copilot
    depends_on_id: km-silvercode.backend-fakes
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-\
      fakes"
---

# GitHub Copilot fake backend profile #task #P2

blocks:: [[@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-fakes]]

Add a GitHub Copilot ACP profile for the shared fake backend.

## Scope

- Model Copilot ACP init and auth behavior as exposed by the `copilot` binary.
- Cover prompt round-trip, permission/config surfaces if present, cancellation, resume/load if advertised, and close.
- Make missing or unsupported config surfaces explicit so Silvercode falls back cleanly.

## Acceptance

- Fake Copilot profile supports the same spec runner as other ACP backends.
- Live-mode contract can run when `copilot` is installed and credentials are available.
- Silvercode does not show stale Claude/Codex controls for Copilot when the fake reports no such config.

blocks:: [[@km/silvercode/backend-fakes]]

