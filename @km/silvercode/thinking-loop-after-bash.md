---
mentions:
  - km
  - claude
id: "@km/silvercode/thinking-loop-after-bash"
aliases:
  - km-silvercode.thinking-loop-after-bash
  - km-silvercode-thinking-loop-after-bash
created_by: claude:cd034ca4
created_at: 2026-04-26T23:14:56Z
closed_at: 2026-04-27T00:12:40Z
close_reason: "Both parts shipped: stop-reason fix (e0f425018) + tool-summary (4b28208f8)"
started_at: 2026-04-26T23:17:57Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.thinking-loop-after-bash
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T16:14:56Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] [bug] silvercode keeps thinking ('Stirring...') after bash result — Claude Code stops cleanly @km/silvercode #bug #P2 @claude:cd034ca4

blocks:: [[@km/silvercode]]

Comparison: same prompt 'ls' to both clients.

## Native Claude Code

> ls
> Listed 1 directory
> ● Listed the km repo root.
> (stops)

## silvercode (--agent claude-code via ACP)

> ls
> ls (queued)
> Ran Bash
> AGENTS.md / CHANGELOG.md / CLAUDE.md / ... (full listing inline)
> :: Running...
> ◇ Stirring... (1m 16s)   ← stuck here, agent thinking >76s

User screenshots: ~/Desktop/Screenshot 2026-04-26 at 16.10.45.png + 16.11.59.png

## Two issues

### 1. Verbose tool-result display

silvercode shows the full bash stdout inline as a list. Claude Code summarizes ('Listed 1 directory'). Different tool-result rendering policy — silvercode's <ToolCall> component renders raw payload; should it summarize? Open question.

### 2. Agent doesn't stop when task is complete

Native Claude Code returns stop_reason='end_turn' after the ls result and the UI clears. silvercode shows 'Stirring...' for 76+ seconds — agent is still in the same turn, presumably preparing another tool call or waiting on something.

Possible causes:

- Stop-reason not propagating through wire.ts → @km/claude-acp → silvercode session adapter
- silvercode's session_update handling treats 'end_turn' differently than native Claude Code's CLI
- Different system-prompt encouraging multi-step exploration (less likely for a simple ls)

### Diagnostic

ps shows silvercode PID 56369 at 98.3% CPU for 13min — process is computing, not waiting on I/O. Suggests a busy loop somewhere (possibly stream parsing, incremental render, or signals re-fire). Memory: feedback-perf-triage-load-first.md applies — instrument first.

## Acceptance

- silvercode + Claude Code via ACP returns to idle within ~1s after a simple 'ls'
- 'Stirring...' indicator clears when stop_reason arrives
- Reproduced in tests: ACP probe with --agent claude-code 'ls' completes with stop_reason='end_turn' and idle indicator gone

## Suspect commits

- d1c7d3690 silvercode/@silvery/config adoption
- d17afaa82 silvercode/@km/claude-acp resolution fix
- 08a0989b9 spawn-close-hardening (process management)
- 9c50f59ad permission-handler bridge

## Related

- @km/silvercode/acp-permission-ui-wire (closed today)
- @km/silvercode/acp-claude-acp-loadsession (closed today)

