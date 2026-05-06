# Silvercode Backend Fakes Plan

Silvercode needs complete fake agent backends for the same reason km has fake repositories, fake watchers, and fake filesystems: fast tests should exercise real application code without depending on slow, flaky, credentialed external systems. The fake must sit at the lowest practical external boundary, and the same contract should be runnable against the real backend to catch fake-vs-real drift.

This plan covers backend fakes for Silvercode agent backends, with config options as the first feature that must use them.

## Core Decision

Use one shared fake protocol engine where the protocol is common, plus backend profiles where behavior differs.

```
Silvercode App
└── Controller / SessionStore / UI
    └── real agent-harness adapter code
        ├── fake mode: fake backend process/server
        └── live mode: real Codex/Gemini/Copilot/Claude backend
```

Do not fake `SessionState` for integration tests. That misses the important bugs, including the config-options bug class where the protocol supports something but Silvercode fails to project it through the harness.

## Existing Patterns

### km Storage and Filesystem

km already has several fake families:

- `createFakeRepo()` in `@km/storage`
  - Pure in-memory `Repo` implementation.
  - Best for UI and state-machine tests that do not need SQLite or filesystem behavior.
- `createFakeWatcher()` in `@km/storage`
  - Emits watcher events without real OS filesystem notifications.
  - Best for sync reaction tests.
- `FakeFileSystem` from `@beorn/watcher-chaos`
  - In-memory filesystem with error injection.
  - Best for sync, reconciliation, and chaos tests.
- `withTestEnv()`
  - Uses temp directories and real database/filesystem paths.
  - Best for integration tests and drift checks.

The rule is documented in `docs/dev/test-fakes.md` and `docs/dev/test-system.md`: if fake passes but real fails, update the fake to match real behavior and add a regression.

### Cloudi Google API Fakes

Cloudi's `@cloudi/test-utils` has the strongest precedent:

- Fake only the Google API boundary.
- Run real mail/task/storage provider logic above the fake.
- Provide a live mode that runs the same tests against Gmail/Tasks APIs.
- Keep the fake realistic enough to catch API semantics, such as destructive Google Tasks updates.

Silvercode should copy that architecture, not the Gmail-specific implementation.

### Current Silvercode Fakes

Silvercode already has useful fakes, but they are not complete backend fakes:

- `packages/agent-harness/src/fake.ts`
  - Layer 1 scripted `AgentSession` fake.
  - Good for reducer/session-store tests.
- `src/test/fake-session.ts`
  - UI-oriented session fake with recorded sends and scripted events.
  - Good for App and visual tests.
- `src/test/fake-codex-session.ts` and `src/test/fake-sdk-session.ts`
  - Metadata profile helpers over the session fake.
  - Good for narrow multi-backend UI behavior.
- `src/test/fake-boundaries.ts`
  - Fakes account probes, git branch, Claude version, and HOME/cache boundaries.
  - Good for boundary isolation, not agent protocol behavior.
- `tests/slow/all-backends.slow.test.tsx`
  - Live backend smoke for connect/close only.
  - Good teardown coverage, but not a behavioral contract suite.

The missing layer is a fake backend process/server that speaks the same ACP or stream protocol as the real agent backend.

## Fake Layers

Use explicit layers so tests choose the smallest fake that still covers the behavior.

| Layer | Fake | Boundary | Use When |
|---|---|---|---|
| 0 | Pure function fixtures | Function input/output | Parser, reducer, formatting |
| 1 | `AgentSession` fake | Harness session interface | SessionStore/UI behavior only |
| 2 | Fake backend process/server | ACP or stream-json protocol | Adapter integration, config options, permissions, prompt lifecycle |
| 3 | Live backend | Real external binary/service | Drift checks, auth, release smoke |

Layer 2 is the new work. Config options must use Layer 2 because `session/set_config_option` is a protocol feature.

## Shared Fake Engine

Create a shared fake ACP backend with profile-driven behavior.

