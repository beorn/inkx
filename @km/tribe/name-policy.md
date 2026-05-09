# Tribe name policy — allow `@agent/N` form + don't auto-name new sessions #feature #P2

## Two changes wanted

### 1. Allow `@agent/N`-shaped names

Currently `tribe.rename` accepts arbitrary strings, but no validation has been verified for `/` and `@` chars. Want the daemon to **explicitly support** `@agent/N` style names so a session's tribe name can directly mirror its hat lease (`@agent/3` lease → `@agent/3` tribe name → less ambiguity in routing + history).

Acceptance:
- `tribe.rename({ new_name: "@agent/3" })` succeeds.
- `tribe.send({ to: "@agent/3", message: "..." })` routes correctly (the slash is preserved as part of the recipient name; daemon doesn't try to interpret it as a path or namespace).
- `tribe.history({ with: "@agent/3" })` returns messages involving that session.
- The tribe skill's command-mapping table (`/tribe send <to> <message>`, `/tribe history <name>`) keeps working when `<to>` / `<name>` contains `@` and `/` — quote handling in the parser must not break.
- Listed in `tribe.members()` output without truncation/escaping.

### 2. Don't auto-name new sessions

Currently new sessions get auto-generated names like `golden-snapshot-wt6`, `tasks-planner-extract`, `phase-c-km-tui`, `pending-145234`. These are confusing because:

- They don't reflect the session's actual focus.
- They collide / mask the real session identity (the user reports "they always impersonate / take on the wrong names").
- They make tribe routing unreliable (you don't know who you're talking to until they self-rename).

Want: new sessions get a STABLE neutral name (e.g. `pending-<short-pid>` or `joining-<n>`) that makes their unclaimed status obvious. They should NOT inherit names from prior sessions that left, and they should NOT auto-pick descriptive labels (let the agent rename via `tribe.rename` after deciding their focus).

Acceptance:
- A session that joins without explicitly calling `tribe.rename` shows up in `tribe.members()` with a stable placeholder name (e.g. `unnamed-<short-pid>` or `joining`).
- The daemon does NOT auto-derive names from claude session ids, prior session names, or random descriptors.
- After a session disconnects, its name does not get reused/reassigned to a new session.

## Provenance

Filed by chief 2026-05-08 after observing repeated rename churn this session: `golden-snapshot-wt6` was actually `bjorn-session` under its old auto-name; multiple agents had to `/tribe rename` before they were addressable; `agent1`/`agent2`/`agent3`/`agent4` rename cycles confused routing. User explicitly requested both changes.

## Non-goals

- Changing how `@agent/N` HAT LEASES work (that's a beads concern, not tribe). The two namespaces should remain conceptually separate; the tribe-name change just enables a 1:1 visual mapping for sessions that want it.
- Imposing a regex on tribe names beyond what's needed to make `@agent/N` work — keep names free-form strings otherwise.
