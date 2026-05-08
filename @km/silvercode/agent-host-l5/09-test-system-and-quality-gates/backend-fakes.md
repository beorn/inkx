---
id: "@km/silvercode/backend-fakes"
aliases:
  - km-silvercode.backend-fakes
  - km-silvercode-backend-fakes
created_at: 2026-05-06T02:00:00Z
dependencies:
  - issue_id: km-silvercode.backend-fakes
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-05-06T02:00:00Z
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [/] Complete fake agent backends for Silvercode #feature #P1 @agent/3

blocks:: [[@km/silvercode]]

Build complete fake backends for every Silvercode agent backend so integration tests can run offline, deterministically, and then run the same contract suite against real backends to catch fake-vs-real drift.

This should follow the Cloudi Gmail mock pattern and the km fs sync pattern: fake the lowest external boundary, run the real adapter code above it, and keep live smoke/contract tests available behind explicit env gates.

Plan doc: [[docs/dev/silvercode-backend-fakes.md]]

## Principle

- One shared fake protocol engine where the wire is common.
- Backend-specific profiles for behavior differences.
- Real Silvercode adapter code above the fake. Do not fake `SessionState` or UI state for integration coverage.
- Dual-mode contracts: `fake` mode is default and CI-friendly; `live` mode is opt-in and verifies the fake has not drifted from real Codex/Gemini/Copilot/Claude behavior.

## Existing starting point

- `packages/agent-harness/src/fake.ts` is Layer 1: scripted `AgentSession` fake.
- `src/test/fake-codex-session.ts` and `src/test/fake-sdk-session.ts` are metadata-profile helpers over the session fake.
- `tests/slow/all-backends.slow.test.tsx` currently does live connect/close smoke tests only.

Those are useful, but not complete enough for config options or wire-level bugs. The missing layer is a fake backend process/server that speaks the same ACP or stream protocol as the real agent.

## Target Shape

- Shared ACP fake server with backend profiles for:
  - `codex`
  - `claude` / `claude-code`
  - `gemini`
  - `github-copilot-cli`
  - `pi-acp`
- Legacy spawn transport fakes for:
  - `claude-code-spawn`
  - `claude-code-sdk`
  - `codex-spawn`
- Contract runner that can execute the same scenario against fake or live backend:
  - initialize / auth
  - new session
  - load/resume session
  - prompt round-trip
  - cancellation
  - permission request / decision
  - tool call streaming/update
  - config option update and `session/set_config_option`
  - stderr/stdout pollution where applicable
  - close/teardown

## Acceptance

- Default tests use fake backends and require no external binaries, credentials, or network.
- Opt-in live tests run the same backend contract scenarios against installed real backends.
- Fake/live drift is visible as contract failures with the backend id and scenario name.
- Config-option tests use fake backends at the protocol boundary, not mocked UI/session state.
- Documentation explains the fake layering and when to use Layer 1 session scripts vs full backend fakes.

