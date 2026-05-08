---
description: Pick and work the highest-priority bead from any @agent/N hat you've claimed, OR work specific beads passed as args. Composes with /loop for continuous mode. Tribe-broadcasts on bead-pick and bead-close.
argument-hint: "[<bead-id>...] [--once]   (no args: pick from queue; with bead args: work those beads in order)"
allowed-tools: Bash, Read, Edit, Write, Task, TodoWrite
---

# /do — work the next bead from your claimed hats (or specific beads)

**Keywords**: do, work, next, queue, agent, slot, dispatch, bead

The bead-execution primitive. Two modes:
- **Queue mode (no args)** — queries every `@agent/N` hat you've claimed, picks the top-priority bead, claims it, and starts implementing.
- **Direct mode (bead args)** — claims each named bead's lease (`assignee`) in order and works them. Skips the queue-rank step. Useful when you want to work a specific bead without queue-assigning it permanently to a hat.

Both modes compose with `/loop` for continuous mode (queue mode runs until the queue empties; direct mode runs until the arg list empties).

See `@km/agent/sigil-boards` (epic) for the full design. **Queue mode requires** at least one slot claimed via `/claim` first; direct mode does not (the bead lease is independent of slot membership).

Hat files are deliberately lean. Do not parse persona text from `@agent/N.md`,
and do not add frontmatter, descriptions, scope hints, or working agreements to
hat files. A hat board should contain only:

```markdown
# @agent/N km.add:: . km.default:: true

![[queued-bead]]
```

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
- **Queue mode** assumes you want to drain a hat backlog. The queue source of truth is `km bd query @agent/N`; any `![[<bead>]]` embed list in `@agent/N.md` is only the persisted debug view populated by `km.add:: .`.
- **Direct mode** is "I have a specific bead, work it now". The bead does NOT get queue-assigned (no mention written) — only its lease (`assignee`) is taken. After close the bead is fully released; nothing persists in any slot's queue.

If you want the bead to also live permanently in the slot's queue, use `/claim @agent/N <bead>` (which writes the mention) BEFORE `/do <bead>`. Or just `/claim @agent/N <bead>` alone and let `/do` (queue mode) pick it up next.

## Algorithm — queue mode (no args)

### 0. Anchor at the vault root

Run queue-mode bead operations from the main repo root, not an app subdirectory:

```bash
cd "$(git rev-parse --show-toplevel)"
km bd info --paths
```

The reported `repo:` must be the monorepo root that contains `@agent.md` and `@agent/`. If it points at `apps/silvercode` or another package, stop and re-run from the root. Otherwise `km bd` and `km sync` will see a partial vault and `/do` will miss the slot queues.

### 1. Determine claimed slots

Use ordinary `km bd` commands. Do not use the legacy `km bd agent ...` subgroup for `@agent/N` sigil boards.

If the runtime set `KM_AGENT_SLOT`, start there:

```bash
echo "$KM_AGENT_SLOT"
km bd show @agent/<N>
```

If `KM_AGENT_SLOT` is unset, list your claimed work and look for the `@agent/` entries:

```bash
km bd list --status wip --assignee me --limit 200
km bd list --status wip --assignee me --json --limit 500 \
  | jq -r '.[] | select(.fs_path | test("^@agent/[0-9]+\\.md$")) | .data.id'
```

There is no stable `km whoami` command in the current CLI. Do not invent one in scripts. If ownership is ambiguous, stop and ask rather than draining another session's queue.

If zero hats are claimed: **stop**. Tell the user "no hats claimed — run `/claim @agent/<N>` first." Don't guess a hat.

### 2. Read each slot's queue

The canonical queue read is a normal bd query for beads that mention the hat:

```bash
km bd query @agent/<N>
```

Exclude the hat bead itself from work candidates. If the query returns only `@agent/<N> — ...`, the queue is empty.

The markdown board body is a debug view, not the source you should parse first.
If `cat @agent/<N>.md` shows repeated non-work embeds such as
`![[sigil-boards]]`, `![[@agent]]`, persona text, frontmatter, or scope hints,
treat that as board drift and report/clean it; do not fall back to global
`km bd ready`.

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

Honor repository steering from `AGENTS.md`, `CLAUDE.md`, package-local docs, and
the bead itself. The hat board is not a persona prompt.

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

Direct mode does NOT mention which slot you're in — the bead isn't queue-assigned to any slot.

### 4. Implement + close

Same as queue mode steps 6–7. Apply the appropriate workflow (bug / feature /
task / epic), close with verification SHA and reason.

### 5. Loop (only when invoked via `/loop /do <beads>`)

Move to the next bead in the arg list. Loop terminates when the arg list is empty or any single bead's claim fails.

**Direct mode + hat fit**: the hat file carries no `scope_fit`. Use the bead
path, current user request, and repository steering to decide whether the work
belongs in this session. If the user named the bead explicitly, don't block on a
missing hat taxonomy.

## Composing with /loop

```
/loop /do
```

`/loop` re-invokes `/do` after each completion until the natural exit conditions above. Use this for unattended runs where you want to drain the queue.

For pace control under cost concerns, use `/loop --interval=300 /do` to throttle to one bead every 5 minutes.

## What `/do` is NOT

- **Not a multi-agent orchestrator** — for spawning multiple workers in parallel, use `km agent spawn @agent/<N>` from a shell.
- **Not silent** — every bead-pick and bead-close broadcasts on tribe so coordination is observable.
- **Direct mode does NOT queue-assign** — passing a bead to `/do` claims its lease for this session and closes it. The bead does not gain an `@agent/N` mention. If you want it to live in the slot's queue durably, use `/claim @agent/N <bead>`.

## See also

- `/claim` — required preceding step (claim one or more `@agent/N` hats)
- `km agent spawn @agent/<N>` — out-of-process variant
- `@agent.md` — parent board, lists all slots
- `@km/agent/sigil-boards` — design + tracking
