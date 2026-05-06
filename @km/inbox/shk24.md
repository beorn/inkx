---
mentions:
  - km
  - claude
id: "@km/inbox/shk24"
aliases:
  - km-shk24
  - "@km/_orphan/shk24"
created_by: claude:94170c26
created_at: 2026-03-17T22:44:52Z
closed_at: 2026-03-18T19:32:19Z
close_reason: "Bug 1 (duplicates): stale DB from metadata change — delete
  state.db* and relaunch. Bug 2 (disk I/O): fixed WAL checkpoint + DB close
  before process.exit in view.ts. 3 regression tests added."
owner: bjorn@stabell.org
assignee: claude:d29abbfa
---

# [x] P0: Asana vault shows duplicate sections + disk I/O errors @km/_orphan #bug #P0 @claude:d29abbfa

Two related issues in the Asana vault (imports/asana):

## Bug 1: Duplicate sections

launch-academy.md has 6 sections (INBOX, PROJECTS & PHASES, Phase 2-5) but the TUI shows each duplicated (2x INBOX, 2x PROJECTS, etc.). Cannot reproduce in unit tests — passes with clean DB. Likely caused by stale DB state from the earlier metadata default change, or by deferred parsing + post-batch sync interaction.

## Bug 2: SQLite disk I/O error

After running km view for a while, SQLite throws 'disk I/O error'. Current config: WAL mode, mmap_size=256MB. May be related to WAL checkpoint failures or file system interactions.

## Bug 3: Alt-screen error lost

Fatal errors appear in alternate screen, but switching back to normal screen loses them. Need to exit alt screen before printing errors.

## Bug 4: Ghost cursor (@km/_orphan/nx8af)

At stabell level, pressing j can land on invisible index file node.

## Repro

rm imports/asana/.km/state.db*
bun km view --repo imports/asana launch-academy
Z Z (zoom out)
j down through cards — may see duplicates, ghost cursor, or disk I/O error

## Key constraint

User does not auto-resync DB. Must delete state.db and tell user to relaunch after behavior changes.

