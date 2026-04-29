---
id: "@km/silvercode/acp-adapter-claude"
aliases:
  - km-silvercode.acp-adapter-claude
  - km-silvercode-acp-adapter-claude
created_by: claude:cd034ca4
created_at: 2026-04-26T08:11:35Z
closed_at: 2026-04-26T09:57:05Z
close_reason: "Shipped spawnClaudeAcpSession convenience wrapper composing
  existing spawnClaude (subscription-auth-inheriting subprocess + stream-json
  parser) with createAcpSession (signals over silvercode canonical ACP-shaped
  types). Identity-by-composition — no new mapping logic; existing tests for
  both halves carry forward. Added 9 end-to-end tests in
  tests/acp-adapter-claude.test.ts that mock node:child_process and feed canned
  JSONL through the full pipe (canned bytes → splitter → parser → AgentEvent →
  applyEvent → ACP signals); covers session-init, streaming text deltas,
  tool_use+tool_result, TodoWrite→plan, scope-dispose teardown, and explicit
  verification that subscription-auth env (CLAUDE_CODE_OAUTH_TOKEN) passes
  through to the child process via spawn's existing { ...process.env,
  ...opts.env } merge. spawn.ts unchanged (env passthrough was already correct).
  Files: src/acp-adapter-claude.ts (new, 73 LOC),
  tests/acp-adapter-claude.test.ts (new, 410 LOC), src/index.ts (append
  spawnClaudeAcpSession + SpawnClaudeAcpOpts), CLAUDE.md (new section
  documenting subscription-auth path and migration). All 131 agent-harness tests
  pass; bun fix clean on new files; tsc clean (no new errors)."
started_at: 2026-04-26T09:52:15Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-adapter-claude
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:11:35Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-adapter-claude
    depends_on_id: km-silvercode.acp-session
    type: blocks
    created_at: 2026-04-26T01:11:35Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] ACP adapter — Claude Code stream-json → SessionUpdate @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session]]

Stream-json → silvercode ACP-shaped types. The CANONICAL path for Claude with Pro/Max subscription auth (Anthropic's claude-agent-acp explicitly blocks subscriptions at session-init).

## Decision: Option C — internal first, extract later (user-confirmed 2026-04-26)

Start internal: ~few-hundred-LOC stream-json → ACP-types adapter inside silvercode's process. Spawns claude -p --output-format stream-json --include-partial-messages, parses JSONL, emits silvercode's ACP-shaped types directly. No extra child process, no extra npm package. silvercode components see ACP-typed events from day 1.

If it stabilizes and external consumers want it, extract to silvercode-claude-acp as a published npm package without changing silvercode's consumption path (~50 LOC of AgentSideConnection wrapping). Preserves option value.

## Why this is the canonical path (not a fallback)
- @agentclientprotocol/claude-agent-acp@0.31.0 (Zed-published, in Registry as 'claude-acp') BLOCKS subscriptions: dist/acp-agent.js:1360 throws 'This integration does not support using claude.ai subscriptions.' when account.subscriptionType is set
- Two binary-wrap alternatives exist but are abandoned: claude-code-acp@0.1.1 (carlrannaberg/cc-acp, 1★, 8 months stale), claude-code-acp-agent@0.1.0 (single version, abandoned)
- All active forks of claude-agent-acp inherit the subscription block
- Silvercode subscription users have no maintained ACP option — must build

## Subscription auth path (verified)
Spawning claude binary directly inherits Claude Code's full auth gate:
- CLAUDE_CODE_OAUTH_TOKEN if set (Pro/Max)
- ANTHROPIC_API_KEY if set (API billing)
- ~/.claude/auth.json fallback (whatever 'claude login' set up)

## Mapping (stream-json → ACP)
- system/init → session.id signal (sessionId from msg.session_id)
- assistant text chunk → SessionUpdate.agent_message_chunk
- assistant thinking → SessionUpdate.agent_thought_chunk
- tool_use → SessionUpdate.tool_call (status: pending)
- tool_result → SessionUpdate.tool_call_update (status: completed)
- result → PromptResponse { stopReason }
- partial_message → repeated agent_message_chunk
- compaction → ExtNotification (no native ACP equivalent)

## Reference for prior art
carlrannaberg/cc-acp source confirms binary-wrap subscription path works (substrings: 'Validating Claude Code subscription authentication', 'subscription authentication validated successfully', 'subscription login or CLAUDE_API_KEY'). Read repo before building, don't depend on npm package.

## Reference
hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Recommended path — internal-first, extract later