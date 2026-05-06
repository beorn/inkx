---
mentions:
  - km
id: "@km/tui/wikilink-brackets"
aliases:
  - km-tui.wikilink-brackets
  - km-tui-wikilink-brackets
created_by: claude:ceb7c9cb
created_at: 2026-03-29T06:51:17Z
closed_at: 2026-03-29T15:00:30Z
close_reason: "Root cause: getNodeDisplayName uses node.title which stores raw
  [[wikilinks]]. stripInlineRules only stripped ![[embeds]], not regular
  [[links]]. Fixed by adding wikilink regex to stripInlineRules."
owner: bjorn@stabell.org
---

# [x] Wikilinks show raw [[brackets]] in card titles despite InlineText being wired @km/tui #bug #P1

## Root cause: Silvery incremental rendering mismatch

**Confirmed**: InlineText IS called, parser IS correct, InlineWikiLink renders WITHOUT brackets. But the terminal text buffer shows brackets.

**Evidence**:

- `parseInlineText("2021-01-01 [[Morning Pages]]")` → `[{type:"plain","text":"2021-01-01 "},{type:"wikilink","target":"Morning Pages"}]` — no brackets
- Unit test with testEnv: `board.screenshot()` shows NO brackets
- TTY mcp__tty__text output: `▶️ 2021-01-01 [[Morning Pages]]` — HAS brackets

**Conclusion**: The silvery virtual buffer (used by testEnv) renders correctly. The ANSI output fed to the real terminal has stale content from an earlier frame where the raw text was printed before InlineText's React elements mounted.

This is an **incremental rendering bug** in silvery's output phase — the diff between prev and next buffer misses the cells where brackets should be overwritten by the InlineText output.

**Verify**: Run with `SILVERY_STRICT=1` — should catch the mismatch between incremental and fresh render.

## Repro

1. `bun km view ~/Bear/Vault`
2. Look at journals column → cards like `2021-01-01 [[Morning Pages]]`
3. The `[[` and `]]` should not be visible

