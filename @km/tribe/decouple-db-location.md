---
id: "@km/tribe/decouple-db-location"
aliases:
  - km-tribe.decouple-db-location
  - km-tribe-decouple-db-location
created_by: Bjørn Stabell
created_at: 2026-04-07T20:01:26Z
closed_at: 2026-04-18T17:57:58Z
close_reason: "Shipped in bearly a77d619 (km bump 8641be2c9). Tribe daemon
  reloaded and migration verified: legacy .beads/tribe.db moved to
  ~/.local/share/tribe/tribe.db, breadcrumb .beads/tribe.db.moved left in place.
  Git lock messages now include session+PID. Broadcast self-filter verified
  already in place at DB query level, added verbatim-query regression tests (317
  bearly tests pass)."
---

# [x] tribe: decouple tribe.db location from .beads/ directory @km/tribe #task #P2

blocks:: [[@km/tribe]]

Currently tribe stores its coordination DB as .beads/tribe.db (+ .beads/tribe.db-wal, .beads/tribe.db-shm) inside whatever repo it runs in. This conflates tribe with bd — a repo that wants to retire bd for issue tracking can't cleanly delete .beads/ because tribe is still using it.

Concrete case: ~/Bear/Vault migrated off vault-level bd issue tracking on 2026-04-07 (canonical tasks now live in @next.md + per-project @todos sections). The vault would drop .beads/ entirely, but tribe.db lives there and is actively used by the running daemon for cross-session coordination. Result: .beads/ can only be deprecated in place, not removed.

Proposed: tribe should store its state in a location independent of .beads/. Options to consider:

1. .tribe/ directory at repo root (analogous to .beads/)
2. .km/tribe/ or .km/tribe.db (under km's existing state dir, alongside state.db — since tribe is effectively a @km/_orphan/adjacent feature)
3. ~/.local/share/tribe/{repo-hash}/tribe.db (user-global, keyed by repo path)
4. A configurable location via env var or config file with sensible default

Probably 1 or 2. Option 1 keeps per-repo isolation visible; option 2 acknowledges that tribe is a @km/_orphan/ecosystem tool and co-locates with other km state.

Migration path: tribe daemon should detect .beads/tribe.db* on startup, move to new location, continue running. OR accept both locations during a transition window.

Downstream effect: once tribe moves out of .beads/, the vault (and any other repo that wants to retire bd) can fully delete .beads/ without breaking tribe.