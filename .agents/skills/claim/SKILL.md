---
description: Claim an @agent/N persona slot. Sets assignee + status=wip via DB-side CAS, reads slot body into session context as <persona> envelope, broadcasts on tribe. Optional trailing bead IDs queue-assign those beads to the slot. Required before /do.
argument-hint: "@agent/<N> [<bead-id>...]  (e.g. /claim @agent/3, or /claim @agent/1 @km/silvery/test-harness-via-run-not-createrenderer)"
allowed-tools: Bash, Read, Edit
---

# /claim — claim an @agent/N persona slot (optionally queue-assign beads)

**Keywords**: claim, agent, persona, slot, assign, lock, queue

The agent-dispatch primitive. Each `/claim @agent/N` acquires a persona slot via race-safe DB-side compare-and-swap, then loads the slot's body into session context. Required before `/do` — without a claimed slot, there's no queue to work.

Trailing bead-id args **queue-assign** those beads to the claimed slot by writing an `@agent/N` mention into each bead body. The slot's existing materialization rule then auto-picks them into the queue on next sync.

See `@km/agent/sigil-boards` (epic) for the full design.

## Usage

```
/claim @agent/3                             # claim slot 3 only
/claim @agent/0                             # claim slot 0 only
/claim @agent/1 @km/silvery/test-harness-via-run-not-createrenderer
                                            # claim slot 1 + queue-assign one bead
/claim @agent/1 @km/silvery/foo @km/silvery/bar
                                            # claim slot 1 + queue-assign two beads
```

You can claim multiple slots in one session if you intend to work multiple personas — `/do` will pick the highest-priority bead across ALL claimed slots.

**Two distinct mechanics, no overlap**:
- **Slot claim** = lease lock on `@agent/N` (frontmatter `assignee`, TTL'd) — also locks the matching worktree `.claude/worktrees/wtN/` because **one agent = one worktree**
- **Queue-assign** = persistent mention `@agent/N` in bead body (queue membership)

Don't conflate. `assignee` is the per-bead/per-slot lease; mentions are the queue placement.

**One agent = one worktree.** `@agent/N` is the single lease bead for both the persona slot AND the worktree `wtN`. There is no separate `km-wtN` bead — claiming `@agent/N` IS claiming `wtN`. Releasing one releases the other.

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

### 2. Read the persona body

```bash
cat @agent/<N>.md
```

The `<persona>...</persona>` body becomes session context. It includes:
- Persona description (engineering style, expertise areas)
- Working agreement (test-first rules, conventions for the slot)
- The materialized queue (`![[bead]]` embeds — automatically populated by `rules.add` on sync)

Wrap the body content in `<persona>...</persona>` tags when injecting into your context — this signals to downstream `/do` runs that you're operating under that persona's working agreement.

### 3. Refresh the matching worktree

The `@agent/N` claim already locks worktree `wtN` (one agent = one worktree). Refresh it per the [worktree skill](../worktree/SKILL.md) so write work starts from a clean rebase:

```bash
cd .claude/worktrees/wt<N>
git fetch origin
git rebase origin/main
git submodule update --recursive
```

Subsequent write work happens in `.claude/worktrees/wt<N>/` on branch `wt<N>`. The persona `<scope_fit>` is enforced inside this worktree.

If the worktree directory is missing (rare — should be persistent), recreate it:

```bash
git worktree add .claude/worktrees/wt<N> wt<N>
```

### 4. Queue-assign trailing bead args (optional)

If the user passed `<bead-id>...` after `@agent/N`, append the slot mention to each bead's body so the slot's `rules.add` materialization picks them up on next sync.

```bash
for bead in <bead-id...>; do
  # Skip if @agent/N already mentioned in bead body (idempotent)
  if ! km bd show "$bead" --plain | grep -qE "@agent/<N>\b"; then
    km bd update "$bead" --notes "@agent/<N>"
  fi
done
```

`--notes` appends a paragraph; the bare `@agent/<N>` token is recognized as a sigil mention by the markdown link extractor and lands in the canonical links table as `km:@agent/<N>`. The slot's materialization rule resolves that link and renders the bead as a `![[<bead>]]` embed in the slot body on next `km sync`.

After queue-assigning beads, verify with the ordinary bd query surface:

```bash
km sync
km bd query @agent/<N>
```

The `km bd agent ...` subgroup is for the older persisted-agent model, not `@agent/N` sigil boards. If `@agent/<N>.md` shows duplicate stale embeds or unrelated `![[sigil-boards]]` / `![[@agent]]` entries, treat that as board materialization drift and use `km bd query @agent/<N>` as the authoritative queue check.

**Idempotent** — re-running `/claim @agent/N <bead>` on a bead already in the slot's queue is a no-op.

**Reject mismatched scope** — before writing the mention, check the bead's path against the slot's `scope_fit`. Example: `@agent/1` (silvery-engineer) has `scope_fit: [vendor/silvery, "@km/silvery"]`; assigning `@km/silvercode/foo` should print a warning and require an explicit `--force` (skip the warning if the user passed `--force`). Don't silently mis-place beads.

### 5. Tribe broadcast

```bash
bun vendor/bearly/tools/tribe-cli.ts send '*' "claimed @agent/<N> — <persona-name> — <session-name>"
```

If beads were also queue-assigned, include them in the broadcast:

```bash
bun vendor/bearly/tools/tribe-cli.ts send '*' "claimed @agent/<N> + queued <count> beads (<short-list>) — <persona-name> — <session-name>"
```

Or via the tribe MCP:

```
tribe.send(to="*", message="claimed @agent/<N> — <persona-name> — <session>")
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

When you're done with a persona for the session, release the slot — this releases both the persona AND the worktree (one agent = one worktree, one lease):

```bash
# Reset the worktree to origin/main
cd .claude/worktrees/wt<N> && git fetch origin && git reset --hard origin/main && git submodule update --recursive

# Release the @agent/N lease (this is the single lease for both persona + worktree)
cd "$(git rev-parse --show-toplevel)"
km bd update @agent/<N> --assignee "" --status open
```

Tribe coordination at session end: `tribe.send(to="*", message="releasing @agent/<N>")`.

The wrapper `km agent spawn` releases automatically on SIGTERM/exit; `/claim` from within an interactive session is your responsibility to release.

## See also

- `@agent.md` — parent board with all 10 slots listed
- `@agent/0..9.md` — individual slot definitions (persona + working agreement + queue)
- `/do` — work the highest-priority bead from claimed slots
- `km agent spawn @agent/<N>` — out-of-process variant: claim + compose brief + exec the agent runtime
- `@km/agent/sigil-boards` — design + tracking
