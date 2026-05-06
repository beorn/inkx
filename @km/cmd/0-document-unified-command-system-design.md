---
mentions:
  - km
id: "@km/cmd/0-document-unified-command-system-design"
aliases:
  - km-cmd.0
  - km-cmd-0
  - "@km/cmd/0"
created_at: 2026-01-17T23:23:27Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Document unified command system design @km/cmd #task #P2

## Goal

Add comprehensive documentation for the unified command system architecture to docs/.

## Files to Create/Update

### docs/09-commands.md (new)

Document the command system architecture:

1. **Overview** - Purpose, benefits
2. **Architecture Diagram** - Input sources → Keybinding → Registry → Execution → Dispatch
3. **CommandDef Interface** - id, name, description, category, modes, execute()
4. **CommandContext** - What context commands receive
5. **Keybinding System** - Mode-aware resolution, modifier handling
6. **Command Categories** - Navigation, Selection, Edit, Task, Fold, View, Modal
7. **Adding New Commands** - Step-by-step guide
8. **For @km/_orphan/sh Users** - Text command mapping

### Update docs/README.md

Add entry for 09-commands.md

### Update CLAUDE.md

Add reference to command docs in architectural rules

## Acceptance Criteria

- [ ] docs/09-commands.md created with full architecture docs
- [ ] Architecture diagram is clear and accurate
- [ ] Examples for each command category
- [ ] Keybinding table is comprehensive
- [ ] docs/README.md and CLAUDE.md updated

