---
id: "@km/silvery/era2a-docs-launch"
aliases:
  - km-silvery.era2a-docs-launch
  - km-silvery-era2a-docs-launch
created_by: claude:fed8de9e
created_at: 2026-03-25T04:35:57Z
closed_at: 2026-03-25T07:05:43Z
close_reason: "Docs launch complete: (1) Removed Signals and Plugins from
  sidebar. (2) Removed state-management from Building Apps section. (3)
  render.md updated to show Term-only signature. (4) runtime-layers.md: gated
  createApp/AppHandle as Coming Soon. (5) signals.md and plugins.md: added
  Coming Soon warnings. (6) Barrel exports verified clean — no era2b APIs in
  silvery or silvery/runtime barrels."
---

# [x] Era2a launch: gate/remove era2b content from silvery.dev @km/silvery #task #P1 @claude:fed8de9e

Before era2a launch, ensure silvery.dev AND package exports tell a pure renderer story.

**Public docs (silvery.dev)**:
- Remove or gate era2b content (commands, signals, createApp, TEA)
- Getting-started, components, hooks, testing guides: pure era2a
- Examples: render() + useState only
- API reference: shipped APIs only
- Migration guide (from Ink): era2a-only

**Package exports (silvery barrel)**:
- Do NOT barrel-export era2b APIs (createApp, signal, commands, etc.) until silvertea ships
- Autocomplete/API docs must not leak future APIs
- Consider secondary entrypoint for era2b if needed

See 00-overview.md §Public Docs & Launch Strategy.