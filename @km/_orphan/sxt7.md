---
id: "@km/_orphan/sxt7"
aliases:
  - km-sxt7
created_at: 2026-01-22T16:15:12Z
closed_at: 2026-01-22T16:25:46Z
---

# [x] Tool to index/search files from Claude sessions @km/_orphan #feature #P2

Create a tool to make restoring files from Claude session history easier.

## Problem
When files are lost/corrupted, we need to search through Claude session JSONL files to find Write tool calls that created them. This is currently manual and error-prone.

## Proposed Solution
Create a CLI tool (or km command) that:

1. **Index Build** - Scan all session files and extract:
   - Write tool calls: file_path, content hash, timestamp
   - Read tool calls: file_path, content (for recovery context)
   - Session ID and timestamp

2. **Search** - Query the index:
   - By file path pattern: `km session-index search '**/chaos-cli.ts'`
   - By content pattern: `km session-index search --content 'MockFileSystem'`
   - List all writes: `km session-index writes`

3. **Restore** - Extract file content:
   - `km session-index restore packages/km-storage/scripts/chaos-cli.ts --session <id>`
   - `km session-index restore-all --date 2026-01-22` (restore all writes from a date)

## Index Format
Store as SQLite in .claude/projects/<project>/session-index.db:
```sql
CREATE TABLE writes (
  session_id TEXT,
  timestamp INTEGER, 
  file_path TEXT,
  content_hash TEXT,
  content TEXT  -- full content for small files
);
CREATE INDEX idx_writes_path ON writes(file_path);
```

## Usage After Implementation
```bash
# Rebuild index after disaster
km session-index rebuild

# Find all versions of a file
km session-index search 'chaos-cli.ts'

# Restore latest version
km session-index restore packages/km-storage/scripts/chaos-cli.ts
```
