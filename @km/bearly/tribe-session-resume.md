---
mentions:
  - km
id: "@km/bearly/tribe-session-resume"
aliases:
  - km-bearly.tribe-session-resume
  - km-bearly-tribe-session-resume
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:37:53Z
closed_at: 2026-04-21T21:02:15Z
close_reason: Shipped F1-B (rename reclaims dead names via liveness check) +
  F1-D (auto-adopt non-auto-named session at same project+role on fresh
  register). bearly 947c6a5, km e438cc661. 4 new tests pass. F1-A (identity
  file) left as future work if cross-machine resume becomes a shipping
  requirement.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.tribe-session-resume
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-21T13:37:53Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [x] Tribe: session resume across Claude sessions (stable identity handle) @km/bearly #feature #P2

blocks:: [[@km/bearly]]

User wants: "I'd like to be able to shut down sessions and resume them somewhere else and have them automatically take on the tribe name."

## Current state

Identity token = sha256(CLAUDE_SESSION_ID | cwd | role).slice(0,16). Changes per Claude Code invocation → the adoption ladder (resolveName step 3, tribe-daemon.ts:446) only fires when reconnecting the SAME Claude Code session, not across sessions.

## Target

Three complementary mechanisms, any one would cover the use case:

### A. User-controlled stable handle (most powerful)

A tribe-identity file per-project or per-user that pins the session's name across Claude sessions:

```toml
# .beads/tribe-identity.toml (or ~/.config/tribe/identity.toml)
[[identities]]
name = "plateau"
cwd = "/Users/beorn/Code/pim/km"
scope = "project"  # or "user"
```

On tribe.join, daemon reads this file (keyed by cwd + scope) and uses the declared name if not currently active.

### B. tribe.rename can reclaim dead names

Currently tribe.rename errors "already taken" even when the holder is dead. Daemon should check if the holder is active; if not, reclaim automatically. One-line fix in server.mjs (or wherever rename handler lives).

### C. tribe reap CLI + auto-reap in daemon

Sessions inactive for >24h get auto-deleted. Prevents name squatting. Add `bun tribe reap [--older-than=1h]` CLI + opt-in daemon background task.

## Recommendation

Ship B first (lowest friction — user already types /tribe rename <name> when they want it; should just work). Add A later for true "handle persistence." C as defense-in-depth.

## Acceptance

- [ ] (B) tribe.rename reclaims dead names. Test: rename while holder alive → error. Rename while holder dead → succeeds, old row deleted.
- [ ] (A) tribe-identity file read on tribe.join; declared name wins if available. Test: set identity.toml, restart Claude, tribe.members shows declared name.
- [ ] (C) bun tribe reap command + daemon background reaper with configurable threshold.

## References

- vendor/bearly/tools/tribe-daemon.ts:437-468 (resolveName)
- vendor/bearly/plugins/tribe/server.mjs:2062 (identity_token)
- vendor/bearly/plugins/tribe/CHANGELOG.md:346-355 (identity_token history)

