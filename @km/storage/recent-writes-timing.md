---
id: "@km/storage/recent-writes-timing"
aliases:
  - km-storage.recent-writes-timing
  - km-storage-recent-writes-timing
created_by: Bjørn Stabell
created_at: 2026-04-01T06:11:06Z
closed_at: 2026-04-02T20:57:03Z
close_reason: "Fixed: recentWrites replaced with WriteTokenMap content-hash
  based ownership. No more timestamp window. Commits d044d1d8..30bb85ec."
---

# [x] recentWrites anchored to queue time, not write time; many paths bypass it @km/storage #bug #P1 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/sync.ts:135-142, 520-541, 585-606, 690-736
Classification: P1

The recentWrites suppression window starts when content is queued, so debounce/retries/slow disks eat into the 10s budget before bytes hit disk. Also, syncFromFs() rule write-back, syncToFs(), and createBlockIdAssigner().rewriteSourceFiles() queue writes directly without recording recentWrites. Heartbeat can misclassify km's own writes as external.

Suggested fix: Replace timestamp suppression with per-file sync state: db_generation, last_written_generation, last_written_hash, last_written_mtime. Update only after successful flush. Route all write paths through the same API.