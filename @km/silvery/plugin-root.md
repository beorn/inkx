---
id: "@km/silvery/plugin-root"
aliases:
  - km-silvery.plugin-root
  - km-silvery-plugin-root
created_by: claude:474834b0
created_at: 2026-03-10T19:04:29Z
closed_at: 2026-03-10T19:20:47Z
close_reason: Replaced wrapRoot function pattern with .Root component on app
  object. withInk() sets app.Root to InkRoot component. createApp() accepts Root
  in run options. Composition via PrevRoot chaining. All 4221 tests pass.
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Replace wrapRoot with .Root component pattern for plugin composition @km/silvery #task #P2 @claude:474834b0

Replace the wrapRoot function pattern with a .Root component on the app object. More React-idiomatic, one less abstraction (we need a root component anyway), more SlateJS/plugin-like. Plugins compose by wrapping the previous Root. withInk() sets app.Root to include Ink providers. Renderer wraps element with <app.Root>{element}</app.Root>.