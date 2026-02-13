---
description: Pause implementation to discuss architecture, alternatives, or understanding. Use when you want to step back and discuss before coding. Checkpoints context to active bead for safe resumption.
argument-hint: [<topic>|continue|end|history]
allowed-tools: Bash, Read, Glob, Grep, Task, AskUserQuestion
---

# /discuss — Implementation Discussion Mode

## Commands

| Command | Action |
|---------|--------|
| `/discuss <topic>` | Checkpoint → enter discussion mode |
| `/discuss continue` | Restore context → resume implementation |
| `/discuss end` | Synthesize insights → update bead → resume |
| `/discuss history` | Search past discussions via recall |

## `/discuss <topic>` — Start

1. Find active bead: `bd list --status in_progress --assignee "$USER" --limit 1`
2. If bead found: gather state (`git status --short`, `git diff --stat`, current step, metrics), **prepend** checkpoint to bead notes:
   ```
   ## Discussion checkpoint (YYYY-MM-DD)
   - Working tree: <files>
   - Current step: <what was being done>
   - Last metric: <benchmarks if applicable>
   - Next action: <what to do when resuming>
   ```
3. Tell user: `Context checkpointed to <bead-id> (<title>). Ready to discuss: <topic>.`
4. If no bead: `No active bead — discussing freely. /discuss end to capture insights.`

**Discussion mode rules:**
- **Read-only** — explore code to explain, never edit files
- **Concise first** — short answers, elaborate only when asked
- **Show code** — use `file:line` refs, read actual files
- **Tradeoffs** — compare alternatives honestly when asked "why X?"
- **Track decisions** — note what's decided for the `/discuss end` summary
- **No implementation** — if user says "just fix it", remind to `/discuss end` first

## `/discuss continue` — Resume

1. `bd show <id>` — read checkpoint from notes
2. `git status --short` + `git diff --stat` — check working tree
3. Present compact status:
   > **Resuming** `<id>`: <title>
   > **Checkpoint**: <what you were doing>
   > **Working tree**: <changes>
   > **Next**: <action>
4. Proceed with implementation. Discussion mode over.

## `/discuss end` — Wrap Up & Resume

1. **Synthesize** the discussion (structured bullets):
   - Topic, key insight, decisions made, impact on approach
2. **Prepend** outcome to bead notes:
   ```
   ## Discussion: <topic> (YYYY-MM-DD)
   - Key insight: <main takeaway>
   - Decided: <decisions>
   - Impact: <changes to approach, or "none">
   ```
3. **Update related artifacts** — if the discussion changed the approach:
   - Update bead **description/design** (not just notes) to reflect the new plan
   - Update or replace affected phase descriptions, acceptance criteria, approach options
   - If the discussion invalidates prior phases or steps, mark them clearly
   - Update MEMORY.md if a reusable insight emerged
4. Resume implementation (same as `/discuss continue`).

## `/discuss history`

```bash
bun recall "discuss" --since 2w
bun recall "<specific-topic>" --since 2w
```

## Anti-Patterns

- Editing code during discussion — stay read-only
- Long monologues — be concise, ask "want more detail?"
- Skipping synthesis — use `/discuss end`, not bare `/discuss continue`, after deep discussions
- Losing decisions — end summary must capture *what was decided*, not just what was discussed
