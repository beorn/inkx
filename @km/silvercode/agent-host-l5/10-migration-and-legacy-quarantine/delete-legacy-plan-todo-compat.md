---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine.delete-legacy-plan-todo-compat
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine-delete-legacy-plan-todo-compat
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Delete legacy plan/todo compatibility projections #task #P1 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/10-migration-and-legacy-quarantine]]

After phase 06 owns canonical `Plan` and `PlanStep`, delete compatibility projections that keep provider todos or `SessionState.todos` as a second source of truth.

## Current State

Measured 2026-05-08:

- App-level `AgentPlanEntry`, `ChatPlanTask`, `ChatPlanEntry`, `SessionState.todos`, and `todos.*compat` hits are now zero after the Plan drawer cutover to projected `ChatPlan`.
- The deeper deletion is not done: `@km/agent-harness` still exposes `AgentPlan*`, `SessionState.plan`, and `SessionState.todos`, and the reducer still mirrors provider plan updates into compatibility todos.
- `/arch` is required before deleting or renaming the public `@km/agent-harness` plan/todo API or the core `SessionState` data model.

## Refactor Phases

1. App projection cutover: render `Chat.PlanDrawer` from canonical projected `ChatPlan`; keep provider `TodoWrite` only as parser input.
2. `/arch` decision: choose the public harness naming and migration shape for `Plan` / `PlanStep` vs `AgentPlan*`, and for deleting `SessionState.todos`.
3. Delete todo compatibility state: remove `Todo`, `MessageEntry.todos`, `WritableEntry.todos`, `SessionState.todos`, `extractTodos`, `todoStatusFromPlan`, `todosFromPlan`, and all `next.todos` writes/copies.
4. Delete legacy plan names: remove `AgentPlan*` public exports/imports once the harness model is renamed or replaced by the canonical plan model.
5. Delete raw-todo renderer/doc remnants: remove `todoToolTitle`, “Updated todos” transcript summaries, and docs/tests describing compatibility todos.

## Complete Criteria

- `rg -n "\\bAgentPlan[A-Za-z]*\\b|SessionState\\.todos|\\b(state|liveState|next)\\??\\.todos\\b|\\btodos\\?: Todo\\[]|\\btodos: Todo\\[]|todosFromPlan|extractTodos|todoStatusFromPlan|compatibility todos|Compatibility projection|ChatPlanTask|ChatPlanEntry" apps/silvercode/src apps/silvercode/packages/agent-harness/src apps/silvercode/packages/agent-harness/tests apps/silvercode/tests apps/silvercode/docs --glob '!tests/eval/fixtures/*.b64'` returns zero live-path hits except provider parser input fixtures.
- Plan rendering, drawer state, transcript plan updates, and provider conformance all read from canonical `Plan`.
