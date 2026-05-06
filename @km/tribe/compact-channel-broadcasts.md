---
mentions:
  - km
  - claude
id: "@km/tribe/compact-channel-broadcasts"
aliases:
  - km-tribe.compact-channel-broadcasts
  - km-tribe-compact-channel-broadcasts
created_by: claude:da4429de
created_at: 2026-04-23T21:09:51Z
closed_at: 2026-04-23T21:25:39Z
close_reason: Shipped in bearly 2d75c1b (submodule bump km ffcf20ef5, pushed).
  Broadcast coalescer flushes per-client per-window batches instead of N
  individual <channel> notifications. Default 400ms window
  (TRIBE_BROADCAST_BATCH_MS=0 disables); cap 50 events/flush with truncation
  marker; direct messages bypass; 11 unit tests with fake timers covering
  single/batch/per-conn-isolation/passthrough/truncation/flush/flushAll/discard/failed-write/fresh-window.
  Daemon typecheck clean (2 pre-existing errors elsewhere, unrelated). Manual
  boot verified. Stop hook from earlier session still installed at
  ~/.claude/hooks/detect-role-prefix.sh.
owner: bjorn@stabell.org
assignee: claude:da4429de
dependencies:
  - issue_id: km-tribe.compact-channel-broadcasts
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-23T14:09:51Z
    created_by: claude:da4429de
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Compact tribe channel broadcasts into per-turn summary @km/tribe #task #P2 @claude:da4429de

blocks:: [[@km/infra]]

Tribe currently pipes every channel event as a raw <channel source=plugin:tribe:tribe>…</channel> tag onto the next user turn. Under heavy activity the transcript becomes a wall of tags and the model pattern-matches to 'transcript continuation', amplifying any malformed hook stdout into role-prefix hallucination cascades. Coalesce multiple events into one compact <tribe-delta> summary tag per turn. Attacks the autocatalytic environment, also cuts tribe token cost ~20× and reduces attention dilution across all sessions.

