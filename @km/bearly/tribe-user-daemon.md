---
id: "@km/bearly/tribe-user-daemon"
aliases:
  - km-bearly.tribe-user-daemon
  - km-bearly-tribe-user-daemon
created_by: claude:19080504
created_at: 2026-03-31T01:19:24Z
closed_at: 2026-03-31T01:29:52Z
close_reason: "Phase 1 implemented: user-level socket path preference,
  resolveProjectName(), projectName in sessions/watch/cli_status. Cross-project
  addressing (project:name routing) deferred to follow-up."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Tribe: user-level daemon with project-namespaced sessions @km/bearly #feature #P3 @claude:19080504

Single per-user daemon instead of per-project. Projects become namespaces within one daemon.

## Architecture

One daemon at ~/.local/share/tribe/tribe.sock serves all projects. Each project has its own message DB at <project>/.beads/tribe.db. The daemon maps cwd → project at session registration time.

Current: per-project daemon (km/.beads/tribe.sock)
Proposed: per-user daemon (~/.local/share/tribe/tribe.sock) + per-project DBs

## Namespace Model (aligned with beads)

Borrow beads' prefix-based namespace mapping:
- Beads use km-<scope>.<suffix> — project prefix + scope + ID
- Tribe sessions: <project>:<name> — e.g. km:chief, decker:webapp
- Cross-project addressing: tribe_send('decker:chief', msg)

The project prefix comes from beads' remote repo concept — each .beads/ dir maps to a project name via the remote config. This gives globally unique names without a central registry.

Agent naming: agents spawned by tribe could follow the same pattern — km:chief:agent-1 (project:session:agent). This aligns with beads' hierarchical ID scheme and enables cross-project agent coordination.

## Key Design Decisions

1. Socket: single user-level socket (resolveSocketPath prefers ~/.local/share/tribe/tribe.sock)
2. Registry DB: user-level DB tracks projects + sessions. Per-project DBs store messages/events
3. Folder mapping: walk up from cwd looking for .beads/ to find project root. Project name from .beads remote config or directory name
4. Cross-project messages: daemon looks up target project, writes to its DB
5. Graceful migration: per-project daemons still work. User daemon is opt-in
6. Agent names: project:session:agent hierarchy mirrors beads' prefix scheme

## What Changes

| Aspect | Now | Proposed |
|--------|-----|----------|
| Daemon | per-project (.beads/tribe.sock) | per-user (~/.local/share/tribe/tribe.sock) |
| Socket discovery | walk up to .beads/ | fixed per-user path |
| DB | one per project | registry DB + per-project DBs |
| Sessions | isolated per project | all visible, namespaced by project |
| Messages | within project only | cross-project via project:name addressing |
| Agent names | member-<pid> | km:flexily:agent-1 |

## Beads Alignment

Beads already solve the namespace problem:
- bd uses remote repos with prefix mapping (e.g. km- prefix → km remote)
- Projects are identified by their .beads/ directory + remote config
- IDs are globally unique via prefix (@km/silvery/foo vs decker-auth.foo)

Tribe can reuse this: read .beads/config to get the project prefix, use it as the namespace. A session in ~/Code/pim/km registers as 'km:flexily'. A session in ~/Code/DZ/decker registers as 'decker:webapp'. The daemon routes cross-project messages by prefix lookup.