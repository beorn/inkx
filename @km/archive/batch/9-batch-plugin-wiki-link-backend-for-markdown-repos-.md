---
mentions:
  - km
  - beorn
id: "@km/batch/9-batch-plugin-wiki-link-backend-for-markdown-repos-"
aliases:
  - km-batch.9
  - km-batch-9
  - "@km/batch/9"
created_at: 2026-01-26T13:38:13Z
closed_at: 2026-01-27T12:24:20Z
assignee: beorn
---

# [x] batch plugin: Wiki-link backend for markdown repos (Obsidian, Foam, etc.) @km/batch #feature #P2 @beorn

General-purpose backend for auto-updating internal links when files/sections are renamed in markdown/wiki repos.

## Supported Systems (initially)

- Obsidian
- Foam (VS Code)
- Logseq
- GitHub Wiki
- Any [[wikilink]]-based vault

## Link Formats to Parse

| Format          | Example                     | Notes          |
| --------------- | --------------------------- | -------------- |
| Wiki link       | [[note]]                    | Basic          |
| Aliased         | [[note\\|display]]          | Pipe separator |
| Section         | [[note#heading]]            | Heading anchor |
| Section aliased | [[note#heading\\|text]]     | Combined       |
| Embed           | ![[note]] or ![[image.png]] | Obsidian embed |
| Markdown link   | text                        | Standard       |
| Relative path   | text                        | Cross-folder   |

## Refactoring Operations

| Operation      | What Updates                            |
| -------------- | --------------------------------------- |
| File rename    | All [[old-name]] → [[new-name]]         |
| File move      | All paths updated                       |
| Heading rename | All [[#old-heading]] → [[#new-heading]] |
| Tag rename     | All #old-tag → #new-tag                 |

## Implementation

- New backend: `lib/backends/wikilink/`
- Priority: 80 (above ripgrep, below ts-morph for .md files)
- Extensions: `.md`, `.markdown`
- Uses regex-based parsing (no external deps)

## CLI Commands

```bash
# Find wiki links to a note
link.find --note "old-name"

# Rename note (update all links)
link.rename --old "old-name" --new "new-name" --output editset.json

# Rename heading
link.rename-heading --file "note.md" --old "Old Heading" --new "New Heading"

# Rename tag
link.rename-tag --old "#old-tag" --new "#new-tag"
```

## Architecture

- Reuse existing editset workflow (checksums, dry-run, verification)
- Parse wiki links with regex (covers 95% of cases)
- Config file for vault-specific settings (e.g., shortest path vs full path)