Proposed package surface:

```typescript
type FakeAcpProfile = {
  id: "codex" | "claude" | "gemini" | "github-copilot-cli" | "pi-acp"
  initialize: FakeInitializeProfile
  session: FakeSessionProfile
  configOptions?: FakeConfigOptionProfile[]
  scenarios: Record<string, FakeBackendScenario>
}
```

The fake should support:

- initialize/auth
- `session/new`
- `session/load`
- `session/prompt`
- `session/cancel`
- `session/set_config_option`
- permission requests and decisions
- filesystem callbacks when client capabilities advertise fs
- terminal callbacks later, when Silvercode wires terminal support
- clean close and forced exit

It should also support fault injection:

- stdout pollution before JSON
- stderr warnings
- malformed JSON
- delayed responses
- backend exits mid-turn
- config option rejected
- missing capability despite UI fallback

The fake should be usable in two forms:

- Library mode for unit tests.
- Stdio process mode so `connectAcpRegistry` and process lifecycle code run unchanged.

## Backend Profiles

### Codex

Codex is the first profile because config options are already user-visible.

Must model:

- `thought_level` config with `low`, `medium`, `high`, `xhigh`
- `session/set_config_option` returning full updated `configOptions`
- model/mode config options when surfaced
- plan updates
- exec command permission prompts
- shell/apply_patch tool calls
- cancellation and close
- load/resume with config replay

First contract:

1. Start fake Codex backend.
2. Create session.
3. Assert `thought_level` options are present.
4. Press `Option+.` in Silvercode.
5. Assert the adapter sent `session/set_config_option`.
6. Assert UI updates from returned `configOptions`, not local-only state.

### Claude / Claude Code

Claude has multiple surfaces:

- ACP wrapper: `claude` / `claude-code`
- Legacy spawn: `claude-code-spawn`
- SDK: `claude-code-sdk`

ACP wrapper profile should model:

- session init metadata
- slash commands
- skills/plugins
- TodoWrite/plan updates
- permission prompts
- config options if the wrapper exposes them

Legacy spawn and SDK should use separate transport fakes because their protocol is not ACP.

### Gemini

Gemini profile should model:

- ACP init/session/prompt lifecycle
- the known stdout pollution/trust-workspace warning scenario
- model/config options if surfaced
- permission/tool updates
- cancellation, load/resume, close

The stdout pollution case is important because it has already broken the ACP JSON stream.

### GitHub Copilot

Copilot profile should model:

- ACP lifecycle through the `copilot` binary shape
- auth/no-auth behavior as observed
- config surfaces if present
- unsupported config surfaces when absent
- prompt, cancel, close

The main UI requirement: Silvercode must not show stale Claude/Codex controls when Copilot exposes no equivalent config.

### pi-acp

pi-acp is lower priority but should still have a profile because it is in the registry.

Must model:

- initialization
- prompt
- permissions
- config options if present
- unsupported-feature responses
- close

### Legacy Spawn Transports

Some shipped paths are not ACP. They need transport fakes, not ACP profiles:

- `spawnClaude` / `claude-code-spawn`
- `spawnCodex` / `codex-spawn`
- `spawnSdk` / `claude-code-sdk`

These should fake the raw stream or SDK boundary while still running real parser/adapter code above them.

## Contract Runner

Create a backend contract runner with fake and live implementations.

Proposed shape:

```typescript
type BackendContractTarget =
  | { mode: "fake"; backend: BackendId; profile: FakeAcpProfile }
  | { mode: "live"; backend: BackendId }

runBackendContract(target, scenario)
```

Scenarios should be data-driven:

- `init`
- `prompt-text`
- `permission`
- `tool-call`
- `config-options`
- `config-set`
- `resume`
- `cancel`
- `close`
- `stdout-pollution`
- `backend-error`

Default test mode:

```bash
bun vitest run apps/silvercode/tests/backend-contracts
```

Live drift mode:

