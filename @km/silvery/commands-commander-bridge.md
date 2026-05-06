---
mentions:
  - silvery
  - silvery
  - km
id: "@km/silvery/commands-commander-bridge"
aliases:
  - km-silvery.commands-commander-bridge
  - km-silvery-commands-commander-bridge
created_by: Bjørn Stabell
created_at: 2026-04-10T03:07:15Z
owner: bjorn@stabell.org
---

# [ ] Explore bridging @silvery/commands and @silvery/commander — unified command model @km/silvery #task #P3

Explore whether @silvery/commands (runtime command registry with keybindings, context predicates) can share a model with @silvery/commander (type-safe Commander.js with Standard Schema + Silvery-styled help).

## Why

Right now they're two independent packages:

- **@silvery/commander** parses CLI flags/args at startup and renders beautiful help text through Silvery itself (dog-fooding the framework → "beautiful CLIs for free").
- **@silvery/commands** runs inside the TUI: a registry of named commands with keybindings, predicates, and invocation from keypresses or command palette.

But conceptually they're the same thing: a **command** that can be invoked from a CLI flag, a key binding, a menu item, or a command palette. A unified model would mean:

- Define commands once, invoke from anywhere (CLI entrypoint → interactive TUI → command palette)
- CLI --help and TUI command palette list the same commands with the same descriptions
- Standard Schema validation works for keybound args as well as CLI flags
- Tests can drive either surface

## Questions to answer

1. Is the shape of a CLI command (name, args, options, action) compatible with a runtime command (id, predicate, run(ctx)) — or are they fundamentally different?
2. Can @silvery/commander register its parsed commands into the @silvery/commands registry at startup, so `myapp do-thing` and `:do-thing` in the TUI route to the same handler?
3. What's the minimum shared primitive? A "Command" type with optional CLI metadata + optional runtime metadata?
4. Does this force unwanted coupling between the packages, or does the shared type live in @silvery/commands (no deps) and commander imports it?

## Non-goals

- Not a rewrite of either package. This is exploratory — write a design sketch, maybe a prototype, decide if it's worth the coupling.
- Not a deep spec for the TUI command palette (that's its own bead).

## Done when

- Design sketch in vendor/internal/silvery/design/commands-commander-bridge.md
- Decision: yes (ship), prototype only (defer), or no (keep separate)
- If yes: follow-up bead with the implementation plan

