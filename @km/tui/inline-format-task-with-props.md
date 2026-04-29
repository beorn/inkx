---
id: "@km/tui/inline-format-task-with-props"
aliases:
  - km-tui.inline-format-task-with-props
  - km-tui-inline-format-task-with-props
created_by: Bjørn Stabell
created_at: 2026-04-14T18:37:54Z
closed_at: 2026-04-14T18:43:09Z
close_reason: Fixed in c08133942. ast2nodes stripPropsAndMetadataFromSource
  strips props/metadata from the raw source slice while preserving
  bold/link/code/wikilink markers. 5 new tests in kmast-integration.test.ts
  cover bold+props, URL+props, inline code+props, bold+wikilink+props.
---

# [x] Tasks with inline props lose bold/links/code in rendered content @km/tui #bug #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

Screenshot 2026-04-14 shows tasks like `- [ ] Pay **CA FTB $2,500** via https://... priority:: P0 due:: 2026-04-15` rendering as plain text — no bold, no link styling.

**Root cause**: ast2nodes.ts line 538 has a guard `nothingStripped` that only sets `_mdSource` when NO props, metadata, or task fields were stripped. Tasks with inline props always fail this check, so `_mdSource = undefined`, and the render path in embed-display.ts falls back to `node.content` which is plain text (parser's `listItemToText` strips markdown markers).

**Fix**: always capture the raw source slice AND strip only the inline props from it (not the bold/links). The serializer already safely detects propsRaw presence via getUneditedInlineSource and falls back to reconstruction, so no double-emit risk.

Reported in /pm command with real repro from ~vault/@next.md +taxes — this week card.