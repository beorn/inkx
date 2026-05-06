---
mentions:
  - silvery
  - km
id: "@km/silvery/commander-fs-types"
aliases:
  - km-silvery.commander-fs-types
  - km-silvery-commander-fs-types
created_by: claude:f8196c1c
created_at: 2026-03-27T05:45:37Z
owner: bjorn@stabell.org
---

# [ ] @silvery/commander: filesystem types (file, dir, glob) via fx effects @km/silvery #feature #P4

After era2b ships fx (effect system), add filesystem-aware CLI types to @silvery/commander:

- existingFile — validates file exists, returns resolved path
- existingDir — validates directory exists
- newFile — validates parent dir exists (for output files)
- glob — expands glob pattern to string[]
- dir — directory path with optional creation

These require side effects (fs access) so they should use fx for DI/testability rather than raw fs calls. Pure types (port, csv, int) stay side-effect-free.

Depends on: era2b fx system shipping in silvery.

