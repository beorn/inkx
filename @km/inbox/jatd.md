---
mentions:
  - km
id: "@km/inbox/jatd"
aliases:
  - km-jatd
  - "@km/_orphan/jatd"
created_at: 2026-01-20T10:38:19Z
closed_at: 2026-01-20T10:54:45Z
---

# [x] Add ANSI-aware truncation tests to inkx @km/_orphan #task #P1

Ink issue #584 reports text with ANSI codes breaking layout when truncated.

Test scenarios:

1. Truncate text with Chalk styles mid-sequence
2. Preserve ANSI reset codes at truncation point
3. Nested Chalk styles that get cut off
4. Mixed styled and unstyled text truncation
5. Verify no broken escape sequences in output

Reference: https://github.com/vadimdemedes/ink/issues/584

