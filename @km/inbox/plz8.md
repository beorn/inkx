---
id: "@km/inbox/plz8"
aliases:
  - km-plz8
  - "@km/_orphan/plz8"
created_at: 2026-01-26T13:19:38Z
closed_at: 2026-01-26T13:37:54Z
assignee: beorn
---

# [x] batch plugin: ripgrep backend for text/markdown batch replace @km/_orphan #task #P2 @beorn

Add ripgrep-based backend for batch text replacement in non-code files.

## Use cases
- Rename terms across markdown docs
- Update URLs, paths, or identifiers in text files
- Change terminology in comments, READMEs, etc.

## Why not Edit+replace_all?
- One file at a time (slow)
- No dry-run preview
- No checksum verification
- No atomic rollback

## Implementation
1. Create `lib/backends/ripgrep/` with:
   - `search.ts` - `rg --json` for finding matches
   - `replace.ts` - generate editset from matches
2. Use same editset workflow as ts-morph
3. Support glob patterns for file filtering

## CLI commands
```bash
# Find text matches
bun tools/refactor.ts text.find --pattern "oldTerm" --glob "**/*.md"

# Generate editset
bun tools/refactor.ts text.replace --pattern "oldTerm" --replace "newTerm" --glob "**/*.md" -o editset.json

# Preview and apply
bun tools/refactor.ts editset.apply editset.json --dry-run
bun tools/refactor.ts editset.apply editset.json
```

## Acceptance criteria
- [ ] `text.find` returns matches with file, line, preview
- [ ] `text.replace` generates valid editset with checksums
- [ ] Case preservation works (oldTerm→newTerm, OldTerm→NewTerm)
- [ ] Glob filtering works
- [ ] Tests for markdown and plain text

## Doc updates (when done)
Update README to highlight:
- **Batch text replace**: "Update 100 markdown files in one command, not 100 tool calls"
- **Safe**: "Preview all changes before applying, checksums catch drift"
- **Fast**: "50 files in <1 second vs 2+ minutes with Edit one-by-one"
- Add example for docs/markdown batch replace

Parent: @km/_orphan/5olc