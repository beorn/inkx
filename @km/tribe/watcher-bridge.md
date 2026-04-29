---
id: "@km/tribe/watcher-bridge"
aliases:
  - km-tribe.watcher-bridge
  - km-tribe-watcher-bridge
created_by: Bjørn Stabell
created_at: 2026-04-14T21:02:29Z
---

# [ ] km-tribe bridge: forward km watcher events to tribe broadcast @km/tribe #task #P4

blocks:: [[@km/tribe]]

Idea: bridge km's file-watcher / events.jsonl stream to tribe_send so other Claude sessions can react to vault changes without manual prompting.

What it would unlock:
- Auto-notify sessions on relevant vault changes (e.g., fixer gets "vault: @next.md updated — 3 tasks changed" without the user having to say anything)
- Auto-broadcast new #@km/_orphan/bug tasks filed in @agent.md straight to fixer (replaces manual tribe_send)
- Surface km sync anomalies (block-id extraction failures, etc.) to tribe as alerts
- Cross-vault coordination if a second vault shows up later

Plumbing status: km already has watcher + events.jsonl; tribe already has send/broadcast. Missing piece is a small bridge process (either standalone daemon or km plugin) that subscribes + filters + forwards.

Tradeoffs / watch-outs:
- Noise budget: events.jsonl is chatty. Needs an aggressive allowlist (task-created, task-status-changed, file-renamed-in-sigil-folder, sync-error) or tribe becomes unreadable.
- Loop risk: tribe msg → agent writes file → km event → tribe msg. Needs debounce + source tag so agent-driven writes don't echo.
- Schema coupling: km event schema should be stable before hardening this. If km internals churn, bridge breaks.
- Deployment shape: simplest = standalone daemon alongside km watcher; more elegant = km plugin via km's plugin surface.

Status: TBD — parked for later, not blocking. Original context: conversation during 2025 tax prep crunch 2026-04-14 while coordinating fixer and vault sessions via tribe; manual tribe broadcasts were working but felt like obvious automation.