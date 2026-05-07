---
mentions:
  - km
aliases:
  - "@km/silvercode/tool-call-rendering-v2"
  - km-silvercode.tool-call-rendering-v2
  - km-silvercode-tool-call-rendering-v2
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:16Z
owner: bjorn@stabell.org
closed_at: 2026-05-06T22:23:05Z
close_reason: "Verified current implementation meets the v2 tool-call contract:
  neutral markers, no idle/success warning border/bg, hover preview without
  inline layout jump, click-to-expand detail, contiguous repeated reads, and
  error coloring. Test: bun vitest run
  apps/silvercode/tests/tool-call-rendering-v2.test.tsx
  apps/silvercode/tests/tool-call.test.tsx
  apps/silvercode/tests/diff-renderer.test.ts (74 tests passed)."
dependencies:
  - issue_id: km-silvercode.tool-call-rendering-v2
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:35:20Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
propsRaw: {}
---

# [x] Tool-call rendering — opencode-style calm rows, neutral markers, no heavy bg @km/silvercode #feature #P1

blocks:: [[@km/silvercode]]

Redesign the tool-call surface in the chat to match opencode's calm density.

Reference screenshots: ~/Desktop/screenshots/Screenshot 2026-04-25 at 23.19.01.png + 23.41.18 + 00.02.09. Source repo: ~/Code/opencode.

What changes:

- Drop bg color and heavy yellow border on tool-call rows. Tool calls should BLEND IN with prose, not pop.
- Leading marker is neutral and compact: `•` for non-shell calls, `$` for shell commands, and animated `●` while active. NO emojis.
- Tool rows use a neutral transcript grammar. The title carries the operation meaning; failures use error color.
- REMOVE silvercode's current end-of-line truncation '→' and trailing '_' artifacts. opencode just truncates with literal text overflow or '…' inline.
- Repeated single-line tool calls collapse into a tight cluster: NO blank rows / NO per-call padding between consecutive same-status calls. ListView gap=0 for consecutive ToolCall rows of the same kind+status.
- Successful tool calls collapse to one row by default. Hover previews body content in a popover without moving following rows; click toggles the same body inline for transcript review.
- Body content (when revealed) renders with subtle indent + dim fg, no border, no bg.

Files: apps/silvercode/src/components/ToolCall.tsx, ToolCallSummary.tsx, ToolCallStatusTitle.tsx, possibly SessionUpdateList.tsx (gap rules).

Acceptance:

- No 'borderColor=$warning' on idle/successful tool calls
- No bg color on tool-call container
- Neutral marker + title format, single line for collapsed rows
- Hover previews body content without inline layout jump; click toggles inline detail; no 'Click to expand' affordance text
- Expanded body: dim fg, no border, no bg, indented
- Consecutive Read/Glob/Grep: zero gap rows
- termless test: 5 successive Read calls render as 5 contiguous rows with no blank row between
- termless test: hover on a row does not reveal body inline or move following rows
- termless test: failed call renders red verb token, body still indented + no border
- termless test: click toggles body content inline

