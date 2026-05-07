---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-comp-stories"
aliases:
  - km-silvercode.acp-comp-stories
  - km-silvercode-acp-comp-stories
created_by: claude:cd034ca4
created_at: 2026-04-26T22:10:10Z
closed_at: 2026-04-26T22:43:39Z
close_reason: Closed
started_at: 2026-04-26T22:11:58Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-comp-stories
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T15:10:38Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.acp
---

# [x] silvercode storybook — missing stories for ACP component family @km/silvercode #task #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]]

Wave B (acp-session-update-list, acp-session-prompt, acp-usage-and-permission) shipped 6 new components without storybook stories. Each needs at least one v0 story so the components are visually verifiable and don't regress.

## Missing stories

- SessionPromptComposer — composer with sample text, slash, mention picker
- SessionPromptHistory — history entries scrollback
- UsageMeter — context-window meter with realistic usage values + UsageBreakdown + UsageMetrics + StructuredQuestion + StructuredAnswer (5 sub-components)
- SessionExchangeDivider — between two exchanges
- SessionRetry — failed exchange with retry affordance
- SubagentActivityPanel — nested SessionUpdate stream (collapsed + expanded variants)

## Acceptance

- 1+ story per component file at apps/silvercode/storybook/stories/<Component>.<variant>.story.tsx
- Each story registered in apps/silvercode/storybook/registry.ts
- `bun run silvercode storybook` displays each without errors
- `rg ToolCall|RequestPermissionInbox apps/silvercode/storybook/stories/` returns matching lines (existing pattern, copy structure)

## Reference

Existing patterns: SessionUpdateList.{empty,multi-turn}.story.tsx, ToolCall.{read,edit,execute,failed}.story.tsx, ApplyPatch.story.tsx

