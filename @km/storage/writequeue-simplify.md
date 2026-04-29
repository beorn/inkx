---
id: "@km/storage/writequeue-simplify"
aliases:
  - km-storage.writequeue-simplify
  - km-storage-writequeue-simplify
created_by: Bjørn Stabell
created_at: 2026-04-03T01:07:08Z
closed_at: 2026-04-03T02:31:06Z
close_reason: Direct writeFileSync. No temp files, no fsync, no atomic rename.
---

# [x] WriteQueue: default to direct writes, atomic opt-in @km/storage #task #P3

Current: always temp+rename (atomic). Breaks inode identity, adds complexity.

Change: direct writeFileSync(path, content). No atomic option. VS Code does this.

Remove: temp files, fsync, atomic rename, error classification complexity.
Keep: debouncing, coalescing.