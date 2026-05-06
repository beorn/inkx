---
description: Pick and work the highest-priority bead from any @agent/N slot you've claimed. Composes with /loop for continuous mode. Tribe-broadcasts on bead-pick and bead-close.
argument-hint: "[--once]   (default: pick one bead, work it, return; with /loop, repeats until queue empty)"
allowed-tools: Bash, Read, Edit, Write, Task, TodoWrite
---

# /do — work the next bead from your claimed slots

**Keywords**: do, work, next, queue, agent, persona, dispatch

The bead-execution primitive. Reads the materialized embed-list from every `@agent/N` slot you've claimed, picks the top-priority bead, claims it, and starts implementing. Composes with `/loop` for continuous run-until-empty mode.

See `@km/agent/sigil-boards` (epic) for the full design. Requires at least one slot claimed via `/claim` first.

## Usage

```
/do            # pick one bead, work it, present results
/do --once     # explicit single-bead mode (default)
/loop /do      # continuous: pick, work, close, repeat until queue empty
```

## Algorithm

### 1. Determine claimed slots

Find all `@agent/N` boards where you (this session) are the assignee:

```bash
km bd query "id:@agent/* assignee:$(km whoami 2>/dev/null || echo claude:$KM_SESSION_ID) status:wip" --json
```

(`KM_SESSION_ID` is set by the tribe daemon; `km whoami` resolves to the actor pattern used by `--claim`.)

If zero slots are claimed: **stop**. Tell the user "no slots claimed — run `/claim @agent/<N>` first." Don't guess a slot.

### 2. Read each slot's queue

The board body contains the `rules.add`-materialized embeds:

```bash
cat @agent/<N>.md
```

Look for the `## Queue` section (or just any `![[<bead>]]` embeds in the body). Each `![[<id>]]` is a candidate.

### 3. Rank candidates

Across all claimed slots, rank by:
1. **Priority** (P0 → P4; lower number = higher priority)
2. **Path-form id** ASC as tiebreak (deterministic)
3. **Skip** any candidate already in `status: wip` or `status: done`

```bash
# For each candidate id from the board queues:
km bd show <id> --json | jq '{id, priority, status}'
```

Pick the top candidate. If the queue is empty across all slots: **stop**. Report "queue empty for claimed slots: @agent/X, @agent/Y" and exit.

### 4. Claim the bead

```bash
km bd update <bead-id> --claim
```

If the claim fails (race against another session): pick the next candidate. After 3 consecutive race-failures, stop and report — the queue is contended, time to investigate manually.

### 5. Tribe broadcast

```bash
tribe.send(to="*", message="working <bead-id> — <title> (slot @agent/<N>)")
```

### 6. Implement

Load the bead:
```bash
km bd show <bead-id>
```

The bead's body has the description, acceptance criteria, and any sub-tasks. Apply the appropriate workflow:
- **Bug** → load `.claude/skills/pm/workflows/bugs.md` (reproduce-first, failing-test-first)
- **Feature** → load `.claude/skills/pm/workflows/features.md` (assess, plan, TDD)
- **Task** → load `.claude/skills/pm/workflows/tasks.md`
- **Epic with sub-task checklist** → walk the `- [ ]` items inline; close each as you complete it; close the epic when all checked

Honor the persona's working agreement (read from your claimed slot's body). E.g., `@agent/1` (silvery-engineer) requires STRICT tests before pipeline changes.

### 7. Close the bead

```bash
km bd close <bead-id> --reason "<what + verification SHA>"
```

Then broadcast:
```bash
tribe.send(to="*", message="closed <bead-id> — <reason summary>")
```

### 8. Loop (only when invoked via `/loop /do`)

Return to step 1. The loop terminates when:
- Queue is empty across all claimed slots
- A claim races 3 times in a row
- A bead requires user input (paused, not failed — broadcast and wait)
- Explicit `/loop --stop` from the user

## Composing with /loop

```
/loop /do
```

`/loop` re-invokes `/do` after each completion until the natural exit conditions above. Use this for unattended runs where you want to drain the queue.

For pace control under cost concerns, use `/loop --interval=300 /do` to throttle to one bead every 5 minutes.

## What `/do` is NOT

- **Not a generic "work on the next bead" command** — it ONLY pulls from the claimed `@agent/N` queue. To work an arbitrary bead, use `/pm work <id>` directly.
- **Not a multi-agent orchestrator** — for spawning multiple personas in parallel, use `km agent spawn @agent/<N>` from a shell.
- **Not silent** — every bead-pick and bead-close broadcasts on tribe so coordination is observable.

## See also

- `/claim` — required preceding step (claim one or more `@agent/N` slots)
- `km agent spawn @agent/<N>` — out-of-process variant
- `@agent.md` — parent board, lists all slots
- `@km/agent/sigil-boards` — design + tracking
