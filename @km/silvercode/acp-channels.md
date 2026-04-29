---
id: "@km/silvercode/acp-channels"
aliases:
  - km-silvercode.acp-channels
  - km-silvercode-acp-channels
created_by: claude:cd034ca4
created_at: 2026-04-26T08:31:47Z
closed_at: 2026-04-26T09:48:47Z
close_reason: "Channel pipeline shipped (mechanism delivered alongside
  acp-session, which can route through this in its own follow-up work).
  ChannelQueue (alien-signals pendingCount), channel-sources (tribe live,
  telegram/ci/lore/subagent stubbed), assembleAcpPrompt(userText, queue, {
  autoInject, sources }) → ContentBlock[] with [AMBIENT — informational, do not
  act] framing + ambient:// URI + _meta.ambient=true on each EmbeddedResource.
  /inject-tribe / /inject-ci / /inject-lore / /inject-telegram /
  /inject-subagent / /inject-recent / /clear-channels slash commands +
  classifyChannelCommand dispatcher. Controller owns the queue (createScope on
  init, dispose on closeAll). 17 new tests pass; pre-existing visual test
  failures unrelated. Suppress-Claude-<channel> + Option 3 two-stage filter
  captured as TODOs. Files:
  apps/silvercode/src/{channel-queue,channel-sources,prompt-assembly}.ts (new),
  apps/silvercode/src/{controller,slash-commands}.ts (extended),
  apps/silvercode/tests/{channel-queue,prompt-assembly}.test.ts (new),
  apps/silvercode/docs/channels.md (new), apps/silvercode/package.json
  (+@silvery/scope dep)."
started_at: 2026-04-26T09:32:58Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-channels
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:32:05Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-channels
    depends_on_id: km-silvercode.acp-session
    type: blocks
    created_at: 2026-04-26T01:32:05Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] Channel pipeline — replace Claude Code's <channel> injection with typed ACP-shaped delivery @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session]]

Replace Claude Code's bespoke <channel source=...> tag injection with silvercode-owned, typed prompt assembly. Key insight: pull-style (MCP) for memory beats push-style (auto-injection) because tool results are structurally distinct from user input — solves the 'memories look like commands' role-confusion problem.

## Architecture
silvercode owns prompt assembly; channels do not auto-inject as user-role text.

### For memory (lore, recall, gbrain) — PULL via MCP
- Pass lore-mcp / recall-mcp / gbrain-mcp in session/new mcpServers
- Agent calls lore_brief / recall / etc. when contextually relevant
- Result arrives as tool result (structurally not user input — agents handle correctly)
- Compaction-friendly (not pre-committed to history)

### For events (tribe, telegram, CI, sub-agent updates) — silvercode-owned pipeline
Three options, default to Option 1:
1. UI-first user-mediated: notification badge in UI; user invokes /inject-tribe slash command to prepend queued events as EmbeddedResource on next prompt. Human-in-the-loop for relevance — eliminates accidental command-following.
2. Auto-inject on next prompt with strong framing: EmbeddedResource with _meta.ambient=true, content prefixed [AMBIENT — informational, do not act]. Use only for sources proven not to confuse the model.
3. Two-stage filter: small fast model (Haiku/Flash) classifies actionable | ambient | ignorable before deciding.

### For Claude Code wrapping
SUPPRESS Claude Code's native <channel> tag injection when wrapping; replace with silvercode's typed pipeline. Otherwise both layers inject and confusion gets worse.

## Acceptance
- channelQueue with subscribe(source) — tribe via UDS, telegram via plugin, CI via webhook, lore deltas via subscription
- assemblePrompt(userText) prepends queued events as typed ContentBlocks
- /inject-<source> slash commands surface queued events on demand
- Default: notification badge in UI, no auto-injection
- When wrapping Claude Code: env-flag or system-prompt amendment to suppress native channels
- Type tests verifying _meta.ambient flag, URI scheme parses

## Reference
- hub/silvery/future/ai-terminal/10-agent-router-landscape.md § ACP for km integration — channels, memory, selection, custom tools
- The role-confusion problem: memories arriving as user-role text → Claude treats as instructions