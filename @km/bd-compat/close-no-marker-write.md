---
aliases:
  - km-bd-compat.close-no-marker-write
  - km-bd-compat-close-no-marker-write
created_at: 2026-05-06T21:33:18.309Z
closed_at: 2026-05-06T21:59:17.693Z
dropReason: Wrong framing. The CLI path (bd close → repo.updateNode) is correct
  — it should go through the same mutation pipeline as km view's set_status_done
  command (both produce an Op applied via repo.updateNode). The actual bug is
  that sync --to-fs doesn't materialize the resulting task_status / closed_at /
  close_reason back to source markdown (title marker stays [ ], frontmatter
  doesn't grow closed_at). Refiled as @km/storage/sync-to-fs-projects-full-state
  under the @km/storage/sync-roundtrip-completeness epic.
---

# [-] km bd close + drop don't write [x]/closed_at to source markdown #bug #P3

`km bd close <id>` and `km bd drop <id>` update the SQLite cache (Status: closed appears in `bd show`) but do not rewrite the source markdown title from `# [ ]` to `# [x]` or add `closed_at` / `close_reason` to the frontmatter. `km sync --to-fs` does not project this state back either.

Encountered during the @km/* scope consolidation: had to manually patch 5 dead-epic close files (@km/bear, @km/agent-view, @km/logview, @km/tools, @km/logger) to add `[x]` markers + closed_at + close_reason fields after running `km bd close`. The data was correct in the DB but git saw no change to the source.

The session/0428-evening close DID write [x] to the source — so the behavior is inconsistent. May be related to whether the bead is open at the time of close, or whether sync ran between operations.

Acceptance:

- `km bd close <id>` writes [x] marker to title line of source .md file
- `km bd close <id> -r <reason>` writes `closed_at: <iso>` and `close_reason: <text>` to frontmatter
- Same for `km bd drop <id>` (writes `[-]` or whatever the dropped marker is)
- `km sync --to-fs` projects DB-side closed status to source if the source is stale

