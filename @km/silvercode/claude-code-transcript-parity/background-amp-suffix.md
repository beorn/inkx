---
mentions:
  - km
  - claude
id: "@km/silvercode/claude-code-transcript-parity/background-amp-suffix"
aliases:
  - "@km/silvercode/background-amp-suffix"
  - km-silvercode.background-amp-suffix
  - km-silvercode-background-amp-suffix
created_by: claude:2405c72e
created_at: 2026-04-26T05:55:59Z
closed_at: 2026-04-26T06:38:49Z
close_reason: "Shipped: b0c8e92ed. Trailing & strips and immediately backgrounds
  turn. 4 tests. Session: km-session.0425-evening"
started_at: 2026-04-26T05:56:06Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.background-amp-suffix
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T22:56:05Z
    created_by: claude:2405c72e
    metadata: "{}"
props: {}
propsRaw: {}
---

# [x] Trailing '&' on command sends + immediately backgrounds the turn (Claude Code parity) @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

Claude Code: typing 'long task &' submits the message AND backgrounds the turn so the user can keep typing while the turn streams in the background. silvercode has Ctrl+B for backgrounding in-flight turns; add the '&' suffix as a submit-AND-background shortcut. Remove the trailing '&' from the message before sending; immediately call controller.backgroundActiveTurn() after submit. Files: apps/silvercode/src/App.tsx (sendMessage helper). Test: submit 'foo &', assert background-turn fired and the actual sent message is 'foo' (no &).

