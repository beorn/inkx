# Silvercode Backend Fakes Plan

Silvercode needs complete fake agent backends for the same reason km has fake repositories, fake watchers, and fake filesystems: fast tests should exercise real application code without depending on slow, flaky, credentialed external systems. The fake must sit at the lowest practical external boundary, and the same contract should be runnable against the real backend to catch fake-vs-real drift.

This plan covers backend fakes for Silvercode agent backends, with config options as the first feature that must use them.

## Core Decision

Use one shared fake protocol engine where the protocol is common, plus backend profiles where behavior differs. Fakes are injected as `AgentBackend` providers in the same `AgentBackends` map that production code uses; the fake provider supplies an in-process ACP spawn implementation through the backend's `connect()` method.

```
Silvercode App
└── Controller / SessionStore / UI
    └── real agent-harness adapter code
        ├── fake mode: provider-injected fake backend
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

Silvercode now has a Layer 2 fake backend provider that speaks ACP through the same spawn seam as the real agent backend. It runs in-process for ordinary tests while still exercising the adapter code above the protocol boundary.

## Fake Layers

Use explicit layers so tests choose the smallest fake that still covers the behavior.

| Layer | Fake                   | Boundary                     | Use When                                                           |
| ----- | ---------------------- | ---------------------------- | ------------------------------------------------------------------ |
| 0     | Pure function fixtures | Function input/output        | Parser, reducer, formatting                                        |
| 1     | AgentSession fake      | Harness session interface    | SessionStore/UI behavior only                                      |
| 2     | Fake backend provider  | ACP or stream-json protocol  | Adapter integration, config options, permissions, prompt lifecycle |
| 3     | Live backend           | Real external binary/service | Drift checks, auth, release smoke                                  |

Layer 2 is the contract layer for adapter behavior. Config options use Layer 2 because `session/set_config_option` is a protocol feature.

## Shared Fake Engine

Create a shared fake ACP backend with profile-driven behavior.

Proposed package layout:

```text
apps/silvercode/
├── packages/agent-harness/src/testing/
│   ├── fake-acp-server.ts          # shared ACP fake engine
│   ├── backend-spec-runner.ts      # fake/live spec harness
│   ├── backend-profiles/
│   │   ├── codex.ts
│   │   ├── claude.ts
│   │   ├── gemini.ts
│   │   ├── copilot.ts
│   │   └── pi-acp.ts
│   └── scenarios/
│       ├── config-options.ts
│       ├── permission.ts
│       ├── prompt-text.ts
│       ├── resume.ts
│       └── stdout-pollution.ts
└── tests/backend-contracts/
    ├── acp-contracts.test.ts
    ├── config-options.contract.test.ts
    └── legacy-spawn-contracts.test.ts
