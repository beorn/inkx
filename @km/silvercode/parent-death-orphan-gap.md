---
mentions:
  - km
id: "@km/silvercode/parent-death-orphan-gap"
aliases:
  - km-silvercode.parent-death-orphan-gap
  - km-silvercode-parent-death-orphan-gap
created_by: claude:2405c72e
created_at: 2026-04-26T23:12:52Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.parent-death-orphan-gap
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T16:13:01Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] Parent SIGKILL/OOM leaks orphan claude processes — add PR_SET_PDEATHSIG (Linux) + kqueue NOTE_EXIT (macOS) only when reported @km/silvercode #task #P4

blocks:: [[@km/silvercode]]

## Status: P4 long-term roadmap

Trigger to revisit: a real user reports orphan accumulation, OR a measurable resource leak after silvercode crashes, OR we ship to a deployment context (cloud / CI / multi-tenant) where parent crashes are routine.

## Background — why this is P4, not active

The original fork-bomb defense (pidfile / reaper, ~898 LOC) was DELETED in commit `4f9e9ebb5` (2026-04-26). Quarantine-and-Delete principle won: the supervisor edifice was protecting against a within-launch fork bomb that doesn't actually exist (audit confirmed all `spawnSession()` callers are user-action-bounded; no reactive / auto-respawn paths; per-launch budget ~20 processes max).

Graceful exit was hardened by commit `08a0989b9` (2026-04-26): `AgentSession.close()` now uses

- `sentTerm` flag to prevent double-signal,
- `exitPromise` for deterministic exit-await,
- alive-check via `proc.exitCode === null && proc.signalCode === null`,
- 10s SIGKILL fallback through the process group.

This covers Ctrl+C / app quit / planned shutdown end-to-end.

## What's NOT covered (the gap)

Parent-process **SIGKILL / OOM / panic / power-off**. In those scenarios the graceful close path never fires; spawned `claude` + MCP grandchildren reparent to init.

Standard pgroups don't help here — there's no one alive to send `kill(-pid, SIGTERM)`. With the pidfile-reaper deleted, there's also no cleanup-on-next-launch.

## Related but distinct work (don't double-count)

- **MCP-as-tribe-plugin prototype** (bead-b on bearly: 8b6241c → b2b5b81 → d4eaa2b): introduces a connection-as-lease daemon pattern — client SSE drop = lease release; idle-quit timer arms when client count == 0. Addresses long-running shared daemon lifecycle, **not** the silvercode orphan gap.
- **@bearly/daemon-spine extraction Phase 1** (bead-d on bearly: 0a0ce34): consolidates ~250 LOC of duplicate IPC plumbing into a shared package. Also unrelated to the orphan gap.

Neither closes the parent-death window for silvercode's spawned children.

## Kernel-level fixes (when we do this)

- **Linux**: `PR_SET_PDEATHSIG` makes the child receive a signal (e.g. SIGTERM) when the parent dies. Set via `prctl()` from the child immediately after fork.
- **macOS**: `kqueue` with `EVFILT_PROC` + `NOTE_EXIT` lets a watcher fire on parent death. Implement as a small per-child watcher process or a fold into the existing supervisor.

Cross-platform: ~100 LOC + per-OS conditional. Not heavy, but earns its weight only if the gap actually matters.

## YAGNI — why we wait

No real-world report of orphan accumulation since the supervisor edifice was deleted. Workaround if it ever hits: `pkill claude` clears them.

Per `docs/principles.md` (Quarantine-and-Delete + No Parallel Derivation): don't add ~100 LOC of kernel-specific code for a hypothetical scenario. The right time to add this is when reality demands it, not before.

## Acceptance criteria when implemented

- Linux: child process self-terminates when parent SIGKILL'd (verified by integration test that SIGKILL's parent and asserts child exit within ~1s).
- macOS: equivalent via kqueue watcher.
- No regression in graceful exit path (still uses `AgentSession.close()` first; PDEATHSIG is the safety net).
- Test coverage adds a "parent crash" scenario alongside the existing "graceful close" scenarios.
- Runtime cost: zero on the happy path.