```bash
SILVERCODE_BACKEND_CONTRACT=live bun vitest run apps/silvercode/tests/backend-contracts
```

Optional backend selection:

```bash
SILVERCODE_BACKENDS=codex,gemini SILVERCODE_BACKEND_CONTRACT=live bun vitest run apps/silvercode/tests/backend-contracts
```

Live tests should skip cleanly when a binary or credential is missing. They should fail when the backend is available but behavior differs from the fake contract.

## Config Options Plan

Config options should be the first consumer of Layer 2 backend fakes.

Implementation tasks:

1. Project ACP `configOptions` from `newSession`, `loadSession`, `resumeSession`, and `config_option_update`.
2. Store config options in session state.
3. Expose a typed harness method for `session/set_config_option`.
4. Update state from the returned full `configOptions`.
5. Drive model/mode/thought-level UI from config options when present.
6. Keep descriptor fallback behavior for backends without ACP config.
7. Wire Codex `Option+.` and `Option+,` through `session/set_config_option`.

Tests:

- Fake Codex config contract.
- Fake config rejection contract.
- Session reducer update from `config_option_update`.
- UI keybinding test proving the setter is called.
- Fallback test when no config option exists.
- Live Codex drift test behind `SILVERCODE_BACKEND_CONTRACT=live`.

## Phased Work

### Phase 1: Shared Fake ACP Core

- Add fake ACP server library and stdio binary.
- Add deterministic scenario format.
- Add contract runner fake mode.
- Port one existing `AgentSession` fake scenario to Layer 2.

Exit criteria: `connectAcpRegistry` can connect to fake ACP backend through stdio.

### Phase 2: Codex Config Profile

- Add Codex profile with `thought_level`.
- Wire config options through harness/session state/UI.
- Add Codex fake contracts for config read/set/reject.
- Add live Codex contract gate.

Exit criteria: Codex reasoning UI is not cosmetic; it mutates backend config through ACP.

### Phase 3: Claude and Legacy Transports

- Add Claude ACP profile.
- Add legacy spawn fakes for Claude stream-json, Codex stream-json, and SDK.
- Document which tests should use ACP fake vs legacy transport fake.

Exit criteria: every currently shipped Claude path has a non-live integration fake.

### Phase 4: Gemini, Copilot, pi-acp

- Add profiles for remaining ACP registry entries.
- Include backend-specific weirdness, especially Gemini stdout pollution.
- Add fake/live drift contracts.

Exit criteria: every `AcpRegistryId` has a fake profile and at least init/prompt/close contracts.

### Phase 5: Drift Routine

- Add a documented command for fake-only contracts.
- Add a documented command for live drift checks.
- Add a release checklist item: run live drift against installed backends before changing adapter/config behavior.

Exit criteria: fake-vs-real drift has a standard workflow and a clear failure policy.

## Bead Map

Parent:

- `@km/silvercode/backend-fakes`

Sub-beads:

- `@km/silvercode/backend-fakes-shared-protocol`
- `@km/silvercode/backend-fakes-codex`
- `@km/silvercode/backend-fakes-claude`
- `@km/silvercode/backend-fakes-gemini`
- `@km/silvercode/backend-fakes-copilot`
- `@km/silvercode/backend-fakes-pi-acp`
- `@km/silvercode/backend-fakes-spawn-transports`

Config options consumer:

- `@km/silvercode/acp-session-config-options`

## Non-Goals

- Do not perfectly reimplement every backend. Model the contract Silvercode depends on.
- Do not replace live smoke tests. Fakes make local tests fast; live tests catch drift.
- Do not fake UI state for adapter integration. Use lower-boundary fakes.
- Do not make one giant scenario fixture. Prefer small named contracts that can run fake and live.

## Rule of Thumb

When a fake and a real backend disagree, neither automatically wins. First determine whether Silvercode relies on the behavior. If it does, update the fake to match real behavior and add a regression. If real behavior is a backend bug, keep the fake strict and document the live exception.