```

Implemented first slice:

- `@km/agent-harness/testing/fake-acp-server` provides the shared in-process ACP fake engine.
- `createFakeAcpSpawn()` wires a real `AgentSideConnection` behind the `connectAcp` spawn seam.
- `createFakeAcpRegistrySpawn()` provides basic initialize/prompt fake profiles for every registered ACP id: Codex, Gemini, GitHub Copilot CLI, pi-acp, Claude, and Claude Code.
- `createFakeCodexAcpSpawn()` provides the first profile, including stateful `session/set_config_option` handling.
- `FakeAcpBackendProfile.onPrompt` lets scenarios drive real server-to-client ACP callbacks during a prompt turn, including permissions and filesystem requests.
- `AcpAgentSession.configOptions` and `AcpAgentSession.setSessionConfigOption()` expose the latest ACP config surface to tests and UI callers.
- `@km/agent-harness/agent-backends` defines `AgentBackend`, `AgentBackends`, `createAcpAgentBackend()`, and provider-injected fake ACP backends.
- `@km/agent-harness/testing/backend-spec-runner` runs the same assertion function against fake targets by default and live targets when `SILVERCODE_BACKEND_CONTRACT=live`.
- `apps/silvercode/tests/backend-contracts/config-options.contract.test.ts` covers Codex `reasoning_effort` plus generic select/boolean ACP config defaults and live mutations across every registered fake ACP backend.
- `apps/silvercode/tests/backend-contracts/prompt.contract.test.ts` runs the prompt lifecycle spec against every registered fake ACP backend, and appends selected live backends in live mode.
- `apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts` runs against every fake ACP provider and verifies representative text, reasoning, tool, result, plan, slash-command, status, binary, and resource update families.

## Local Transcript Survey

The comprehensive fake scenario is based on a structural survey of local agent transcripts under `~/.claude`, `~/.codex`, and opencode's local SQLite store. The survey used event/type/tool counts only; no raw private transcript text was copied into the fake or this document.

### Claude Code JSONL

Top-level event families found in `~/.claude/projects` and `~/.claude/sessions`:

- Assistant/user/system message records.
- Progress records, queue operations, permission mode changes, prompt snapshots, file-history snapshots, titles, agent names, worktree state, PR links, and attachments.
- Message content blocks: `tool_use`, `tool_result`, `text`, `thinking`, `image`, `document`, and `redacted_thinking`.
- Tool results with text, create/update/file-unchanged payloads, image payloads, PDFs, and multi-part results.

Most frequent tool-use names in the surveyed data:

- Shell and filesystem: `Bash`, `Read`, `Edit`, `Grep`, `Glob`, `Write`.
- Planning/tasking: `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskOutput`, `Agent`, `SendMessage`.
- Web and MCP: `WebSearch`, `WebFetch`, `mcp__...` tools, browser/TTY tools, Gmail API tools from Cloudi-style integrations.
- Operational tools: worktree entry, scheduling, monitoring, skill invocation, plan-mode exit.

### Codex JSONL

Codex sessions under `~/.codex/sessions` are dominated by:

- Top-level `response_item`, `event_msg`, `turn_context`, `session_meta`, and compaction records.
- Response payloads: `message`, `reasoning`, `function_call`, `function_call_output`, `custom_tool_call`, `custom_tool_call_output`, and `web_search_call`.
- Event payloads: token counts, command completion, patch apply completion, agent/user messages, task start/complete, reasoning summaries, view-image calls, web-search completion, aborts, agent spawn/wait completions, errors, and thread-name updates.
- Function calls in this workspace were mostly `exec_command`, `write_stdin`, `view_image`, `shell`, `update_plan`, `spawn_agent`, and `wait_agent`; custom tool calls were mostly `apply_patch`.
- Message content blocks were `output_text`, `input_text`, and occasional `input_image`.

### Opencode SQLite

The opencode store at `~/.local/share/opencode/opencode.db` contains `session`, `message`, `part`, `permission`, `todo`, and event-sequence tables. Surveyed part/message/event families include:

- Message roles: assistant and user.
- Part types: `tool`, `step-start`, `step-finish`, `text`, `reasoning`, `patch`, and `compaction`.
- Tool parts: mostly `bash`, `read`, `grep`, `glob`, `webfetch`, `skill`, `write`, `task`, and `edit`, plus invalid-tool cases.

### Fake Coverage Derived From The Survey

The Layer 2 ACP fake now emits one synthetic comprehensive prompt stream that covers the event families Silvercode UI and stores must understand:

- Assistant text chunks and reasoning/thinking chunks.
- Non-text content chunks: image, audio, resource link, and embedded resource.
- All ACP tool kinds: `read`, `edit`, `delete`, `move`, `search`, `execute`, `think`, `fetch`, `switch_mode`, and `other`.
- Tool lifecycle states: pending, in progress, completed, and failed.
- Tool outputs: text content, structured diff, terminal reference, and raw structured output.
- Plan updates with completed/in-progress/pending entries.
- Slash-command updates.
- Current-mode, config-option, session-info, and usage updates.

The fake intentionally uses synthetic payloads. Its job is to cover protocol shape and projection behavior, not to replay private transcript content.

Proposed TypeScript surface:

```typescript
type FakeAcpProfile = {
  id: "codex" | "claude" | "gemini" | "github-copilot-cli" | "pi-acp"
  initialize: FakeInitializeProfile
  session: FakeSessionProfile
  configOptions?: FakeConfigOptionProfile[]
  scenarios: Record<string, FakeBackendScenario>
}
```

Scenario shape:

```typescript
type FakeBackendScenario = {
  name: string
  requiredCapabilities?: string[]
  initialConfigOptions?: FakeConfigOption[]
  onPrompt?: FakePromptHandler
  updates?: FakeSessionUpdateStep[]
  faults?: FakeFault[]
}

