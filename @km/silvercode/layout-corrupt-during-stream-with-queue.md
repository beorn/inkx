---
id: "@km/silvercode/layout-corrupt-during-stream-with-queue"
aliases:
  - km-silvercode.layout-corrupt-during-stream-with-queue
  - km-silvercode-layout-corrupt-during-stream-with-queue
created_by: claude:2405c72e
created_at: 2026-04-26T11:23:46Z
closed_at: 2026-04-26T12:12:01Z
close_reason: "Shipped: flexily c34237b + silvery 90bdec7a + km 69f6a83be. Root
  cause was NOT silvery pipeline — flexily layout-zero.ts CSS §4.5 bridge
  clobbered explicit setFlexShrink(0) for overflow!=visible children. Recursive
  min-content work tipped layouts into the affected path. Fix: track
  _flexShrinkExplicit flag; bridge skips when explicit. 4 flexily tests + 3
  silvery regression tests. Session: km-session.0425-evening"
---

# [x] Layout corrupts during streaming when queue receives input @km/silvercode #bug #P1 @claude:2405c72e

Symptom: When typing input while a streaming response is in flight, the SessionCard layout corrupts: the left pane border (▎) disappears, content shifts ~30 columns right, scrollbar overlaps content. Persists for the duration of the session — Shift+End scrolls but does not restore layout; Ctrl+L does not redraw.

Reproducible repro:
1. Launch silvercode --cwd /tmp/test-vault (fresh)
2. Send "say hi" + Enter (short response, no bug yet)
3. Send "list 30 items, one per line, just numbers 1 to 30" + Enter (overflow content)
4. Send "echo paths: vendor/silvery and /main.ts and https://example.com" + Enter
5. Send "write a 500-word essay on the history of typewriters with detailed paragraphs" + Enter
6. WITHOUT WAITING for response, type "queued1"
7. The moment the typing happens during streaming, layout corrupts.

Expected: SessionCard left border ▎ stays drawn; content stays in original column.
Actual: Left border gone permanently; content shifted right; layout never recovers in the session.

Also observed earlier in same explore session via the same pattern (different vault state). Reproduces 2/2 attempts.

Likely related to:
- apps/silvercode/src/components/SessionCard.tsx (left-border gutter)
- apps/silvercode/src/components/MessageList.tsx (scroll/follow-end + viewport invalidation during stream)
- silvery pipeline incremental render after layout change while streaming

Screenshot: /tmp/explore-2-render-bug.png and /tmp/explore-4-layout-bug.png

Discovered in autonomous explore session 2026-04-26.