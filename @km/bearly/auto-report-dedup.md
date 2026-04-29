---
id: "@km/bearly/auto-report-dedup"
aliases:
  - km-bearly.auto-report-dedup
  - km-bearly-auto-report-dedup
created_by: claude:19080504
created_at: 2026-03-26T04:26:05Z
closed_at: 2026-03-26T04:32:04Z
close_reason: "Fixed: replaced line-count tracking with Map<id, status> dedup.
  Issues.jsonl is a full dump (rewritten on each bd op), not append-only — old
  approach re-reported same beads on every rewrite. Now tracks reported {id →
  claimed|closed} pairs, only sends notification on state transitions."
owner: bjorn@stabell.org
---

# [x] tribe auto-report fires duplicate close notifications @km/bearly #bug #P3

Auto-report detects bead changes by watching .beads/backup/issues.jsonl mtime + line count. But it re-fires for the same bead closure multiple times — likely because backup file gets rewritten (not just appended) on each bd operation. Need dedup by bead ID + status, not just line count.