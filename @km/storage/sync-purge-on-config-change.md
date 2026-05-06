---
mentions:
  - km
id: "@km/storage/sync-purge-on-config-change"
aliases:
  - km-storage.sync-purge-on-config-change
  - km-storage-sync-purge-on-config-change
created_by: claude:adeac868
created_at: 2026-04-25T06:00:29Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
owner: bjorn@stabell.org
---

# [x] Adding inactive: globs doesn't retroactively purge already-ingested nodes @km/storage #chore #P3

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

Adding new globs to inactive: doesn't retroactively remove already-ingested nodes from state.db — only re-parses changed files. Requires `km doctor rebuild` (10–20 min on this vault).

## Design question

Should config-surface changes that affect node visibility (inactive list, includeRoots, etc.) trigger an automatic re-evaluation pass? Or at least a 'your config changed; X nodes may now be stale; run rebuild' prompt at sync time?

## Related

Blocked behind @km/storage/doctor-rebuild-empties-db — rebuild itself is currently broken.

