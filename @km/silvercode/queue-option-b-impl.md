---
mentions:
  - km
  - claude
id: "@km/silvercode/queue-option-b-impl"
aliases:
  - km-silvercode.queue-option-b-impl
  - km-silvercode-queue-option-b-impl
created_by: claude:0940ca20
created_at: 2026-04-24T23:21:00Z
closed_at: 2026-04-24T23:34:39Z
close_reason: >-
  Shipped Option B queue UX in 4 commits.


  Commits:
    cfb058fd3 — refactor(silvercode): remove holdQueue from controller
    78db93728 — feat(silvercode): rewrite CommandBox with two TextAreas + boundary handoff
    6a9117173 — refactor(silvercode): replace queueFocused with focusedRegion in App
    bef971e27 — test(silvercode): visual scenarios for Option B queue boundary handoff

  Verification:
    npx tsc --noEmit | grep 'error TS' | grep -v vendor/bearly | wc -l => 0
    bun vitest run apps/silvercode/tests/ => 85 passed | 3 skipped (was 78 → +7 new visual scenarios)

  Native silvery onEdge API used (no fallback needed — silvery-onedge teammate
  shipped TextAreaProps.onEdge + useTextArea wiring during my session). One open
  polish item: TextAreaHandle doesn't yet expose setCursor, so down→command
  handoff lands cursor at silvery's preserved position rather than offset 0;
  bead-message sent to silvery-onedge requesting setCursor on the handle.
started_at: 2026-04-24T23:22:25Z
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.queue-option-b-impl
    depends_on_id: km-silvercode.queue-option-b
    type: parent-child
    created_at: 2026-04-24T16:21:18Z
    created_by: claude:0940ca20
    metadata: "{}"
  - issue_id: km-silvercode.queue-option-b-impl
    depends_on_id: km-silvery.textarea-edge-callback
    type: blocks
    created_at: 2026-04-24T16:21:18Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.queue-option-b
      - type: link
        target: km-silvery.textarea-edge-callback
---

# [x] Implement Option B — two TextAreas with cursor-boundary focus handoff (silvercode side) @km/silvercode #task #P1 @claude:0940ca20

blocks:: [[@km/silvercode/queue-option-b]], [[@km/silvery/textarea-edge-callback]]

## Scope

Rewrite silvercode's CommandBox per the Option B design at `apps/silvercode/docs/queue-option-b-design.md`.

Blocked-by: `km-silvery.textarea-edge-callback` (silvery TextArea needs `onEdge` callback — that agent ships first).

## Work

1. Rewrite `apps/silvercode/src/components/CommandBox.tsx`:
- Replace the per-entry TextInput `QueueEditor` with a single silvery `<TextArea>` for the queue
- Add a separate silvery `<TextArea>` for the command input (currently a TextInput)
- Wire both with `onEdge` callbacks for cursor-boundary focus handoff
- Keep the `<Divider title={focusedRegion === 'queue' ? 'QUEUE HELD' : 'QUEUE'} />` between regions (user preference: retain current visual style)
- Per-region coloring: `isActive` drives `color={focusedRegion === 'queue' ? '$fg' : '$fg-muted'}` on the queue, inverse on command
8. Simplify `apps/silvercode/src/App.tsx`:
- Replace `queueFocused` state with `focusedRegion: 'queue' | 'command'`
- Delete the entry/release keybindings (up-arrow-into-queue, Esc-release, Ctrl+Enter-release) — boundary handoff replaces them
- Delete the `controller.holdQueue` effect — no hold concept
- Keep the `/think` / `/think_hard` / `/ultrathink` magic-keyword injection
- Keep the `controller.flushQueue()` call on Enter-in-queue
15. Clean up `apps/silvercode/src/controller.ts`:
- Delete `holdQueue(id, hold)`, the `isHeld` state map, and related wiring
- Keep `flushQueue(id)` (forced flush, called by Enter-in-queue)
- Keep turn-end auto-flush in the subscribe handler
20. Update / add tests:
- Delete or rewrite queue-batching tests that referenced `holdQueue`
- Add visual regression scenarios: focus swap up/down, Enter-in-queue flush, Enter-in-command send, empty-queue Up-arrow no-op, per-region coloring

## Acceptance

Per design doc 'Acceptance' section. In short:

- Two always-live TextAreas, no `queueFocused`/`holdQueue` state
- Up/Ctrl+P at top of command → queue (cursor at end of last line)
- Down/Ctrl+N at bottom of queue → command (cursor at start)
- Enter-semantic: send in command, force-flush in queue
- Per-region coloring driven by `focusedRegion`
- Queue empty → queue TextArea + divider don't render
- Existing tests pass; new visual regression scenarios added

## Supersedes

Piecemeal queue fixes from session 2026-04-24 (4b38bd604, b5289d672, 2e37edfe5, 923f2a4c8, 640022ad1, 49d4274aa, eb0e6a4d3). Their architectural duct tape becomes irrelevant after this lands.

