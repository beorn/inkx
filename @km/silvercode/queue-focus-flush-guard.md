---
id: "@km/silvercode/queue-focus-flush-guard"
aliases:
  - km-silvercode.queue-focus-flush-guard
  - km-silvercode-queue-focus-flush-guard
created_by: claude:1eb07bba
created_at: 2026-04-26T05:44:27Z
closed_at: 2026-04-26T06:38:33Z
close_reason: "Shipped: b1930e6299b11c0754345a7a4b5af50c239ed4bc. tryFlush bails
  when focusedRegion===queue. 3 tests. Session: km-session.0425-evening"
started_at: 2026-04-26T05:47:23Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.queue-focus-flush-guard
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:45:04Z
    created_by: claude:1eb07bba
    metadata: "{}"
---

# [x] Queue auto-flushes even when cursor is in queue (not command box) @km/silvercode #bug #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

When the user moves focus into the queue region (to inspect/edit/reorder queued entries), the controllers turn-end handler still calls tryFlush() and submits the queue. Expected: while focusedRegion=queue, auto-flush should be paused; resume when focus returns to command box. Root: apps/silvercode/src/controller.ts:673-677 fires tryFlush(sessionId) on turn-end. tryFlush() at controller.ts:331-361 checks status===idle but never checks focus. focusedRegion lives in App.tsx:255 and is invisible to the controller. Fix: add a focus accessor; tryFlush bails when region===queue. Test: enqueue text, move focus to queue mid-turn, assert no flush at turn-end; move focus back to command, assert flush.