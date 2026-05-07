---
aliases:
  - km-silvercode.parity-acp
  - km-silvercode-parity-acp
created_at: 2026-05-07T01:30:33.422Z
---

# [ ] ACP parity tracker @km/silvercode #feature #P1

Track Silvercode parity with ACP proper as a provider boundary. This is not a provider-specific tracker; Claude, Codex, and Kilo/opencode have sibling parity trackers.

## Not yet implemented / notes

- [ ] App-level ACP config parity is still open. Codex reasoning controls are local descriptor state instead of calling `session/set_config_option`. See `@km/silvercode/acp-session-config-options`, `apps/silvercode/src/agent-capabilities.ts`, `apps/silvercode/src/App.tsx`, and `apps/silvercode/packages/agent-harness/src/acp-client.ts`.
- [ ] Rich ACP updates still collapse to legacy `status` events for `current_mode_update`, `config_option_update`, `session_info_update`, and `usage_update`; they do not update durable rich app state through `SessionStore`.
- [ ] `createAcpSession` still bridges through legacy text-only `AgentSession.send`; non-text prompt blocks cancel instead of flowing as ACP content.
- [ ] Status derivation remains partial. `createAcpSession` computes a status signal, but the main app still depends on legacy `SessionStore.status` and turn-end synthesis. See `@km/silvercode/acp-status-as-derived`.
- [ ] Typed channel prompt assembly exists, but controller sends plain text through `session.send(...)`; ACP `ContentBlock[]` prompt delivery is not the runtime path yet. See `@km/silvercode/acp-channels`.
- [ ] Registry parity mismatch: harness supports `pi-acp`, but `BUILTIN_AGENTS` does not, so bare `silvercode --agent pi-acp` is not a built-in path.
- [ ] Copilot and Gemini live parity need explicit verification tracking; code comments still mark Gemini resume partial and Copilot unverified.

## Existing beads to move / link

- Move or parent here: `@km/silvercode/acp-session-config-options`, `@km/silvercode/acp-status-as-derived`.
- Move or link as provider UI children: `@km/silvercode/acp-comp-settings-panels`, `@km/silvercode/acp-comp-marketplace-dialogs`.
- Link as terminal-capability/UI-shell dependency: `@km/silvercode/acp-comp-terminal-panel`.
- Absorb as completed implementation history: `@km/silvercode/acp`, `@km/silvercode/acp-foundation`, `@km/silvercode/acp-client`, `@km/silvercode/acp-controller-wire`, `@km/silvercode/acp-session-load`, `@km/silvercode/acp-probe-runner`.
- Link provider-specific adapter history from the sibling trackers: `@km/silvercode/acp-adapter-claude`, `@km/silvercode/acp-adapter-codex`, `@km/silvercode/acp-adapter-gemini`, `@km/silvercode/acp-adapter-pi`.
- Link as test/parity foundation: `@km/silvercode/agent-backend-provider-specs`.

## Implemented checklist

- [x] ACP-owned type layer and boundary adapter exist; `SessionUpdate` covers messages, thoughts, tools, plans, commands, mode, config, session info, and usage.
- [x] Generic ACP client/registry exists for `codex`, `gemini`, `github-copilot-cli`, `pi-acp`, `claude`, and `claude-code`, with scope-owned subprocess lifecycle.
- [x] Silvercode controller routes ACP agents through `connectAcpRegistry`, with fs handlers, resume forwarding, and UI-backed permission resolution.
- [x] ACP `loadSession` support is wired at connect-time and on the live session handle.
- [x] Provider-injected ACP backends and fake/live contract runner exist.
- [x] Fake ACP streams cover all registry ids and representative update families: text, thought, content blocks, all tool kinds, plan, commands, mode, config, session info, and usage.
- [x] ACP permission UI supports multi-option requests, not only binary approve/deny.
- [x] ACP config mutation exists in the harness and fake contracts.
- [x] Gemini stdout pollution is handled at the stdio boundary.
