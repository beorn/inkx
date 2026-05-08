---
mentions:
  - km
aliases:
  - km-silvercode.parity-kilo
  - km-silvercode-parity-kilo
  - km-silvercode.opencode-parity
  - km-silvercode-opencode-parity
  - opencode-parity
created_by: claude:4de4a3ab
created_at: 2026-04-27T18:16:24Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.parity-kilo
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T11:16:24Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [/] Kilo/opencode parity tracker @km/silvercode #feature #P1

Track Silvercode parity with Kilo/opencode. This bead moved over the previous `@km/silvercode/opencode-parity` epic and keeps its original four ergonomics gaps while adding provider/backend parity notes.

## Not yet implemented / notes

- [ ] No Kilo/opencode registry surface. `ACP_REGISTRY_IDS` lacks `opencode` and built-ins have no `opencode` or `kilo` alias. Add `opencode acp`, alias `kilo -> opencode`, config docs, probe, fake profile, registry tests, and slow smoke.
- [ ] OpenCode/Kilo provider auth/install docs are missing. Need built-in credential handling for `OPENCODE_API_KEY` and/or `opencode auth login`, plus user-facing `silvercode --agent kilo` docs.
- [ ] ACP session capabilities beyond `loadSession` are not exposed. OpenCode advertises list/fork/resume-like session capabilities; Silvercode handle only exposes loadSession.
- [ ] Silvercode `/fork` is only a fresh spawned sibling, not OpenCode-style session fork/branch tree.
- [ ] OpenCode child-session/subagent navigation is absent. Local subagents are currently notifications/tool chips, not selectable child transcripts. See `@km/silvercode/local-agent-subsessions`.
- [ ] ACP config/model/mode UI is incomplete. `setSessionConfigOption()` exists, but config updates still mostly degrade to status and the open bead says state/UI projection is not end-to-end.
- [ ] LSP parity is not implemented: diagnostics panel, inline squiggles, hover/go-to-def, agent-facing LSP tools, and doctor checks are still missing.
- [ ] Filewatch parity is only partial. Current adapter is basic `fs.watch`; missing chokidar/gitignore behavior, workspace diagnostics tools, changed-files popover, diagnostic deltas, and doctor.
- [ ] Per-turn abort is still missing. Background cancellation marks UI state but does not stop the underlying provider turn.
- [ ] Single-binary distribution remains open: compile Silvercode plus agent-harness, claude-acp, km MCP, and tribe MCP into platform binaries.

## Existing beads to move / link

- Moved over: `@km/silvercode/opencode-parity` -> `@km/silvercode/parity-kilo`.
- Move or split into children: `@km/silvercode/lsp`, `@km/silvercode/fork-branch-ux`, `@km/silvercode/file-watch`, `@km/silvercode/single-binary` if/when filed.
- Move/link: `@km/silvercode/local-agent-subsessions`, `@km/silvercode/acp-session-config-options`, `@km/silvercode/session-store-and-switch`.
- Link: `@km/silvercode/per-turn-abort`.
- Link as implemented evidence: `@km/silvercode/acp-client`, `@km/silvercode/acp-controller-wire`, `@km/silvercode/acp-session-load`, `@km/silvercode/acp-permission-ui-wire`, `@km/silvercode/agent-backend-provider-specs`, `@km/silvercode/acp-components`, `@km/silvercode/parity-claude/tool-call-rendering-v2`, `@km/silvercode/parity-claude/canonical-agent-plan-model`, `@km/silvercode/parity-claude/user-turn-bg-only`.

## Implemented checklist

- [x] Generic ACP stdio transport exists: `connectAcp()` spawns ACP servers, negotiates capabilities, handles prompt/cancel/auth/config/resume, and maps ACP updates into Silvercode events.
- [x] Silvercode can route `--agent <id>` to ACP backends through `connectAcpRegistry`; controller wires fs read/write and UI permission queue.
- [x] ACP `session/load` resume path is implemented for registered agents that advertise `loadSession`.
- [x] Core OpenCode-shaped ACP update families are modeled generically: text/thought chunks, tool calls/results, plans, slash-command updates, config/session-info/usage status.
- [x] ACP/OpenCode plan updates normalize into the canonical AgentPlan path generically as `acp-plan`; explicit `opencode-plan` waits on provider identity.
- [x] Provider-injected backend fakes/spec runner exist and the fake comprehensive stream covers opencode-shaped event families, though not an `opencode` registry id yet.
- [x] Visual parity pieces landed: opencode-style tool rows, user-prompt background/assistant plain layout, raw/debug collapsed context.
- [x] Basic filewatch notification source exists with `fs.watch`, debounce, noise filtering, and notification queue.
- [x] Background-task and multi-session foundations exist: Ctrl-B backgrounding, queue UX, 2-up/grid sessions, and cross-agent coordinator MCP.

