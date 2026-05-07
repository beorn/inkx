---
mentions:
  - km
id: "@km/storage/sync-rematerializes-closed-beads"
aliases:
  - km-storage.sync-rematerializes-closed-beads
  - km-storage-sync-rematerializes-closed-beads
created_by: claude:l5-d-followup
created_at: 2026-05-07T00:00:00Z
type: bug
priority: P3
parent: "@km/storage"
---

# [ ] `km sync --to-fs` re-materializes closed beads at @km/ root @km/storage #bug #P3

## Bug

After grooming a closed bead off the filesystem (e.g. via the L5-D
deprecation purge that deleted visible-but-untracked `.md` files at the
`@km/` root), `km sync --to-fs` re-creates the file at its original
path. The closed bead keeps reappearing as an untracked file every
sync cycle.

Discovered during the L5 deprecation purge session, 2026-05-07 (commit
`e842f2e87` agent report). The L5-D agent flagged that closed beads
re-appeared as untracked `.md` files after sync, despite the prior
grooming pass having removed them.

## Repro

1. Find a closed bead at the vault root (e.g. `@km/<scope>/<slug>.md`
   where the bead has `closed_at:` set).
2. `rm` the file from disk.
3. Run `km sync --to-fs`.
4. The file is re-created at its original path.

## Fix options

Per the L5-D agent's analysis, two viable fixes:

**(a) Skip closed beads in `km sync --to-fs`.** Closed beads are
historical artifacts; once dropped from disk, sync should not
re-emit them. The DB row stays as the canonical record but the FS
side stops mirroring it. Cleanest, but changes sync semantics.

**(b) `.gitignore` patterns for closed-bead paths.** Less invasive
to sync; let the file get re-created but ignore it from git. Doesn't
address the "noise in `ls` / file-tree" issue, only the git-staging
issue.

Option (a) is the principled fix; (b) is a coping mechanism. Prefer
(a) unless it breaks an unforeseen sync invariant.

A third variant: re-materialize closed beads to an archive path
(e.g. `@km/_archive/<orig-path>`) instead of their original path, so
they remain on disk but don't clutter the live tree.

## Acceptance

After `km sync --to-fs` of a closed bead:

- The file is NOT re-created at its original `@km/<scope>/<slug>.md`
  path; **OR**
- The file is created at an archive path (e.g. `@km/_archive/...`)
  rather than the original path, leaving the live tree clean.

## Context

- L5 deprecation purge session, 2026-05-07
- L5-D agent commit: `e842f2e87`
- Related: `@km/all/L5-deprecation-purge.md`
- Mutation pipeline doctrine: `packages/km-storage/CLAUDE.md` §
  "Mutation pipeline" — every mutation converges on `repo.updateNode`,
  no path writes `.md` directly. The "FS materialization should respect
  closed-bead lifecycle" rule is missing from that doctrine.
