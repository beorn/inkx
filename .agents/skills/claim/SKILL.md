---
description: Claim an @agent/N hat. Sets assignee + status=wip via DB-side CAS, optionally queue-assigns beads to the hat, and broadcasts on tribe. Required before /do.
argument-hint: "@agent/<N> [<bead-id>...]  (e.g. /claim @agent/3, or /claim @agent/1 @km/silvery/test-harness-via-run-not-createrenderer)"
allowed-tools: Bash, Read, Edit
---

# /claim — claim an @agent/N hat (optionally queue-assign beads)

**Keywords**: claim, agent, hat, slot, assign, lock, queue

The agent-dispatch primitive. Each `/claim @agent/N` acquires a hat via
race-safe DB-side compare-and-swap. Required before `/do` queue mode — without
a claimed hat, there's no slot queue to work.

An `@agent/N` hat is just the claimable pair `@agent/N` + worktree `wtN`. Any
agent can pick it up, wear it for a session, and release it. The hat file is not
a persona prompt.

If we want a personified/specialized agent later, create a named hat such as
`@agent/silvercode-expert` with its own associated worktree. Do not encode that
persona inside one of the generic numeric hats.

Trailing bead-id args **queue-assign** those beads to the claimed hat by writing an `@agent/N` mention into each bead body. The hat's existing materialization rule then auto-picks them into the queue on next sync.

See `@km/agent/sigil-boards` (epic) for the full design.

Hat files are deliberately lean. Do not add frontmatter, persona descriptions,
scope hints, or working agreements to `@agent/N.md`. The expected shape is:

```markdown
# @agent/N km.add:: .

## Queue km.default:: true

![[queued-bead]]
```

## Usage

```
/claim @agent/3                             # claim slot 3 only
/claim @agent/0                             # claim slot 0 only
/claim @agent/1 @km/silvery/test-harness-via-run-not-createrenderer
                                            # claim slot 1 + queue-assign one bead
/claim @agent/1 @km/silvery/foo @km/silvery/bar
                                            # claim slot 1 + queue-assign two beads
```

You can claim multiple hats in one session if you intend to drain multiple
queues — `/do` will pick the highest-priority bead across ALL claimed hats.

