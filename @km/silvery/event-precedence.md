---
mentions:
  - km
id: "@km/silvery/event-precedence"
aliases:
  - km-silvery.event-precedence
  - km-silvery-event-precedence
created_by: Bjørn Stabell
created_at: 2026-04-10T23:04:47Z
closed_at: 2026-04-11T18:12:35Z
close_reason: "Superseded: merged into km-silvery.tea-useinput — fix useInput
  precedence inside createApp."
owner: bjorn@stabell.org
---

# [x] Event precedence: focused components before global hooks (3-lane model) @km/silvery #task #P0

Event precedence: focused components before global hooks (plugin-centric model)

## The Problem

useInput hooks fire BEFORE focused component props (onKeyDown) because processEventBatch bridges directly to RuntimeContext listeners before any plugin sees the event.

## The Fix — Plugin-Centric Event Flow

NOT hardcoded lanes in processEventBatch. Instead:

1. processEventBatch routes keyboard events through the plugin chain (via press())
2. Plugins control event flow via composition order
3. React hooks are thin store readers, not event routers

### Plugin composition controls precedence:

pipe(createApp(store), withTerminal(process), withFocus(), withInput(), withCommands(cmds))

### Each plugin = store + update functions:

- withTerminal: modifier state store, updated on every key event
- withFocus: focus tree dispatch, consumes via stopPropagation
- withInput: handler registry, dispatches to useInput registered handlers

### Key changes:

1. processEventBatch calls press() for keyboard events (enters plugin chain)
2. useInput subscribes via a plugin store, not RuntimeContext directly
3. useModifierKeys reads from withTerminal modifier store
4. Plugin chain determines who sees events and in what order

/complete: modal onKeyDown for Escape fires before useInput quit handler

