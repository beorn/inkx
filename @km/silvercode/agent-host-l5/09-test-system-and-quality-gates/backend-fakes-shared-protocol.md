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
    target: "@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-\
      fakes"
---

# [/] Shared fake ACP backend and spec runner #task #P1 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/backend-fakes]]

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
- Add a spec runner that can execute each scenario against either fake or live backends.

## Acceptance

- `connectAcpRegistry` can connect to the fake through the same process/stdio path as a real ACP backend.
- The fake backend drives the real `acp-client.ts` adapter, not a mocked `AgentSession`.
- Spec runner has fake mode as default and live mode behind an explicit env flag.
- At least one config-option scenario proves fake and live runners use the same assertions.

## Implementation Progress

2026-05-06 first vertical slice:

- Added `@km/agent-harness/testing/fake-acp-server`, a shared in-process ACP fake behind the real `connectAcp` spawn seam.
- Added `createFakeCodexAcpSpawn()` with stateful `session/set_config_option` support for the Codex reasoning-effort profile.
- Added `AcpAgentSession.configOptions` and `AcpAgentSession.setSessionConfigOption()` so tests and callers can observe and mutate the ACP config surface.
- Verified `connectAcpRegistry(..., "codex")` can connect to the fake and exercise config options without launching a real backend.

Verification: `fake-acp-server.test.ts` + `acp-client.test.ts` 31/31 pass; `npx tsc --noEmit` passes; targeted `oxlint`/`oxfmt` pass; `git diff --check` passes.

2026-05-06 spec-runner slice:

- Added `@km/agent-harness/testing/backend-spec-runner`.
- Added `apps/silvercode/tests/backend-contracts/config-options.contract.test.ts`.
- Fake targets run by default; `SILVERCODE_BACKEND_CONTRACT=live` appends the live Codex target and reuses the same assertion.

Verification: `backend-spec-runner.test.ts` + `config-options.contract.test.ts` pass.

2026-05-06 ACP registry profile slice:

- Added `createFakeAcpRegistrySpawn()` with basic initialize/prompt profiles for Codex, Gemini, GitHub Copilot CLI, pi-acp, Claude, and Claude Code.
- Kept richer config-option behavior in the Codex-specific profile.

Verification: `fake-acp-server.test.ts` covers all six registered ACP ids.

2026-05-06 prompt-callback slice:

- Added `FakeAcpBackendProfile.onPrompt` scripted prompt hooks.
- Covered real ACP `requestPermission`, `readTextFile`, and `writeTextFile` callbacks through `connectAcp`.

Verification: `fake-acp-server.test.ts` includes permission and filesystem callback scenarios.

2026-05-06 provider/spec slice:

- Replaced the old runner with provider-injected `AgentBackends`, `withChat({ backends })`, and `withAgentBackends({ backends })`.
- Added fake backend providers for every ACP registry id and spec-level prompt/config/comprehensive-session-update tests.
- Added docs in `docs/dev/silvercode-backend-fakes.md` and `docs/dev/test-fakes.md`.

Verification: `apps/silvercode/packages/agent-harness/tests/`, `apps/silvercode/tests/backend-contracts`, and `apps/silvercode/tests/turn-activity-summary.test.tsx` pass.

blocks:: [[@km/silvercode/backend-fakes]]

Verification: `apps/silvercode/packages/agent-harness/tests/`, `apps/silvercode/tests/backend-contracts`, and `apps/silvercode/tests/chat-message-summary.test.tsx` pass.