**Two distinct mechanics, no overlap**:
- **Hat claim** = lease lock on `@agent/N` (assignee/status metadata, TTL'd) — also locks the matching worktree `.claude/worktrees/wtN/` because **one hat = one worktree**
- **Queue-assign** = persistent mention `@agent/N` in bead body (queue membership)

Don't conflate. `assignee` is the per-bead/per-hat lease; mentions are the queue placement.

**One hat = one worktree.** `@agent/N` is the single lease bead for both the hat
AND the worktree `wtN`. There is no separate `km-wtN` bead — claiming
`@agent/N` IS claiming `wtN`. Releasing one releases the other. Named hats follow
the same rule with an explicit associated worktree.

## What it does (up to five steps)

### 0. Anchor at the vault root

Run slot claims from the main repo root:

```bash
cd "$(git rev-parse --show-toplevel)"
km bd info --paths
```

The reported `repo:` must be the monorepo root that contains `@agent.md` and `@agent/`. Running from an app directory creates a partial view of the vault and makes later `/do` queue discovery unreliable.

### 1. Atomic CAS

```bash
km bd update @agent/<N> --claim
```

Today's lifecycle planner uses DB-side compare-and-swap (`@km/agent/sigil-boards` Phase 1.3): a single SQL `UPDATE` with a `WHERE assignee IS NULL OR assignee = ? OR <lease-expired>` precondition. If 0 rows update, the claim fails with the current holder's identity and lease expiry.

- **Lease semantics**: 20 min for agent-shaped assignees (`claude:*`, `agent-spawn-*`), 24 h for user-shaped assignees. After lease expiry, anyone can re-claim.
- **Self-reclaim is idempotent** — claiming a slot you already hold is a no-op success (refreshes the lease).

### 2. Verify the slot board is lean

```bash
sed -n '1,80p' @agent/<N>.md
```

It should contain only the H1 rule, the `Queue` default section, and optional
`![[bead]]` embeds. If it contains frontmatter, persona text, scope hints, or
working-agreement prose, clean it before proceeding. Do not wrap the hat body
as a `<persona>` prompt; repository steering and the bead body provide the work
context.

### 3. Refresh the matching worktree

The `@agent/N` claim already locks worktree `wtN` (one hat = one worktree). Refresh it per the [worktree skill](../worktree/SKILL.md) so write work starts from a clean rebase:

```bash
cd .claude/worktrees/wt<N>
git fetch origin
git rebase origin/main
git submodule update --recursive
```

Subsequent write work happens in `.claude/worktrees/wt<N>/` on branch `wt<N>`.

If the worktree directory is missing (rare — should be persistent), recreate it:

```bash
git worktree add .claude/worktrees/wt<N> wt<N>
```

### 4. Queue-assign trailing bead args (optional)

If the user passed `<bead-id>...` after `@agent/N`, append the slot mention to each bead's body so the slot's `km.add:: .` materialization picks them up on next sync.

```bash
for bead in <bead-id...>; do
  # Skip if @agent/N already mentioned in bead body (idempotent)
  if ! km bd show "$bead" --plain | grep -qE "@agent/<N>\b"; then
    km bd update "$bead" --notes "@agent/<N>"
  fi
done
```

`--notes` appends a paragraph; the bare `@agent/<N>` token is recognized as a
sigil mention by the markdown link extractor and lands in the canonical links
table as `km:@agent/<N>`. The hat's `km.add:: .` rule resolves that link and
renders the bead as a `![[<bead>]]` embed under `Queue` on next `km sync`.

After queue-assigning beads, verify with the ordinary bd query surface:

```bash
km sync
km bd query @agent/<N>
```

The `km bd agent ...` subgroup is for the older persisted-agent model, not `@agent/N` sigil boards. If `@agent/<N>.md` shows duplicate stale embeds or unrelated `![[sigil-boards]]` / `![[@agent]]` entries, treat that as board materialization drift and use `km bd query @agent/<N>` as the authoritative queue check.

**Idempotent** — re-running `/claim @agent/N <bead>` on a bead already in the hat's queue is a no-op.

There is no `scope_fit` in the hat file. If a queue assignment looks
surprising, rely on the bead path and user intent; do not synthesize or write
hat taxonomy into `@agent/N.md`.

### 5. Tribe broadcast

```bash
bun vendor/bearly/tools/tribe-cli.ts send '*' "claimed @agent/<N> — <session-name>"
```

If beads were also queue-assigned, include them in the broadcast:

```bash
bun vendor/bearly/tools/tribe-cli.ts send '*' "claimed @agent/<N> + queued <count> beads (<short-list>) — <session-name>"
```

Or via the tribe MCP:

```
tribe.send(to="*", message="claimed @agent/<N> — <session>")
```

Lets the chief and peers see who's on which slot without polling.

## On lock failure

If the CAS reports a current holder:

```
Claim failed — @agent/3 held by claude:bjorn-session-x until 2026-05-06T23:45Z (lease 20m, expires in 17m)
```

Options:
- **Wait** — the lease will expire; try again
- **Force-release** (only if you know the holder is dead): `km bd update @agent/<N> --assignee "" --status open` then re-claim
- **Pick a different slot** — `/claim @agent/4` etc.

Don't force-release a live session's slot without coordinating on tribe first.

## Releasing a slot

When you're done with a hat for the session, release it — this releases both
the hat AND the worktree (one hat = one worktree, one lease):

```bash
# Reset the worktree to origin/main
cd .claude/worktrees/wt<N> && git fetch origin && git reset --hard origin/main && git submodule update --recursive

# Release the @agent/N lease (this is the single lease for both hat + worktree)
cd "$(git rev-parse --show-toplevel)"
km bd update @agent/<N> --assignee "" --status open
```

Tribe coordination at session end: `tribe.send(to="*", message="releasing @agent/<N>")`.

The wrapper `km agent spawn` releases automatically on SIGTERM/exit; `/claim` from within an interactive session is your responsibility to release.

## See also

- `@agent.md` — parent board with all 10 slots listed
- `@agent/0..9.md` — lean slot queue boards
- `/do` — work the highest-priority bead from claimed slots
- `km agent spawn @agent/<N>` — out-of-process variant: claim + compose brief + exec the agent runtime
- `@km/agent/sigil-boards` — design + tracking
