---
id: "@km/_orphan/mhue"
aliases:
  - km-mhue
created_at: 2026-01-26T13:19:49Z
closed_at: 2026-01-26T13:24:29Z
assignee: beorn
---

# [x] batch plugin: fix docs to match current capabilities @km/_orphan #task #P1 @beorn

The docs claim features that don't exist yet. Fix to be honest about current state.

## Current claims that aren't true
- "Pattern matching: AST-aware search and replace via ast-grep" - not wired up
- "Text/markdown updates" - just tells Claude to use Edit tool
- Confidence scoring table - not implemented in code

## Changes needed

### plugins/batch/README.md
- Remove or mark as "coming soon": ast-grep, text/markdown
- Clarify this is TypeScript/JavaScript only for now
- Remove confidence scoring table or mark as planned

### Root README.md  
- Already accurate (focuses on TS batch rename)

### SKILL.md
- Update tool selection table to be honest
- Remove confidence scoring implementation details

## After this
Once @km/_orphan/7fx4 (ast-grep) and @km/_orphan/plz8 (ripgrep) are done, update docs to reflect new capabilities.

Parent: @km/_orphan/5olc