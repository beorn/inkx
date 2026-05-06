---
mentions:
  - km
id: "@km/inbox/am5e"
aliases:
  - km-am5e
  - "@km/_orphan/am5e"
created_at: 2026-01-20T14:31:10Z
closed_at: 2026-01-20T14:51:47Z
---

# [x] mdtest: Deduplicate state file logic @km/_orphan #task #P3

Medium: State file path generation and initialization is duplicated.

**Duplications:**

1. index.ts:181-200 - statePathsFor(), ensureStateFiles(), clearState()
2. session.ts:38-47 - Similar logic in TestSession constructor

**Problem:**

- Two implementations of the same concept
- Changes need to be made in both places
- Risk of divergence

**Solution:**
Extract to src/state.ts:

```typescript
export interface StateFiles {
  envFile: string;
  cwdFile: string;
  funcFile: string;
}
export function createStatePaths(fileId: string, baseDir: string): StateFiles
export function ensureStateFiles(paths: StateFiles): void
export function clearState(paths: StateFiles): void
```

**Files:**

- vendor/beorn-mdtest/src/index.ts
- vendor/beorn-mdtest/src/session.ts

