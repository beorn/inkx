---
id: "@km/silvery/rename"
aliases:
  - km-silvery.rename
  - km-silvery-rename
created_by: claude:55df8ef1
created_at: 2026-03-09T18:23:43Z
closed_at: 2026-03-09T19:22:13Z
close_reason: "Renamed hightea → silvery across 63 files: docs (27), skills
  (23), CLAUDE.md, configs, scripts. Vendor submodule contents untouched (to be
  replaced). Code import rewrites deferred to km-silvery.km-migrate."
owner: bjorn@stabell.org
---

# [x] Global rename: hightea→silvery, decant→loggily, swatch→@silvery/theme across codebase @km/silvery #task #P2

After the monolith split (@km/silvery/split), do a comprehensive rename pass across the entire codebase.

## Renames

| Old | New |
|-----|-----|
| @hightea/term | @silvery/react + @silvery/term (split) |
| @hightea/ansi | @silvery/ansi |
| hightea (all references) | silvery |
| hightea.dev | silvery.dev |
| decant | loggily |
| swatch | @silvery/theme |

## Scope

### Code
- All import paths (`from "@hightea/term"` → `from "@silvery/react"` etc.)
- package.json names, dependencies, peerDependencies
- tsconfig paths, module resolution aliases
- Workspace references

### Documentation
- All .md files in docs/, vendor/, .claude/skills/
- CLAUDE.md at every level (root, ~/Code, ~/Code/pim/km)
- README files

### GitHub
- Rename beorn/hightea → beorn/silvery (or create new + archive old)
- Rename beorn/decant → beorn/loggily (or create new + archive old)
- Update all cross-references

### npm
- Deprecate old packages with message pointing to new names