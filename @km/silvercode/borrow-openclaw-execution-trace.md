---
aliases:
  - km-silvercode.borrow-openclaw-execution-trace
  - km-silvercode-borrow-openclaw-execution-trace
created_at: 2026-05-07T19:15:40.095Z
---

# Adopt OpenClaw's normalized executionTrace shape across silvercode backends #P1

OpenClaw's `EmbeddedPiRunResult { meta: { agentMeta, executionTrace, requestShaping, completion, systemPromptReport } }` is the most fully-developed normalized event shape for cross-backend coding-CLI runs surveyed (see hub/silvercode/future/ai-terminal/10-agent-router-landscape.md § 'OpenClaw'). Silvercode currently records per-backend telemetry inconsistently — Claude session totals, Codex usage events, Gemini quota lines all use different shapes; fallback chains are not represented uniformly.

Goal: define a typed silvercode `SessionTrace` that mirrors OpenClaw's shape — `{ winnerProvider, winnerModel, attempts: { provider, model, model, startedAt, endedAt, outcome, errorFamily? }[], fallbackUsed, requestShaping?, completion, systemPromptReport? }` — and emit it from every BUILTIN_AGENT path (claude-acp, claude-code-spawn, claude-code-sdk, codex, codex-spawn, gemini, github-copilot-cli).

Acceptance:
- Define the shape in apps/silvercode/src/session-model/session-trace.ts with discriminated unions per outcome.
- Wire it through the ACP session pipe (controller.ts + claude-acp wire.ts) so each turn closes with a SessionTrace event.
- Render it in the side panel "Last turn" hover popover (read-only, debug-flagged at first).
- Tests: fixture-driven — fake ACP session with scripted attempts/fallback; assert the SessionTrace shape post-turn.
- Don't import OpenClaw code — they're MIT but the integration cost is higher than reading the type.
- Cross-reference: apps/silvercode/src/chat/normalize-agent-event.ts (current event shape entry point).
