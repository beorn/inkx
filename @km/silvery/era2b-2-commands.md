---
id: "@km/silvery/era2b-2-commands"
aliases:
  - km-silvery.era2b-2-commands
  - km-silvery-era2b-2-commands
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:35Z
closed_at: 2026-03-25T07:20:42Z
close_reason: "@silvery/commands package created: createCommandRegistry (typed
  defs with when() guards), withCommands (plugin), withKeybindings (keymap
  resolution), parseHotkey (key parser). 629 LOC extracted from @silvery/create.
  Source still remains in @silvery/create — consumers migrate in era2b-4-ui."
---

# [x] Era2b Phase 2: @silvery/commands — extract command system @km/silvery #task #P1 @claude:fed8de9e

Extract from @silvery/tea: command registry, keymap(), when(), canInvoke(), available(), resolveInvocation(), key parsing. when() takes () => boolean — state-agnostic (Decision 30). Depends only on @silvery/create. /react subpath for useCommand/useKeymap.