---
mentions:
  - km
id: "@km/silvercode/user-turn-bg-only"
aliases:
  - km-silvercode.user-turn-bg-only
  - km-silvercode-user-turn-bg-only
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:20Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.user-turn-bg-only
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:35:19Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] User turns get bg color; agent turns plain; hover-bg only on clickable ops @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Asymmetric turn styling: USER messages get a subtle bg (so the eye finds the user input fast); ASSISTANT/agent turns render plain on the chat bg. Clickable ops (tool-call rows, link-bearing prose) get hover-bg only when the cursor is on them.

Reference: opencode does exactly this — see ~/Desktop/screenshots/Screenshot 2026-04-25 at 23.19.01.png. The user prompts have a darker contained bg; the long agent response below is plain on the dark bg.

Files: apps/silvercode/src/components/ExchangeItem.tsx, SessionUpdateList.tsx, ToolCall.tsx (hover-bg).

Acceptance:

- User-message rendered inside a Box with bg='$mutedbg' (or similar subtle), padding=1
- Assistant message rendered plain (no Box bg)
- ToolCall rows: hover-bg only when isHovered, otherwise plain
- termless test: user turn cell colors at the body match user-bg; assistant turn cell colors match plain bg

