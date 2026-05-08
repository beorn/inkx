---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine.delete-legacy-plan-todo-compat
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine-delete-legacy-plan-todo-compat
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Delete legacy plan/todo compatibility projections #task #P1 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/10-migration-and-legacy-quarantine]]

After phase 06 owns canonical `Plan` and `PlanStep`, delete compatibility projections that keep provider todos or `SessionState.todos` as a second source of truth.

## Complete Criteria

- `rg -n "SessionState\\.todos|todos.*compat|AgentPlanEntry|ChatPlanTask|ChatPlanEntry" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero live-path hits except provider parser input fixtures.
- Plan rendering, drawer state, transcript plan updates, and provider conformance all read from canonical `Plan`.
