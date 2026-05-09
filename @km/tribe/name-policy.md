# Tribe name policy — allow `@agent/N` form + don't auto-name new sessions #feature #P2

## The goal: tribe = hat = slot (3-way alignment)

When a session is working a hat, all three identities point at the same `N`:

- **Tribe name**: `@agent/N` (the daemon's session identity, used by `tribe.send`, `tribe.history`, `tribe.members`)
- **Hat lease**: `@agent/N` (the bead lease in `km bd`, exclusive to one session at a time)
- **Slot**: `wtN` (the worktree branch + canonical sibling path `<repo>-wtN`)

One number, one identity. No mental mapping between "session named `phase-c-km-tui` who's holding `@agent/2` and working in `km-wt2`." Just `@agent/2` everywhere.

Two changes are needed to make this realistic:

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

### 3. Auto-align tribe name on hat claim (stretch goal)

Once (1) and (2) land, the natural follow-up: when an agent calls `km bd update @agent/N --claim`, the claim handler ALSO calls `tribe.rename(@agent/N)` for the calling session. And on release, rename back to `unnamed-<pid>`. Then the 3-way alignment maintains itself without per-session discipline.

This is the stretch goal because it crosses package boundaries (km-beads ↔ tribe daemon), needs a clean hook surface, and is reversible from the agent side (an agent that wants a different name post-claim can override). File as a follow-up bead after (1) + (2) ship.

## Non-goals

- Changing how `@agent/N` HAT LEASES work in `km bd` (that's a beads internals concern). The two namespaces remain conceptually separate; the tribe-name change just enables a 1:1 visual mapping. The auto-align stretch goal is opt-in glue, not a rewrite.
- Imposing a regex on tribe names beyond what's needed to make `@agent/N` work — keep names free-form strings otherwise.
- Forcing every session to use `@agent/N` form. Sessions without a hat (e.g. `chief`, the user's own session, ad-hoc helpers) keep arbitrary names.
