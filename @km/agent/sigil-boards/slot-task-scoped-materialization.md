---
aliases:
  - km-agent.sigil-boards.slot-task-scoped-materialization
  - km-agent-sigil-boards-slot-task-scoped-materialization
created_at: 2026-05-08T20:45:38.116Z
---

# Agent slot files use task-scoped queue materialization @km/agent #task @agent/3 #P1

The agent slot implementation now uses km.add:: type:task . km.default:: true, but the agent-dispatch beads/docs still describe the old broad km.add:: . rule. Acceptance: update @km/agent/sigil-boards and @km/agent/slot-files-minimal-form to state the task-scoped rule; verify @agent/0..9 are lean queue-only files; km bd query @agent/3 and subsequent materialization do not create doc/prose embeds; docs explain that query is source of truth and materialized embeds are a task-only convenience.
