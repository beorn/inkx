---
mentions:
  - km
  - claude
id: "@km/inbox/inkx-text-measure"
aliases:
  - km-inkx-text-measure
  - "@km/_orphan/inkx-text-measure"
created_at: 2026-02-02T13:54:17Z
closed_at: 2026-02-02T14:21:45Z
assignee: claude:227cdc41
---

# [x] Nested Text elements measure intrinsic width instead of parent constraint @km/_orphan #bug #P1 @claude:227cdc41

Investigation revealed that inkx handles nested Text correctly when:

1. Parent Box has explicit width
2. Parent Box has flexGrow={0} to prevent expansion
3. displayWidth() used for emoji-aware width calculation

The original bug was in application code (missing flexGrow={0}, using string.length instead of displayWidth), not inkx. Both nested Text and pre-built string patterns work correctly.

Tests added: bottom-bar-layout.test.tsx, text-truncate-width.test.tsx

Resolution: Reverted bottom bar to use idiomatic nested Text pattern with proper flexbox configuration.

