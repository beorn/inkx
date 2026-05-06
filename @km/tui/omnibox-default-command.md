---
mentions:
  - km
id: "@km/tui/omnibox-default-command"
aliases:
  - km-tui.omnibox-default-command
  - km-tui-omnibox-default-command
created_by: Bjørn Stabell
created_at: 2026-04-15T01:16:50Z
closed_at: 2026-04-17T15:32:52Z
close_reason: "Already shipped in commit 56fe7b317 (feat(km-commands,km-tui):
  default command + omnibox projection (Phase 4)). Implementation lives at
  packages/km-commands/src/commands/omnibox.ts — 'default' CommandDef registered
  in @km/commands via omniboxCommands[] barrel. execute() returns
  {type:'CURSOR_TO', locationKey: ctx.targetId} when targetId set, null
  otherwise. Tests in apps/km-tui/tests/omnibox-projection.test.ts cover all
  three cases (presence, CURSOR_TO emission, null no-op) — all 14 passing.
  Command-node dispatch (EXECUTE_COMMAND) intentionally deferred — omnibox
  confirm handler strips cmd:/node: prefixes before invoking default.execute(),
  and the dialog-wiring side is Phase 5 (km-tui.omnibox-dialog). Typecheck clean
  (0 errors); km-commands 550/550 tests pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-default-command
    depends_on_id: km-tui.omnibox-command-projection
    type: blocks
    created_at: 2026-04-14T18:17:13Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-default-command
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T18:17:13Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tui.omnibox-command-projection
      - type: link
        target: km-tui.omnibox-unified
---

# [x] The 'default' command — universal type-dispatch fallback @km/tui #task #P1

blocks:: [[@km/tui/omnibox-command-projection]], [[@km/tui/omnibox-unified]]

Register a new command 'default' in @km/commands that serves as the universal fallback for the omnibox's defaultCommand field. Its execute() dispatches based on the argument's node type:

- type 'command' → EXECUTE_COMMAND (runs the argument as a command)
- any other type → CURSOR_TO (navigate to the node)

This is the pivot of the whole omnibox design. defaultCommand = 'default' for cmd-k, cmd-f, and all generic chord opens. Verb-locking chords (m +, c @, /, etc.) override with their specific verb. The 'default' command is what makes Enter work regardless of context — even when the user hasn't explicitly picked a verb.

Implementation:

- Add apps/@km/tui/src/commands/... or packages/@km/_orphan/commands/src/commands/meta.ts with 'default' as a CommandDef
- Wire EXECUTE_COMMAND op handler in board-actions.ts (may not exist yet)
- Integration test: default against a KNode type='command' → runs that command
- Integration test: default against a person/tag/project/file node → cursor-to navigation
- Unit test: default.execute({ currentNode: commandNode }) returns correct op
- Unit test: default.execute({ currentNode: null }) returns null

Acceptance:
(a) 'default' is registered in @km/commands
(b) default.execute() switches on node.type and emits the right op
(c) Enter on a command node in the omnibox (via :cr → pick → Enter) runs the command
(d) Enter on a content node (via cmd-f → @del → pick → Enter) goto's the node
(e) Unit tests cover both branches + null/undefined node

