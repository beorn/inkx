---
mentions:
  - km
id: "@km/storage/preserve-timestamps"
aliases:
  - km-storage.preserve-timestamps
  - km-storage-preserve-timestamps
created_by: claude:8f007ba9
created_at: 2026-02-19T12:49:10Z
closed_at: 2026-02-19T13:23:52Z
owner: bjorn@stabell.org
---

# [x] Preserve original timestamps during import and DB reload @km/storage #feature #P2

## Problem

When importing from Asana (or any external source), timestamps are captured correctly on KNode objects but **lost on DB insertion**. Both `insertNodeRow()` and `insertFileNodes()` unconditionally set `created_at = now` and `updated_at = now`, discarding the original values. This means:

- Imported items all appear as "just created" — age information is lost
- Node ordering (which uses `created_at`) becomes non-deterministic across DB rebuilds
- Frontmatter dates (`created_at`, `modified_at`) sit in the `data` blob but never feed into queryable columns
- `modified_at` from Asana is not persisted anywhere in markdown

## Root Cause

1. `db-insert.ts:insertNodeRow()` — always uses `now` for created_at/updated_at
2. `pipeline.ts:insertFileNodes()` — same: always `now`
3. `ast2nodes.ts:createFileNode()` — sets `created_at: now` instead of reading frontmatter
4. `convert.ts` — stores `created`/`completed` in inline metadata but drops `modified_at`; also truncates to date-only (`slice(0, 10)`)

## Implementation Plan

### 1. DB insertion: honor existing timestamps

**Files**: `packages/km-storage/src/db-insert.ts`, `packages/km-storage/src/pipeline.ts`

Change `insertNodeRow()` to use `node.created_at ?? now` and `node.updated_at ?? now` instead of bare `now`. Same for `insertFileNodes()`. This is the critical fix — without it, nothing else matters.

### 2. Frontmatter → KNode fields

**File**: `packages/km-markdown/src/ast2nodes.ts`

In `createFileNode()`, after parsing frontmatter, populate KNode fields from frontmatter dates:

```
if (data.created_at) node.created_at = new Date(data.created_at).getTime()
if (data.modified_at) node.updated_at = new Date(data.modified_at).getTime()
```

Fall back to `Date.now()` only when frontmatter has no dates.

### 3. Inline metadata → KNode fields

**File**: `packages/km-markdown/src/ast2nodes.ts` (node-level, not just file-level)

When nodes have inline metadata `created:: 2024-01-15`, parse it into `node.created_at` if the field is unset. Same for `completed:: ...` → `node.completed_at`.

### 4. Import: persist modified_at

**File**: `apps/km-cli/src/import/convert.ts`

Add `modified` to `data.metadata` alongside existing `created` and `completed`:

```
if (item.modifiedAt) metadata.modified = item.modifiedAt.slice(0, 10)
```

### 5. Full ISO precision (optional enhancement)

**File**: `apps/km-cli/src/import/convert.ts`

Consider storing ISO 8601 strings instead of date-only: `metadata.created = item.createdAt` (full timestamp). This preserves time-of-day. Needs parser changes to handle both date-only and full ISO in inline metadata.

### 6. File mtime as cosmetic nicety (optional)

**File**: `apps/km-cli/src/import/write.ts` or wherever files are written

After writing markdown files during import, set `fs.utimesSync(path, atime, mtime)` using the original modification date. This makes `ls -lt` show correct ordering. Purely cosmetic — frontmatter is canonical.

## Files to Change

| File                                  | Change                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| packages/km-storage/src/db-insert.ts  | Use node.created_at ?? now instead of bare now             |
| packages/km-storage/src/pipeline.ts   | Same: honor existing timestamps in insertFileNodes()       |
| packages/km-markdown/src/ast2nodes.ts | Parse frontmatter/inline dates into KNode timestamp fields |
| apps/km-cli/src/import/convert.ts     | Store modified_at in metadata; consider full ISO precision |
| apps/km-cli/src/import/write.ts       | (Optional) Set file mtime after writing                    |

## Testing

- Import test: verify KNodes have original `created_at`/`updated_at` after DB round-trip
- Roundtrip test: write file with frontmatter dates → reload → verify timestamps preserved
- Ordering test: siblings with different `created_at` maintain stable order across reloads
- Regression: existing files without frontmatter dates still get `now` as before

