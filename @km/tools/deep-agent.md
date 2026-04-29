---
id: "@km/tools/deep-agent"
aliases:
  - km-tools.deep-agent
  - km-tools-deep-agent
created_at: 2026-02-08T08:22:46Z
closed_at: 2026-02-08T08:23:49Z
---

# [x] Deep research via subagent: agent sleep-polls instead of using TaskOutput @km/tools #bug #P2 @claude:a3625ec3

## Bug

When /deep is invoked via a Task subagent, the subagent doesn't have the skill context and uses wrong patterns:
1. Tries stdin pipe (wrong — llm reads from args)
2. Uses --output - (wrong — streams to background task stdout, unretrievable)
3. Sleep-polls instead of using TaskOutput(block=true)
4. Wastes all turns on sleep+wc cycles, gets killed by user

The deep research completes successfully but the agent never reads the result.

## Root Cause

The SKILL.md docs have the correct pattern but it's in a "Background Execution" section that agents don't read. Also, when a parent session delegates to a subagent, the subagent doesn't get the skill context loaded.

## Fix

1. Make the SKILL.md more prominent about the correct foreground pattern for subagents
2. Add an anti-pattern warning about --output -
3. Recommend foreground execution with long timeout (simplest pattern)