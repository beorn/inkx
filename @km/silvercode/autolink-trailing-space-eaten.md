---
mentions:
  - km
  - claude
id: "@km/silvercode/autolink-trailing-space-eaten"
aliases:
  - km-silvercode.autolink-trailing-space-eaten
  - km-silvercode-autolink-trailing-space-eaten
created_by: claude:2405c72e
created_at: 2026-04-26T11:31:52Z
closed_at: 2026-04-26T12:12:18Z
close_reason: "Shipped: daa743b51. LinkifiedText: gap pieces now wrapped in
  <Text> instead of React.Fragment for uniform virtual-text. 2 tests. Session:
  km-session.0425-evening"
started_at: 2026-04-26T11:33:21Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
---

# [x] Autolinked file path appears to eat trailing space in user-message render @km/silvercode #bug #P3 @claude:2405c72e

Symptom: When a file path autolink (e.g. /main.ts) is followed by a space + word in the user-message echo line, the visual rendering shows the underlined link directly adjacent to the next word with no visible space.

Repro:

1. Type: `echo paths: vendor/silvery and /main.ts and https://example.com`
2. Press Enter
3. Look at the user echo line in the message stream

Expected: visual `... and [/main.ts] and [https://example.com]` with spaces around each link
Actual: visual `... and [/main.ts]and [https://example.com]` — space appears collapsed between /main.ts and the next word

Verified the regex match in apps/silvercode/src/detection.ts:43 only matches `/main.ts` (8 chars) — no trailing space consumed at the data level. The bug is in the visual rendering layer, likely in apps/silvercode/src/components/LinkifiedText.tsx or how the underlined Text span integrates with the surrounding plain Text in user-message highlight context.

The assistant-response line below renders the same content with proper spacing — bug is specific to user-message styling (role="user", uses LinkifiedText with role="user" in UserMessageBlock).

Screenshot: /tmp/explore-3-autolinks.png

Visible only in PNG render, suggests an underline-style/space-style rendering interaction in silvery text run.

Discovered in autonomous explore session 2026-04-26.

