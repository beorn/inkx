---
id: "@km/silvercode/backend-fakes-gemini"
aliases:
  - km-silvercode.backend-fakes-gemini
  - km-silvercode-backend-fakes-gemini
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-gemini
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

# [/] Gemini fake backend profile #task #P2

blocks:: [[@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-fakes]]

Add a Gemini ACP profile for the shared fake backend.

## Scope

- Model Gemini ACP init and session lifecycle.
- Include the known stdout-pollution/trust-workspace warning scenario.
- Model Gemini model/config options that Silvercode can display.
- Cover prompt round-trip, tool updates, permissions, cancel, resume, and close.

## Acceptance

- Fake Gemini profile catches stdout pollution before JSON without using the real Gemini CLI.
- Live-mode contract can compare the fake profile against an installed Gemini CLI in ACP mode.

blocks:: [[@km/silvercode/backend-fakes]]