type FakeConfigOption = {
  id: string
  category: "mode" | "model" | "thought_level" | string
  label: string
  value: unknown
  values?: Array<{ value: unknown; label: string }>
}
```

The exact type names can change during implementation, but the important property is that scenarios describe backend behavior, not Silvercode UI state.

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
- Provider-injected mode so `connectAcpRegistry` and `connectAcp` run unchanged above the spawn seam. Separate fake server processes are not required for ordinary specs.

## Contract Matrix

The shared spec runner should keep a visible matrix of which backends support which scenarios. Unsupported features are explicit expectations, not silent skips.

| Scenario         | Codex        | Claude ACP      | Gemini              | Copilot         | pi-acp          | Legacy Claude   | Legacy Codex       | SDK                             |
| ---------------- | ------------ | --------------- | ------------------- | --------------- | --------------- | --------------- | ------------------ | ------------------------------- |
| initialize       | required     | required        | required            | required        | required        | required        | required           | required                        |
| prompt text      | required     | required        | required            | required        | required        | required        | required           | required                        |
| permission       | required     | required        | profile-defined     | profile-defined | profile-defined | required        | required           | SDK-defined                     |
| tool updates     | required     | required        | required            | profile-defined | profile-defined | required        | required           | SDK-defined                     |
| config list      | required     | profile-defined | profile-defined     | profile-defined | profile-defined | unsupported     | unsupported        | unsupported                     |
| config set       | required     | profile-defined | profile-defined     | profile-defined | profile-defined | unsupported     | unsupported        | unsupported                     |
| resume/load      | required     | required        | required            | profile-defined | profile-defined | legacy-specific | codex-jsonl replay | unsupported unless SDK supports |
| cancel           | required     | required        | required            | required        | required        | required        | required           | required                        |
| close            | required     | required        | required            | required        | required        | required        | required           | required                        |
| stdout pollution | not expected | not expected    | required regression | profile-defined | profile-defined | stream-specific | stream-specific    | not applicable                  |

`profile-defined` means the profile must choose one of:

- supported, with expected behavior
- unsupported, with expected fallback behavior
- unknown, which blocks shipping that profile until live behavior is checked

## Backend Profiles

### Codex

Codex is the first profile because config options are already user-visible.

Must model:

- `reasoning_effort` config in the `thought_level` category with `low`, `medium`, `high`, `xhigh`
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
3. Assert the `reasoning_effort` option in the `thought_level` category is present.
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

Create a backend spec runner with fake and live implementations.

Proposed shape:

```typescript
type AgentBackendSpecTarget =
  | { mode: "fake"; backend: AgentBackend; controller: FakeAcpBackendController }
  | { mode: "live"; backend: AgentBackend }

runAgentBackendSpec(target, scenario)
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

Implemented config-option path:

1. Project ACP `configOptions` from session creation and `config_option_update`.
2. Store config options in session state.
3. Expose a typed harness method for `session/set_config_option`.
4. Update state from the returned full `configOptions`.
5. Drive model/mode/thought-level UI from config options when present.
6. Keep descriptor fallback behavior for backends without ACP config.
7. Wire Codex `Option+.` and `Option+,` through `session/set_config_option`.

Tests:

- Fake Codex config contract.
- Generic config default + mutation contracts for every fake ACP backend.
- Fake config rejection contract.
- ACP client update from `config_option_update`.
- Controller, CLI resolution, and UI keybinding tests proving options are threaded through.
- Fallback test when no config option exists.
- Live Codex drift test behind `SILVERCODE_BACKEND_CONTRACT=live`.

