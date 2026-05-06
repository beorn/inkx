---
mentions:
  - km
  - claude
id: "@km/infra/vitest-zombies"
aliases:
  - km-infra.vitest-zombies
  - km-infra-vitest-zombies
created_by: claude:fcaad2fa
created_at: 2026-02-18T16:05:07Z
closed_at: 2026-02-19T08:38:09Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Vitest worker processes become zombies when agents are stopped @km/infra #bug #P0 @claude:36393b5d

## Problem

When Claude Code sub-agents (Task tool) are stopped via TaskStop, their spawned vitest child processes (forks.js workers) are NOT killed. These orphaned processes continue running indefinitely at 30-60% CPU each, accumulating until the system becomes unusable.

## Observed Impact (session 0218d)

- **15 zombie vitest worker processes** consuming ~450% combined CPU
- Processes running 20-50+ minutes after agents were stopped
- System became extremely sluggish — user reported 'things are very slow'
- Had to manually `pkill -9 -f vitest` to recover

## Root Cause Hypothesis

`TaskStop` kills the agent process but not its process tree. Vitest forks worker processes that survive the parent's termination. The node parent (`vitest run`) may also survive.

## Process Tree

```
Claude Code agent (Task tool)
  └── node vitest run ...
        └── bun vitest/dist/workers/forks.js  (SURVIVES after agent stop)
        └── bun vitest/dist/workers/forks.js  (SURVIVES after agent stop)
        └── ...
```

## Investigation Needed

1. How does TaskStop terminate agents? Signal? Process group?
2. Does vitest use `detached: true` or `unref()` on workers?
3. Can we add a cleanup hook (e.g., process.on('exit')) to kill child processes?
4. Should we use process groups (`setsid`) so the entire tree can be killed?
5. Is this a Claude Code issue (should kill process tree) or a vitest config issue?

## Workaround

```bash
pkill -9 -f 'vitest.*forks.js'
pkill -9 -f 'vitest run'
```

