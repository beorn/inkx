# Auto-align tribe name to hat on claim/release #feature #P3

Cross-package glue between `km bd` (hat-lease primitive) and the tribe daemon (session identity primitive). Implements Step 3 of the parent `@km/tribe/name-policy` 3-way alignment goal.

## Behavior

When a session calls `km bd update @agent/N --claim` (or any equivalent), the bd CAS-and-mark-wip handler ALSO calls `tribe.rename({ new_name: "@agent/N" })` for the calling session. When the lease releases (assignee cleared, status reopened, or session disconnect TTL fires), tribe rename back to `unnamed-<short-pid>`.

End state: an agent that claims `@agent/3` ends up tribe-named `@agent/3`, working in slot `wt3` (canonical path `<repo>-wt3`), branch `wt3`. One number, one identity, all three views.

## Acceptance

- `km bd update @agent/N --claim` (with the claiming session detectable via tribe socket / env) succeeds AND triggers a `tribe.rename` for that session.
- The rename is silent — no broadcast notify spam (or: deduped to a single `claimed @agent/N` notify that carries the rename implicitly).
- Release path (`--assignee "" --status open`) reverts the name to placeholder.
- Race protection: if a different agent has the prior `@agent/N` tribe name, the rename either errors loudly (the daemon already enforces unique names) or the bd-claim handler refuses to claim. Decide which and document.
- Opt-out: an agent that wants a non-default name post-claim can `tribe.rename` to anything; the auto-align doesn't fight that.

## Open design questions

1. **Where does the rename hook live?** Inside `km-beads` (calls into tribe via MCP) or inside the tribe daemon (subscribes to bd events)? The `git`/`beads` tribe plugins suggest the daemon-side approach is the existing pattern.
2. **What identifies the calling session?** `km bd` runs as a subprocess from inside a Claude session; the connection back to the tribe socket needs to identify "this session" reliably. Possibly via `TRIBE_SESSION_ID` env or the existing stdio-adapter fingerprint.
3. **Cross-machine claims** — if the matrix-shape rooms work lands and `@agent/N` claims become federated, the rename only happens for the local session, not others on the same room.

## Depends on

- `@km/tribe/name-policy` (parent) — Steps 1 and 2 must land first:
  1. `tribe.rename` accepts `@agent/N` as a valid name string.
  2. New sessions don't auto-name (so the placeholder + rename flow is clean).

## Provenance

Filed by chief 2026-05-08 after user confirmed the 3-way `tribe = hat = slot` alignment as the explicit goal. Promoted from a stretch-goal section in the parent bead to its own sub-bead so it surfaces independently in the queue.
