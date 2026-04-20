# SOP clean — prune ephemeral repo state

`/sop clean` prunes repo state that accumulates during development but does not belong to any shipped artifact: merged/orphan branches, dead worktrees, zombie test workers, stale caches. It is **coordination-aware**: it reports in-flight work and refuses to act until the caller confirms.

## What it IS

A safe, targeted garbage-collect. Scope (v1):

- **branches**: local branches fully merged into `main` (auto-safe) + orphan `worktree-agent-*` branches that never merged (ask)
- **worktrees**: `git worktree` entries with dead-pid locks (auto-safe)
- **procs**: zombie vitest/tsc/bun-run workers that should have exited (v1: reported only, not killed)
- **caches**: `.sop-cache/` entries older than 14 days (auto-safe)

## What it is NOT

- Not a publish/release flow — that's `/sop packages --fix` (delegates to `/release`)
- Not a test-fix / lint-fix — that's `/sop code --fix`
- Not a bead-close — that's `/sop backlog --fix`
- Not WIP triage (classify uncommitted files by owner / ambient / secret) — deferred

These will stay separate. `/sop clean` is the tidy step, not the ship step.

## Coordination protocol (preflight — mandatory)

Before proposing or executing any cleanup, `/sop clean` scans for **active work**:

1. **git locks** — `.git/index.lock`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, rebase dirs
2. **worktree activity** — worktree HEAD ref touched within last 5 min
3. **short-lived workers** — vitest/tsc/bun-run/bun-fix/bun-build/git processes started within last 10 min (ambient daemons like tribe server, accountly, vitepress dev are deliberately excluded)
4. **tribe sessions** — passed in via `--active-sessions=...` (the skill fetches this via `tribe.health` before invoking the tool)

If any active work is detected, `--execute` **aborts** with:

```
⚠ preflight — active work detected:
  git-lock     .git/index.lock   git index locked ... (0s ago)
  process      9421              node vitest run (1s ago)
execute aborted: active work present. Coordinate with active sessions or re-run with --force.
```

The caller must either:
- wait for the active work to finish (preferred — just re-run)
- narrow to a target unaffected by the active work (e.g. `/sop clean caches` is safe during a vitest run)
- pass `--force` after genuinely coordinating (tribe query, direct ack from the session doing the work)

`--force` is the escape hatch — never skip it out of impatience.

## Skill-side wrapper (what the /sop invocation does)

When the user runs `/sop clean`, Claude Code should:

1. Call `mcp__plugin_tribe_tribe__tribe_health` and capture the active session list
2. For each non-idle session, optionally `tribe.send type=query` with "what are you working on, ETA?" and wait ~5s
3. Display the consolidated active-work report (tribe + the tool's own scan) before any destructive action
4. Invoke `bun tools/sop.ts clean [target] --active-sessions=<csv>` with the observed session names
5. If the user approves, re-run with `--execute` (and `--force` only if the caller has truly coordinated)

The skill owns the tribe-coordination half; the tool owns the deterministic git/process/cache half.

## Risk classes

Each scanned item carries one of:

- **low** — safe to delete without asking. Executed by `--execute` automatically. Examples: merged branches, worktrees locked to dead pids, stale `.sop-cache/` entries.
- **ask** — would delete data that was never merged. Skipped by `--execute` alone; `--execute --force` promotes them. Examples: orphan `worktree-agent-*` branches with unmerged commits.
- **block** — never touched by `/sop clean` regardless of flags. Examples: branches currently checked out in a worktree, the repo root's own branch.

## Command surface

```
bun tools/sop.ts clean                        # scan only, report preflight + plan
bun tools/sop.ts clean --execute              # apply low-risk items
bun tools/sop.ts clean --execute --force      # apply low AND ask items (after coordination)
bun tools/sop.ts clean branches               # one target
bun tools/sop.ts clean worktrees --execute
bun tools/sop.ts clean caches --execute
bun tools/sop.ts clean --active-sessions=km,km-5,km-3   # caller-supplied tribe info
```

Aliases: `/sop clean`, `/ops clean`.

## Extension points (post-v1)

- **procs target** — actively kill orphan vitest workers (SIGTERM with grace, then SIGKILL). Currently reported only.
- **uncommitted-WIP triage** — classify unstaged files as ambient (beads DB), TUI (pre-existing), vendor submodule bumps, secrets, unknown. Prompt per class. Lives in its own skill; `/sop clean` links to it.
- **submodule hygiene** — detect detached HEAD on vendor submodules, drift from tracked ref.
- **lockfile churn** — clean `bun.lockb` residue.
- **tribe-aware ETA** — have tribe sessions report their current bead + expected duration (requires a small protocol on the tribe side).

Keep each extension small and behind its own target — `/sop clean` is a sharp tool, not a boil-the-ocean ritual.

## Self-improvement (the `/sop update` feedback loop)

When a session runs `/sop clean` and finds a cleanup target the tool missed (e.g. a new kind of cache, a new stale state file), that's input for `/sop update` to add to the scanner. Don't retrofit every cleanup manually — codify patterns.

## Why this is a sub-command of `/sop` and not its own skill

Four reasons:

1. **State model** — `/sop` already tracks cadence, findings, dashboards. `clean` is a natural per-session operation alongside `scan`.
2. **Domain ownership** — every cleanup target maps to an existing domain (infra for branches/worktrees/caches/procs). No new top-level domain.
3. **Coordination** — tribe/preflight logic should live next to other SOP operations so it can be shared (future: `/sop scan` could also gate on active work).
4. **Discoverability** — a user looking for "how do I tidy the repo?" finds `/sop` (the grooming orchestrator) before discovering an unrelated `/clean` skill.
