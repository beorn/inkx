---
aliases:
  - km-storage.sync-to-fs-projects-full-state
  - km-storage-sync-to-fs-projects-full-state
created_at: 2026-05-06T22:00:08.681Z
---

# sync --to-fs doesn't project full DB state (task_status / closed_at / close_reason / title markers) #bug #P2

After `km bd close X` (or any CLI mutation that sets task_status), `km sync --to-fs` writes 5390 files but does NOT update X.md's title from `# [ ]` to `# [x]`, doesn't add `closed_at` / `close_reason` to frontmatter. Same for drop, claim, status changes. The DB has the right state; the markdown source doesn't reflect it.

Per @km/storage/sync-roundtrip-completeness: the unified rule is CLI writes DB → sync materializes to FS. Sync currently materializes mentions / props / trailing-newline normalization but skips task_status, closed_at, close_reason, title-line marker. Closing the gap means sync rebuilds the title line from `status → marker` and writes closed-state frontmatter when applicable.

Also affects the 5 dead-epic closes from the scope-consolidation work — those required manual frontmatter patches because sync wouldn't write them.

Acceptance:
- `km bd close X -r 'reason'` — after `km sync --to-fs`, X.md has `# [x]` title and `closed_at: <iso>` + `close_reason: 'reason'` in frontmatter
- Same for drop (writes `[-]` or whatever the dropped marker is + dropReason)
- Same for status transitions: todo → wip writes `# [/]`, wip → blocked writes `# [!]`, etc.
- Property test: round-trip for all 5 statuses (todo / wip / blocked / done / dropped) — set via repo.updateNode, sync --to-fs, parse back via sync --from-fs, verify status preserved
