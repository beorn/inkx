---
id: "@km/all/plugin-composability"
aliases:
  - km-all.plugin-composability
  - km-all-plugin-composability
created_by: Bjørn Stabell
created_at: 2026-03-31T21:58:01Z
owner: bjorn@stabell.org
---

# [ ] Review all km-* packages for plugin composability — withSync, withEventLog, with* architecture @km/all #task #P2

All km-* packages should be reviewed for composability — rewritten as plugins that can be composed via with* pattern.

Example for @km/storage:
  const repo = createRepo(path)
    |> withEventLog()      // adds events.jsonl persistence
    |> withSync()          // adds bidirectional filesystem sync
    |> withUndo()          // adds undo/redo stack
    |> withWatcher()       // adds file system watching

Each plugin adds a capability. The core repo is just a SQLite store. Sync, event logging, watching, undo are all opt-in composable layers.

This applies across ALL km-* packages:
- @km/storage: withSync, withEventLog, withWatcher, withReconcile
- @km/_orphan/commands: withKeybindings, withChords, withCommandPalette
- @km/tui: withInlineEdit, withNavigation, withDetailPane
- silvery: already has this pattern (run, createApp, withApp)

Benefits:
- Each layer is independently testable (no need to mock the whole pipeline)
- Consumers pick only what they need
- Clear responsibility boundaries (each plugin owns one concern)
- Fault injection tests become trivial (wrap with a failing plugin)

Prior art: SlateJS plugins (withHistory, withReact), Zustand middleware (persist, devtools), Express middleware.

This is a long-term architectural direction, not an immediate refactor. Start with @km/storage since the sync pipeline audit revealed the most overlapping concerns.