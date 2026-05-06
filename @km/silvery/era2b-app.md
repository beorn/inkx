---
mentions:
  - km
  - claude
id: "@km/silvery/era2b-app"
aliases:
  - km-silvery.era2b-app
  - km-silvery-era2b-app
created_by: claude:fed8de9e
created_at: 2026-03-25T04:35:54Z
closed_at: 2026-03-25T07:24:52Z
close_reason: "withApp() implemented in @silvery/create/with-app: models
  registry, commands tree with when() guards, keymap registration, command
  invocation by path. 10 tests. Domain plugin contract validated (model +
  commands + keybindings in one plugin)."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2b Phase 8: withApp() — registries, command execution, domain plugin contract @km/silvery #task #P1 @claude:fed8de9e

Implement withApp() composition preset and domain plugin infrastructure.

- withApp() installs: app.models, app.commands, app.keymap(), app.command()
- Apply-chain: keymap resolution (input:key → command op), command execution (fn call)
- Domain plugin contract: co-locate model + commands + keybindings in one plugin
- Typed DI: Pick<typeof app, 'scope' | 'ai'> (Decision 36: providers dissolve into plugins)
- No app.providers namespace — capabilities directly on app

Depends on: era2b-scope, era2b-2-commands.
Design: era2b/app.md

