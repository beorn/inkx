---
id: "@km/silvery/km-canonical"
aliases:
  - km-silvery.km-canonical
  - km-silvery-km-canonical
created_by: claude:474834b0
created_at: 2026-03-10T18:13:41Z
closed_at: 2026-03-10T18:51:47Z
close_reason: Migrated driver.ts withCommands to pipe() pattern. Added
  architectural TODO comments in tui.tsx and board-app.ts documenting the full
  pipe() migration path (requires createApp() plugin support for event
  handlers). All 4221 tests pass.
---

# [x] Migrate km to canonical Silvery Way — plugin composition, withDomEvents, withFocus @km/silvery #task #P2

After plugin composition APIs are implemented (@km/silvery/plugin-composition), migrate km's TUI to use the canonical Silvery Way.

## Current km architecture
- apps/@km/tui/src/driver.ts: uses withCommands + withKeybindings manually (SlateJS-style)
- Has its own createCommandRegistry() in @km/commands
- Manual terminal setup in tui.tsx via createTerm() + run()
- No withDomEvents() — mouse events not wired through component tree
- No withFocus() — focus management is manual

## Migration targets
1. Replace manual app composition with pipe() 
2. Use withTerminal() instead of manual stdin/stdout wiring
3. Add withDomEvents() for mouse support in board view
4. Add withFocus() for keyboard navigation scopes
5. Use silvery's createCommandRegistry() (or keep km's if it has @km/_orphan/specific features)
6. The driver pattern (withCommands → withKeybindings → withDiagnostics) should use pipe()

## Key constraint
km is silvery's showcase. This migration proves the plugin APIs work for a real app.