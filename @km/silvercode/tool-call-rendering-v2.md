---
id: "@km/silvercode/tool-call-rendering-v2"
aliases:
  - km-silvercode.tool-call-rendering-v2
  - km-silvercode-tool-call-rendering-v2
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:16Z
---

# [ ] Tool-call rendering — opencode-style: blend in, leading →, no bg, no heavy yellow, type differentiation, collapse repeats @km/silvercode #feature #P1

blocks:: [[@km/silvercode]]

Redesign the tool-call surface in the chat to match opencode's calm density.

Reference screenshots: ~/Desktop/screenshots/Screenshot 2026-04-25 at 23.19.01.png + 23.41.18 + 00.02.09. Source repo: ~/Code/opencode.

What changes:
- Drop bg color and heavy yellow border on tool-call rows. Tool calls should BLEND IN with prose, not pop.
- Leading glyph = '→' (single arrow) followed by the verb + path. NO emojis. e.g. '→ Read README.md', '→ Glob "src/**/*.ts"', '→ Bash ls -la …'.
- Differentiate tool TYPE via the verb token + subtle color (still semantic): Read/Glob/Grep get a calm cyan, Write/Edit get a calm green, Bash gets a neutral fg, errors red.
- REMOVE silvercode's current end-of-line truncation '→' and trailing '_' artifacts. opencode just truncates with literal text overflow or '…' inline.
- Repeated single-line tool calls collapse into a tight cluster: NO blank rows / NO per-call padding between consecutive same-status calls. ListView gap=0 for consecutive ToolCall rows of the same kind+status.
- Successful Read/Glob/Grep collapse to a single line by default (just '→ Read README.md'). Body REVEALS ON HOVER (mouse over the row), NOT a 'Click to expand' affordance — silvery's useHover signal drives the expand. opencode uses the same hover-reveal pattern.
- Body content (when revealed) renders with subtle indent + dim fg, no border, no bg.

Files: apps/silvercode/src/components/ToolCall.tsx, ToolCallSummary.tsx, ToolCallStatusTitle.tsx, possibly SessionUpdateList.tsx (gap rules).

Acceptance:
- No 'borderColor=$warning' on idle/successful tool calls
- No bg color on tool-call container
- Leading '→ <verb> <args>' format, single line for collapsed
- Body reveals on hover (useHover), not on click; no 'Click to expand' affordance text
- Expanded body: dim fg, no border, no bg, indented
- Consecutive Read/Glob/Grep: zero gap rows
- termless test: 5 successive Read calls render as 5 contiguous rows with no blank row between
- termless test: hover on a row reveals the body; cursor away hides it
- termless test: failed call renders red verb token, body still indented + no border