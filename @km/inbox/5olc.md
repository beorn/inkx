---
mentions:
  - km
  - claude
id: "@km/inbox/5olc"
aliases:
  - km-5olc
  - "@km/_orphan/5olc"
created_at: 2026-01-26T13:15:57Z
closed_at: 2026-01-27T12:21:59Z
assignee: claude:5f8fa618
---

# [x] batch plugin: build out missing features @km/_orphan #task #P2 @claude:5f8fa618

The batch plugin currently only supports TypeScript batch rename via ts-morph. The docs mention features that aren't implemented.

## Revised Value Assessment

| Feature              | Value  | Rationale                                                                      |
| -------------------- | ------ | ------------------------------------------------------------------------------ |
| ast-grep backend     | High   | Multi-language (Go, Rust, Python, JSON, YAML), same editset safety             |
| Batch text replace   | High   | Edit+replace_all is slow (50 files = 50+ tool calls), no checksums, no dry-run |
| Confidence scoring   | Medium | Nice UX but Claude asks naturally when uncertain                               |
| Interactive approval | Low    | Claude already does this                                                       |

## Why Edit+replace_all isn't good enough

- One file at a time (read → edit → write per file)
- No dry-run preview across all files
- No checksum protection against drift
- No atomic rollback if something breaks mid-way
- 50 files = 50+ tool calls vs 1 editset apply

## Recommendation

Build ast-grep + ripgrep backends to enable:

1. **Code**: ast-grep for Go, Rust, Python, Ruby, JSON, YAML (structural)
2. **Text**: ripgrep for markdown, docs, any text file (literal)

Both use the same editset workflow with checksums and dry-run.

## Current State

- ✅ TypeScript/JavaScript batch rename (ts-morph)
- ✅ Editset workflow (propose → verify → apply)
- ✅ Checksum verification
- ✅ Conflict detection
- ✅ Case preservation
- ❌ ast-grep backend (multi-language)
- ❌ ripgrep backend (text files)

## Next Steps

Split into child beads:

1. `ast-grep backend` - wire up existing backend stub for code files
2. `ripgrep backend` - new backend for text/markdown batch replace
3. `Update docs` - remove claims about features that don't exist yet

