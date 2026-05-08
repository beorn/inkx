---
mentions:
  - km
aliases:
  - "@km/silvercode/user-turn-bg-only"
  - km-silvercode.user-turn-bg-only
  - km-silvercode-user-turn-bg-only
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:20Z
owner: bjorn@stabell.org
closed_at: 2026-05-06T22:23:05Z
close_reason: "Verified current chat styling: user prompts render through
  Chat.Turn.Prompt with subtle raised background, assistant narration remains
  plain, and tool hover backgrounds only appear for interactive detail. Test:
  bun vitest run apps/silvercode/tests/notification-block.test.tsx
  apps/silvercode/tests/content-layout.test.tsx
  apps/silvercode/tests/notification-welcome-artifact.test.tsx
  apps/silvercode/tests/welcome-features.test.tsx
  apps/silvercode/tests/welcome-pane-hidden.test.tsx
  apps/silvercode/tests/welcome-screen-paints.test.tsx (70 tests passed)."
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
propsRaw: {}
---

# [x] User turns get bg color; agent turns plain; hover-bg only on clickable ops @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Asymmetric turn styling: USER messages get a subtle bg (so the eye finds the user input fast); ASSISTANT/agent turns render plain on the chat bg. Clickable ops (tool-call rows, link-bearing prose) get hover-bg only when the cursor is on them.

Reference: opencode does exactly this — see ~/Desktop/screenshots/Screenshot 2026-04-25 at 23.19.01.png. The user prompts have a darker contained bg; the long agent response below is plain on the dark bg.

Current implementation lives in `apps/silvercode/src/components/Chat.tsx`, `SessionUpdateList.tsx`, and `ToolCall.tsx`.

Acceptance:

- User-message rendered through `Chat.Turn.Prompt` inside a right-aligned bubble with subtle background and padding
- Assistant message rendered plain (no Box bg)
- ToolCall rows: hover-bg only when isHovered, otherwise plain
- termless test: user turn cell colors at the body match user-bg; assistant turn cell colors match plain bg

## Implementation Notes

2026-05-06:

- Current `Chat.Turn.Prompt` uses `USER_PROMPT_BUBBLE_BG = "$bg-surface-raised"` with padding.
- Assistant narration renders via `Chat.Turn.Narration` on the plain transcript background.
- Tool rows use hover/expanded backgrounds only when interactive detail is available.
- Verification: `bun vitest run apps/silvercode/tests/content-layout.test.tsx apps/silvercode/tests/notification-event-row.test.tsx apps/silvercode/tests/notification-welcome-artifact.test.tsx apps/silvercode/tests/notification-stream.test.ts` passed, 61 tests.

