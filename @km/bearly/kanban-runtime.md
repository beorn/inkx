---
mentions:
  - km
id: "@km/bearly/kanban-runtime"
aliases:
  - km-bearly.kanban-runtime
  - km-bearly-kanban-runtime
created_by: claude:fa4168d9
created_at: 2026-04-23T02:38:37Z
closed_at: 2026-04-23T02:44:17Z
close_reason: Shipped in bearly ca6b56d + km 4f9edbd67. Listener at
  vendor/bearly/tools/lib/hooks/listeners/kanban-bridge.ts with DI seam
  (createKanbanBridge), event mapping per bead description, timeoutMs 200 safety
  cap, spawn failures swallowed so kanban-down never propagates to agent loop.
  10/10 tests pass. User activates by copying to ~/.claude/hooks.d/.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.kanban-runtime
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-22T19:38:36Z
    created_by: claude:fa4168d9
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Kanban-bridge listener — forward events to Cline Kanban @km/bearly #feature #P3

blocks:: [[@km/infra]]

Implement a listener at \`vendor/bearly/tools/lib/hooks/listeners/kanban-bridge.ts\` (or similar) that forwards bearly hook router events to \`kanban hooks notify\`. Makes km appear as a first-class runtime on any Cline Kanban board.

## Mapping

- \`session_start\` → \`kanban hooks notify --event to_in_progress --source km\`
- \`user_prompt_submit\` → \`kanban hooks notify --event to_in_progress --source km\`
- \`pre_tool_use\` / \`post_tool_use\` / \`subagent_stop\` → \`kanban hooks notify --event activity --source km\`
- \`stop\` → \`kanban hooks notify --event to_review --source km\`
- \`permission_request\` / \`notification[permission_prompt]\` → \`kanban hooks notify --event to_review --source km\`

## Acceptance

- [ ] Listener file exists, registered in the loader
- [ ] Unit test: listener handle() fires \`kanban hooks notify\` with correct args
- [ ] Smoke test: \`tribe hook ingest --event session_start --source km\` triggers kanban notify (when kanban server is running)
- [ ] Listener gracefully skips when \`kanban\` binary not installed
- [ ] Docs: how to enable the listener (drop file in \`~/.claude/hooks.d/\` OR ship as built-in)

