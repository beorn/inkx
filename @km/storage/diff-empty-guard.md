---
mentions:
  - km
  - Bjørn
id: "@km/storage/diff-empty-guard"
aliases:
  - km-storage.diff-empty-guard
  - km-storage-diff-empty-guard
created_by: Bjørn Stabell
created_at: 2026-04-01T06:11:39Z
closed_at: 2026-04-02T21:40:59Z
close_reason: "Fixed: Removed empty-field guard from diffNodeFields. Safe
  because WriteTokenMap suppresses self-writes, rename handlers record tokens,
  and ordinal-drift uses block_id matching. External edits that clear content
  now sync correctly. Commit 7afb123f."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] diffNodeFields empty-string guard is incorrect self-write detector @km/storage #bug #P1 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/handlers/node-differ.ts:193-205
Classification: P1

diffNodeFields() refuses to overwrite non-empty name/content with empty values. This prevents legitimate external edits that intentionally clear content/title/name. It also doesn't solve stale-vs-current non-empty overwrites.

Suggested fix: Remove this heuristic once explicit self-write detection exists. If a guard is needed, tie it to confirmed self-write echo (generation/hash match), not to empty vs non-empty.

