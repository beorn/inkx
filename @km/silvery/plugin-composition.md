---
mentions:
  - km
  - claude
id: "@km/silvery/plugin-composition"
aliases:
  - km-silvery.plugin-composition
  - km-silvery-plugin-composition
created_by: claude:474834b0
created_at: 2026-03-10T18:13:07Z
closed_at: 2026-03-10T18:48:33Z
close_reason: "Implemented 8 plugin APIs: pipe(), withReact(), withTerminal(),
  withFocus(), withDomEvents(), createCommandRegistry(), plus barrel exports in
  plugins.ts and index.ts. 566 tests pass."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Implement composable plugin APIs: pipe(), withDomEvents(), withTerminal(), withReact(), withFocus() @km/silvery #feature #P2 @claude:474834b0

Implement the aspirational plugin composition system documented in guides/terminal-apps.md, reference/plugins.md, and guide/event-handling.md. These APIs are described as if they exist but are NOT implemented.

## What exists today

- **withCommands()** — real, in packages/tea/src/with-commands.ts
- **withKeybindings()** — real, in packages/tea/src/with-keybindings.ts
- **withDiagnostics()** — real, in packages/tea/src/with-diagnostics.ts
- **MouseEventProps** — on BoxProps/TextProps (onClick, onMouseDown, etc.) but no plugin wiring
- **run()** — real, in packages/term/src/runtime/run.tsx
- **createApp()** — real, in packages/term/src/runtime/create-app.tsx

## What needs to be implemented

1. **pipe()** — compose plugins: `pipe(createApp(store), withReact(<App />), withTerminal(process), withFocus(), withDomEvents())`. Currently only `compose()` exists for TEA slices.
2. **withReact(element)** — plugin that mounts React reconciler + virtual buffer
3. **withTerminal(process, opts?)** — plugin that wraps ALL terminal I/O: stdin→events, stdout→output, resize, lifecycle, protocols (mouse, kitty, paste)
4. **withFocus()** — plugin for Tab/Shift+Tab navigation, Enter/Escape scope, focus tree dispatch
5. **withDomEvents()** — plugin for DOM-style event dispatch: mouse hit testing, keyboard capture→target→bubble, component event handlers (onClick, onKeyDown, etc.)
6. **createCommandRegistry()** — silvery's own (km has its own in @km/commands, but silvery should provide one)

## Design references

- **Old bead**: @km/inkx/tea-events (closed — only withCommands/withKeybindings/withDiagnostics were built)
- **Session c7385e91**: Full design discussion with plugin anatomy, slice+plugin separation, typed EventMap
- **Session fbad9cb1**: Design doc produced for 3 inkx feature beads including this system
- **Docs already written**: reference/plugins.md, guide/event-handling.md, guides/terminal-apps.md all describe the target API

## Architecture (from prior design sessions)

- SlateJS-style `(app) => app` — plugins override methods, capture originals via closure
- State in model (not closures) — enables snapshot/replay/time-travel
- Slices for state transitions, plugins for event wiring and I/O
- EventMap discriminated unions for type safety
- `run()` becomes sugar over `pipe()` with good defaults
- Three source mechanisms: static plugins, React components (reactive), effects (one-shot)

## Key: infrastructure partially exists

MouseEventProps is already on BoxProps. The event dispatch code exists in packages/term/src/mouse-events.ts. withCommands proves the plugin pattern works. This is about composing what exists into the documented API surface.

