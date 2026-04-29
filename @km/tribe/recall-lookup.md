---
id: "@km/tribe/recall-lookup"
aliases:
  - km-tribe.recall-lookup
  - km-tribe-recall-lookup
created_by: claude:4de4a3ab
created_at: 2026-04-27T23:11:04Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-lookup
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T16:11:05Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Mem lookup (Tier 1): polish tribe.ask MCP tool descriptions for ACP-spawned agents @km/tribe #task #P3

blocks:: [[@km/tribe]]

# Tier 1 — mem lookup

Already shipping as tribe.ask / tribe.brief / tribe.plan MCP tools in vendor/bearly/plugins/tribe.

Scope of this bead: optional polish — improve tool descriptions and add a system-prompt fragment so spawned ACP agents (Claude/Codex/Gemini) discover and use the tool reliably when they sense missing context.

## Acceptance

- tribe.ask MCP tool description rewritten to be agent-action-oriented ('call when you mention an identifier you want background on')
- System-prompt fragment added to silvercode: '/Users/beorn/Code/pim/km/apps/silvercode/src/system-prompt.ts' or equivalent
- Telemetry: log tribe.ask invocations per session to evaluate adoption

## Defer reasoning

Optional. The tool already works; this bead is about discoverability tuning. Land after recall-thought v1 ships.