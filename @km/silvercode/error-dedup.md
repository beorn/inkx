---
mentions:
  - km
  - claude
id: "@km/silvercode/error-dedup"
aliases:
  - km-silvercode.error-dedup
  - km-silvercode-error-dedup
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:59Z
closed_at: 2026-04-28T21:51:22Z
close_reason: "Deduped consecutive identical errors via 5s window in
  session-reducer (mergeError) + matching dedup in Notifications.tsx toast
  layer. Public lastError now {message, count, ts}; renderers show '(×N)' when
  count > 1. Test: error-dedup.test.ts (6 cases). Branch:
  bug/km-silvercode.error-dedup, commit d2a2cc2ce."
started_at: 2026-04-28T21:43:19Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.error-dedup
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T14:20:03Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Repeated error toast — Request failed with status code 402 @km/silvercode #bug #P0 @claude:2405c72e

blocks:: [[@km/silvercode]]

User-reported in screenshot review: 'Request failed with status code 402' (and similar transient errors) repeats N times in the chat stream. Should de-duplicate identical consecutive errors within a turn (or within a short window) — show once with a count badge.

Likely site: apps/silvercode/packages/agent-harness/src/session-reducer.ts case 'error' handler (line ~622). Currently appends every error message to lastError without deduplication or grouping.

Possible approach: keep a small ring buffer of recent error messages with timestamps; on each new error event, check whether the last error was the same string within last ~5s — if so, increment a count instead of pushing a new entry.

Acceptance: the same Anthropic API 402 error fired 3 times in 1s renders as one entry showing 'Request failed with status code 402 (×3)' in the SessionUpdateList, not three separate rows.

Parked from /loop session 2026-04-28 evening at user direction.