Expected Codex config fixture:

```typescript
const codexThoughtLevel = {
  id: "reasoning_effort",
  category: "thought_level",
  label: "Reasoning",
  value: "medium",
  values: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
  ],
}
```

Current Codex ACP behavior uses id `reasoning_effort` and category `thought_level`. The live drift contract should fail if the wrapper changes this surface.

## Fake vs Live Drift

Every backend contract has two execution targets:

- `fake`: deterministic, default, no credentials, runs in normal CI.
- `live`: opt-in, uses real installed backend binaries and credentials.

Drift policy:

1. If fake passes and live fails, inspect whether real backend behavior changed or the fake was too permissive.
2. If Silvercode depends on the live behavior, update the fake and add a regression scenario.
3. If live behavior is a backend bug, keep the fake strict and document the live exception in the profile.
4. If a backend does not support a feature, the profile should assert the fallback behavior rather than skipping.

Live gating should be explicit:

```bash
SILVERCODE_BACKEND_CONTRACT=live \
SILVERCODE_BACKENDS=codex,gemini \
bun vitest run apps/silvercode/tests/backend-contracts
```

Missing binaries or credentials should skip with a clear reason. Available-but-wrong behavior should fail.

Implemented commands today:

```bash
bun vitest run apps/silvercode/tests/backend-contracts/config-options.contract.test.ts
bun vitest run apps/silvercode/tests/backend-contracts/prompt.contract.test.ts
bun vitest run apps/silvercode/tests/backend-contracts/comprehensive-session-updates.contract.test.ts
```

Append the live Codex target explicitly:

```bash
SILVERCODE_BACKEND_CONTRACT=live \
bun vitest run apps/silvercode/tests/backend-contracts/config-options.contract.test.ts
```

## Choosing the Right Fake

Use the smallest fake that crosses the behavior under test:

| Test Goal                                  | Use                                 | Avoid                       |
| ------------------------------------------ | ----------------------------------- | --------------------------- |
| Reducer response to one event              | Layer 0/1 event fixture             | Backend provider fake       |
| App rendering of existing state            | AgentSession fake or story fixture  | Live backend                |
| ACP adapter maps protocol update correctly | Layer 2 fake ACP backend            | Mocked SessionState         |
| Keybinding mutates backend config          | Layer 2 fake ACP config profile     | Local capability state fake |
| Backend connection closes cleanly          | Layer 2 fake provider or live smoke | Pure session fake           |
| Backend compatibility before release       | Live contract mode                  | Fake-only tests             |

## Phased Work

### Phase 1: Shared Fake ACP Core

- Add fake ACP server library and provider-injected fake backends.
- Add deterministic scenario format.
- Add spec runner fake mode.
- Port one existing `AgentSession` fake scenario to Layer 2.
- Document Layer 1 vs Layer 2 usage in `packages/agent-harness/CLAUDE.md`.

Exit criteria: `connectAcpRegistry` can connect to fake ACP backend through provider injection.

### Phase 2: ACP Config Profiles

- Add Codex profile with `thought_level`.
- Wire config options through harness/session state/UI.
- Add generic fake contracts for config defaults and read/set/reject across registered ACP backends.
- Add live Codex contract gate.

Exit criteria: Codex reasoning UI and descriptor-driven permission-mode UI are not cosmetic; they mutate advertised backend config through ACP.

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
- Add a short "when live finds drift" runbook to this document.

Exit criteria: fake-vs-real drift has a standard workflow and a clear failure policy.

## Open Questions

- Do live Gemini and Copilot expose backend-specific config options beyond the generic descriptor fallback?
- Should live backend contracts run in nightly CI, local-only, or release-only?
- Do we need recording support that captures a real live session and turns it into a fake scenario fixture?
- Should fake ACP profiles live in `agent-harness` only, or should Silvercode app-level scenarios wrap them with UI-specific helpers?

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
