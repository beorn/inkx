---
id: "@km/silvercode/acp-controller-wire"
aliases:
  - km-silvercode.acp-controller-wire
  - km-silvercode-acp-controller-wire
created_by: claude:cd034ca4
created_at: 2026-04-26T16:00:04Z
closed_at: 2026-04-26T16:26:33Z
close_reason: >-
  Phase 1 wired. silvercode now accepts --agent <registryId> and routes the
  spawn factory through connectAcpRegistry instead of spawnClaude/Codex/Sdk:


  - ControllerOptions.agent + SpawnSessionOptions.agent threaded

  - defaultSpawn dispatches to connectAcpRegistry when agent is set

  - v0 fsHandler wires Bun.file read/write

  - v0 permissionHandler auto-approves first option (real UI integration:
  km-silvercode.acp-permission-ui-wire)

  - AppProps.agent threaded from index.tsx

  - index.tsx --agent <id> CLI flag with strict validation (rejects unknown ids)


  ## Verified

  - bun silvercode --help shows --agent

  - bun silvercode --agent definitely-not-a-real-agent rejected at parse time

  - 114/114 ACP-related tests pass


  ## Limitations (deferred to follow-ups)

  - Permission UI: km-silvercode.acp-permission-ui-wire (P2)

  - @km/claude-acp loadSession (resume):
  km-silvercode.acp-claude-acp-loadsession (P3)

  - Multi-account / --bare not threaded through ACP path yet

  - Injectors (bd-prime, channels, cwd) not applied to session/prompt:
  km-silvercode.acp-channels covers this on the new pipeline
---

# [x] silvercode controller — route via connectAcpRegistry, add --agent CLI flag @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-probe-runner]], [[@km/silvercode/acp-session-load]]

Replace the hardcoded `spawnClaude` in silvercode controller with registry-driven dispatch, exposing `--agent <id>` on the bin so users can switch backends.

## Today
`apps/silvercode/src/controller.ts` calls `spawnClaude({...})` directly (legacy stream-json adapter). The new ACP path (connectAcpRegistry → AcpAgentSession) is shipped + tested but not wired.

## Target
- `bun silvercode --agent claude-code` (default) → connectAcpRegistry('claude-code') (or keeps stream-json path for now, configurable)
- `bun silvercode --agent gemini` → connectAcpRegistry('gemini')
- `bun silvercode --agent codex` etc.

## Blockers
- AcpAgentSession needs to surface SessionUpdate events compatible with current SessionStore.apply() consumer. createAcpSession() bridges this — check it covers all the events the UI consumes.
- Permissions, fs handlers, terminal handlers must be wired (silvercode's existing implementations).

## Acceptance
- `bun silvercode --agent gemini` runs end-to-end against Gemini if Google auth is configured
- Same UI renders SessionUpdate, ToolCall, RequestPermission identically to current Claude path
- spawnClaude legacy path stays available behind a flag (e.g. `--legacy-stream-json`) for one release before removal

## Deps
- @km/silvercode/acp-probe-runner (smoke-test the agents work before wiring UI)