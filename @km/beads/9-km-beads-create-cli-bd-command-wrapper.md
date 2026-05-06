---
mentions:
  - km
id: "@km/beads/9-km-beads-create-cli-bd-command-wrapper"
aliases:
  - km-beads.9
  - km-beads-9
  - "@km/beads/9"
created_at: 2026-01-21T10:47:53Z
closed_at: 2026-01-21T12:39:23Z
---

# [x] km-beads: Create CLI bd command wrapper @km/beads #task #P2

Create apps/@km/_orphan/cli/src/commands/bd.ts as thin CLI wrapper:

- Import all functions from @km/beads
- Create Command("bd") with subcommands: ready, create, show, update, close, list, dep, sync, migrate
- Each subcommand parses flags and calls @km/beads functions
- Support --json flag for all list operations

Modify apps/@km/_orphan/cli/src/index.ts to register bdCommand

