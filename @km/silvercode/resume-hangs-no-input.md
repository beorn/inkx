---
mentions:
  - km
  - claude
id: "@km/silvercode/resume-hangs-no-input"
aliases:
  - km-silvercode.resume-hangs-no-input
  - km-silvercode-resume-hangs-no-input
created_by: claude:2405c72e
created_at: 2026-04-26T08:40:47Z
closed_at: 2026-04-26T08:54:28Z
close_reason: "Shipped: 94e371f7a. Root cause: replaySessionFromDisk left
  session-store status stuck at 'thinking' because on-disk JSONL transcripts
  don't include live-stream turn-end/result events. tryFlush() never drained the
  queue (only fires on live turn-end). User's typed messages disappeared into
  the queue buffer. Fix: synthetic turn-end after replay reusing last message's
  id (no phantom bubble). 2 tests + 22 resume+queue tests all pass. Session:
  km-session.0425-evening"
started_at: 2026-04-26T08:42:50Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.resume-hangs-no-input
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T01:41:03Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] silvercode --resume hangs — agent runs mid-turn, command box doesn't accept input @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

User reports: silvercode --resume <id> reattaches to a session that is mid-turn (server-side claude continues processing). UI shows '> following… [skip]' activity indicator but command box does not accept commands. Two possible issues: (1) the resumed turn is genuinely long-running and user's input would be queued correctly but they see no feedback (queue UI not showing typed characters); (2) input focus/disable logic incorrectly disables CommandBox during a resumed-mid-turn state. Investigation needed: reproduce silvercode --resume <some-active-id> + observe whether keystrokes register (in queue area) + verify Esc interrupts the resumed turn (Stream F's interruptActiveTurn path). Likely fix: (a) make 'mid-turn on resume' obvious in UI with 'Esc to take over' hint, (b) ensure typing is always accepted into queue, (c) consider auto-Esc on resume so users always start fresh-prompt by default with --resume-continue opt-in for mid-turn handoff.

