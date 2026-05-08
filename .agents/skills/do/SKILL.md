---
description: Pick and work the highest-priority bead from any @agent/N slot you've claimed, OR work specific beads passed as args. Composes with /loop for continuous mode. Tribe-broadcasts on bead-pick and bead-close.
argument-hint: "[<bead-id>...] [--once]   (no args: pick from queue; with bead args: work those beads in order)"
allowed-tools: Bash, Read, Edit, Write, Task, TodoWrite
---

# /do — work the next bead from your claimed slots (or specific beads)

**Keywords**: do, work, next, queue, agent, persona, dispatch, bead

The bead-execution primitive. Two modes:
- **Queue mode (no args)** — reads the materialized embed-list from every `@agent/N` slot you've claimed, picks the top-priority bead, claims it, and starts implementing.
- **Direct mode (bead args)** — claims each named bead's lease (`assignee`) in order and works them. Skips the queue-rank step. Useful when you want to work a specific bead without queue-assigning it permanently to a persona slot.

Both modes compose with `/loop` for continuous mode (queue mode runs until the queue empties; direct mode runs until the arg list empties).

See `@km/agent/sigil-boards` (epic) for the full design. **Queue mode requires** at least one slot claimed via `/claim` first; direct mode does not (the bead lease is independent of slot membership).

## Usage

```
/do                                  # queue mode: pick one bead from claimed slots, work it, present results
/do --once                           # explicit single-bead mode (default)
/loop /do                            # queue mode + continuous: pick, work, close, repeat until queue empty
/do @km/silvery/test-harness-via-run-not-createrenderer
                                     # direct mode: work this specific bead (claim its lease + implement)
/do @km/foo @km/bar @km/baz          # direct mode: work all three in order
/loop /do @km/foo @km/bar            # direct mode + continuous: work each, close, then exit
```

**Queue mode vs direct mode**:
- **Queue mode** assumes you want to drain a persona's backlog. The queue is the slot's `![[<bead>]]` embed list, populated by `rules.add` materialization from beads with the slot mention.
- **Direct mode** is "I have a specific bead, work it now". The bead does NOT get queue-assigned (no mention written) — only its lease (`assignee`) is taken. After close the bead is fully released; nothing persists in any slot's queue.

If you want the bead to also live permanently in the slot's queue, use `/claim @agent/N <bead>` (which writes the mention) BEFORE `/do <bead>`. Or just `/claim @agent/N <bead>` alone and let `/do` (queue mode) pick it up next.

## Algorithm — queue mode (no args)

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

## Algorithm — direct mode (`/do <bead-id>...`)

Skip the queue scan. For each bead-id passed as an argument, in order:

### 1. Validate

```bash
km bd show <bead-id> --json | jq '{id, status, assignee}'
```

If the bead doesn't exist: stop with an error. If `status: done` or `status: dropped`: skip and continue. If already in `status: wip` and the assignee is someone else: stop and report (don't race in direct mode — the user named this bead specifically).

### 2. Claim the bead's lease

```bash
km bd update <bead-id> --claim
```

Sets `assignee = <you>` and `status = wip` via the same DB-side CAS as the slot claim. Self-reclaim is idempotent.

If the claim fails (race): stop and report — don't auto-fall-through to the next bead in direct mode. The user explicitly named this bead.

### 3. Tribe broadcast

```bash
tribe.send(to="*", message="working <bead-id> — <title> (direct mode)")
```

Direct mode does NOT mention which slot you're in — the bead isn't queue-assigned to any slot. If you have a slot claimed and want to honor its working agreement, do so by reading your claimed slot's body for context, but the bead itself isn't bound to that slot.

### 4. Implement + close

Same as queue mode steps 6–7. Apply the appropriate workflow (bug / feature / task / epic), honor any persona working agreement from your claimed slot, close with verification SHA and reason.

### 5. Loop (only when invoked via `/loop /do <beads>`)

Move to the next bead in the arg list. Loop terminates when the arg list is empty or any single bead's claim fails.

**Direct mode + scope_fit**: if you have `@agent/N` claimed and the bead's path doesn't match the slot's `scope_fit`, print a warning but proceed — the user named the bead explicitly, so don't block. Use `/claim @agent/N <bead>` (the queue-assign path) if you want scope-fit enforcement.

## Composing with /loop

```
/loop /do
```

`/loop` re-invokes `/do` after each completion until the natural exit conditions above. Use this for unattended runs where you want to drain the queue.

For pace control under cost concerns, use `/loop --interval=300 /do` to throttle to one bead every 5 minutes.

## What `/do` is NOT

- **Not a multi-agent orchestrator** — for spawning multiple personas in parallel, use `km agent spawn @agent/<N>` from a shell.
- **Not silent** — every bead-pick and bead-close broadcasts on tribe so coordination is observable.
- **Direct mode does NOT queue-assign** — passing a bead to `/do` claims its lease for this session and closes it. The bead does not gain an `@agent/N` mention. If you want it to live in the slot's queue durably, use `/claim @agent/N <bead>`.

## See also

- `/claim` — required preceding step (claim one or more `@agent/N` slots)
- `km agent spawn @agent/<N>` — out-of-process variant
- `@agent.md` — parent board, lists all slots
- `@km/agent/sigil-boards` — design + tracking
