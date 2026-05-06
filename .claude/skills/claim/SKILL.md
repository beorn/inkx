---
description: Claim an @agent/N persona slot. Sets assignee + status=wip via DB-side CAS, reads slot body into session context as <persona> envelope, broadcasts on tribe. Required before /do.
argument-hint: "@agent/<N>  (e.g. /claim @agent/3)"
allowed-tools: Bash, Read
---

# /claim — claim an @agent/N persona slot

**Keywords**: claim, agent, persona, slot, assign, lock

The agent-dispatch primitive. Each `/claim @agent/N` acquires a persona slot via race-safe DB-side compare-and-swap, then loads the slot's body into session context. Required before `/do` — without a claimed slot, there's no queue to work.

See `@km/agent/sigil-boards` (epic) for the full design.

## Usage

```
/claim @agent/3       # claim slot 3 (bd/cli-engineer)
/claim @agent/0       # claim slot 0 (generalist)
```

You can claim multiple slots in one session if you intend to work multiple personas — `/do` will pick the highest-priority bead across ALL claimed slots.

## What it does (three steps)

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

### 3. Tribe broadcast

```bash
bun vendor/bearly/tools/tribe-cli.ts send '*' "claimed @agent/<N> — <persona-name> — <session-name>"
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

When you're done with a persona for the session:

```bash
km bd update @agent/<N> --assignee "" --status open
```

Or via tribe coordination protocol when ending a session: `tribe.send(to="*", message="releasing @agent/<N>")` followed by the release command.

The wrapper `km agent spawn` releases automatically on SIGTERM/exit; `/claim` from within an interactive session is your responsibility to release.

## See also

- `@agent.md` — parent board with all 10 slots listed
- `@agent/0..9.md` — individual slot definitions (persona + working agreement + queue)
- `/do` — work the highest-priority bead from claimed slots
- `km agent spawn @agent/<N>` — out-of-process variant: claim + compose brief + exec the agent runtime
- `@km/agent/sigil-boards` — design + tracking
