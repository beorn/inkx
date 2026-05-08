---
aliases:
  - km-silvercode.parity-codex
  - km-silvercode-parity-codex
created_at: 2026-05-07T01:30:33.438Z
---

# [/] Codex parity tracker @km/silvercode #feature #P1

Track Silvercode parity with Codex across the ACP path, the legacy/direct stream-json scaffold, local rollout resume, config/model controls, and Codex-local agent behavior.

## Not yet implemented / notes

- [ ] Codex reasoning UI is still local state, not ACP config mutation. `CODEX_THINKING.activate` only calls `setThinking`; `App.cycleThinking()` invokes descriptors but never `setSessionConfigOption`. Move/finish `@km/silvercode/acp-session-config-options`.
- [ ] ACP `config_option_update`, `current_mode_update`, `session_info_update`, and `usage_update` are lossy legacy `status` events; no visible session config state drives Codex controls.
- [ ] `codex-spawn` direct stream-json path is still a scaffold despite being a built-in agent. It only recognizes `obj.type === "text"` and emits generic status, while real Codex rollout parsing lives separately in app resume code. Decide whether to deprecate `codex-spawn` or implement it.
- [ ] Resume hydration boundary needs explicit decision/coverage: controller locally replays Codex rollout before connect, then ACP `loadSession` may also replay during `connectAcp`; there is no dedupe test for successful live attach.
- [ ] Codex credential preflight is narrower than adapter docs/closed bead history. Built-in Codex only accepts `OPENAI_API_KEY`; docs mention ChatGPT subscription, `CODEX_API_KEY`, and `OPENAI_API_KEY`.
- [ ] ACP prompt assembly/injectors are not wired into normal ACP sends. Codex ACP gets plain text; bd-prime/cwd/channel digest and typed channel injection are not applied through controller send.
- [ ] Codex fake profile is partly generic: comprehensive fake emits provider-neutral execute/edit tools, not Codex-specific `exec_command`, `apply_patch`, approval, cancellation, close, and resume-load behavior promised by `@km/silvercode/backend-fakes-codex`.
- [ ] `adapter-codex.md` is stale on spawn command: docs still say `npx -y`, while code/tests use `bun x`.
- [ ] Codex local-agent/subsession view is not modeled yet. Parent `collab_*` events and child rollout sessions need to feed `SubSessionHandle`; see `@km/silvercode/local-agent-subsessions`.

## Existing beads to move / link

- Move: `@km/silvercode/acp-session-config-options` for reasoning/model/mode config parity.
- Move or split: `@km/silvercode/backend-fakes-codex`; keep remaining Codex-specific fake coverage here.
- Move if `codex-spawn` remains supported: `@km/silvercode/backend-fakes-spawn-transports`; otherwise link from a deprecation/removal decision.
- Link: `@km/silvercode/agent-verification-matrix`, `@km/silvercode/model-capability`, `@km/silvercode/per-turn-abort`, and `@km/silvercode/local-agent-subsessions`.
- Absorb as historical context, do not reopen only for history: `@km/silvercode/m12-codex-backend` and `@km/silvercode/acp-adapter-codex`.
- Link as implemented dependencies: `@km/silvercode/acp-controller-wire`, `@km/silvercode/acp-session-load`, `@km/silvercode/acp-probe-runner`, `@km/silvercode/acp-permission-ui-wire`, `@km/silvercode/zero-config`, `@km/silvercode/spawn-close-hardening`.

## Implemented checklist

- [x] Primary `codex` backend uses ACP: `connectAcpRegistry("codex")` spawns `bun x @zed-industries/codex-acp`; registry tests cover the command.
- [x] `--agent codex` is wired through controller ACP dispatch with fs handlers, permission handlers, and resume passthrough.
- [x] Generic ACP `loadSession` exists and Codex was live-smoked as supporting resume.
- [x] Codex local rollout replay exists for `~/.codex/sessions/.../rollout-*-<sid>.jsonl`; it handles strict schema drift errors, session meta, user/assistant turns, plans, exec/apply_patch tools, ignored web-search/compaction records, and synthetic turn-end.
- [x] Controller pre-replays Codex transcript before live attach and falls back to replay-only if ACP attach fails.
- [x] Codex fake ACP profile exists with model/reasoning/web_search config options; fake registry and config mutation tests exercise the real ACP wire.
- [x] Provider-injected backend fakes/spec runner cover Codex prompt/config/comprehensive streams.
- [x] UI has Codex descriptors for reasoning tiers and plan/normal mode; Option+. and Option+, cycle through descriptor options.
- [x] Codex-shaped tool rendering exists for `exec_command`, parsed read/search/list_files, and `apply_patch`.

