---
mentions:
  - km
id: "@km/tribe/scope-model"
aliases:
  - km-tribe.scope-model
  - km-tribe-scope-model
created_by: Bjørn Stabell
created_at: 2026-04-19T17:55:26Z
closed_at: 2026-04-20T18:46:26Z
close_reason: "Dissolved. Scope via tree placement + remote: URI per chatlog
  node (hub/km/design/tribe-matrix.md). No global scope model needed."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.scope-model
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-19T10:55:26Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] tribe: decide per-project vs global-user daemon and make the code reflect it @km/tribe #feature #P2

blocks:: [[@km/tribe]]

Pro review 2026-04-19 P0.7: current code is incoherent about scope.

- socket.ts resolveSocketPath() defaults to $XDG_RUNTIME_DIR/tribe.sock (global per user).
- config.ts resolveDbPath() defaults to $XDG_DATA_HOME/tribe/tribe.db (global per user).
- But README + CLAUDE.md + tribe.members output + project_id column all imply 'one daemon per project'.
- Sessions from different projects all connect to the same daemon and see each other's chief, broadcasts, git events, beads events. That's either a feature (cross-project awareness — useful!) or a bug (project isolation leak — confusing).

Decision needed:
(A) Global-user daemon that shards by project_id — all queries filter by project, broadcasts respect project boundaries, cross-project 'all' is opt-in via a flag. Most scalable.
(B) Per-project daemon — socket/db paths include project hash, `tribe doctor` picks the right one, autostart per first-session-in-project. Simpler mental model.

Today it's 'global daemon with project_id as a hint, no enforcement'. That's the worst spot — looks like (A) but isn't actually sharded, looks like (B) in docs but isn't isolated.

Effort: 2-3 days once decided. Affects schema, socket resolution, autostart, every query that sees messages or sessions from 'another project'.

