---
id: "@km/silvercode/backend-fakes-shared-protocol"
aliases:
  - km-silvercode.backend-fakes-shared-protocol
  - km-silvercode-backend-fakes-shared-protocol
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes-shared-protocol
    depends_on_id: km-silvercode.backend-fakes
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.backend-fakes
---

# Shared fake ACP backend and contract runner #task #P1

blocks:: [[@km/silvercode/backend-fakes]]

Create the shared fake backend core that speaks ACP over stdio and can be configured with backend profiles. This is the low-level fake equivalent of Cloudi's Gmail API mock: the real adapter talks to it through the same boundary it uses for real backends.

## Scope

- Implement a fake ACP server binary/library for tests.
- Support initialize, auth, `newSession`, `loadSession`, prompt, cancel, permission, fs callbacks, session updates, and close.
- Support `session/set_config_option` and return full updated `configOptions`.
- Provide deterministic scenario scripting with a stateful backend store.
- Provide fault injection:
  - malformed JSON
  - stdout pollution before JSON
  - stderr warnings
  - delayed responses
  - rejected config values
  - backend exit mid-turn
- Add a contract runner that can execute each scenario against either fake or live backends.

## Acceptance

- `connectAcpRegistry` can connect to the fake through the same process/stdio path as a real ACP backend.
- The fake backend drives the real `acp-client.ts` adapter, not a mocked `AgentSession`.
- Contract runner has fake mode as default and live mode behind an explicit env flag.
- At least one config-option scenario proves fake and live runners use the same assertions.
