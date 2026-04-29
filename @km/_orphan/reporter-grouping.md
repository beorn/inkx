---
id: "@km/_orphan/reporter-grouping"
aliases:
  - km-reporter-grouping
created_at: 2026-01-28T07:30:03Z
closed_at: 2026-01-28T07:57:15Z
---

# [x] vitest-reporter: smart grouping based on file/package count @km/_orphan #feature #P3 @claude:8f1636c1

Add intelligent auto-grouping that adapts display based on the number of files and packages.

**Grouping modes:**
1. `consolidated` - Single row of dots for all tests (no grouping)
2. `files-only` - Show just file names (no package grouping)
3. `packages-only` - Show package names with dots
4. `packages+files` - Two-level: package header + indented files (2-space indent)

**Auto-detection logic (default):**
- **≥40 items** → `consolidated` (too many to list)
- **0-1 packages** → `files-only` (package grouping adds no value)
- **<30 total files** → `packages+files` (detailed view fits)
- **30-39 files** → `packages-only` (compact grouped view)

**Option:**
```typescript
interface ReporterOptions {
  grouping?: 'auto' | 'consolidated' | 'files-only' | 'packages-only' | 'packages+files'
}
```

**Examples:**

`consolidated` (≥40 items):
```
·····●··························································…
```

`files-only` (single package or no packages):
```
repo.test.ts        ·····●··
query.test.ts       ·····
cli.test.ts         ·····
```

`packages+files` (<30 files):
```
@km/storage
  repo.test.ts      ·····●··
  query.test.ts     ·····
@km/cli-app
  cli.test.ts       ·····
```

`packages-only` (30-39 files):
```
@km/storage         ·····●··
@km/cli-app         ·····
```

**Note:** The data structures for file-level tracking already exist in CategoryStats.files - this is mainly about rendering logic.