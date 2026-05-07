---
mentions:
  - km
id: "@km/silvercode/typography-presets"
aliases:
  - km-silvercode.typography-presets
  - km-silvercode-typography-presets
created_by: claude:2405c72e
created_at: 2026-04-28T22:16:31Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.typography-presets
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T15:16:31Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] Replace raw <Text bold> with typography presets across silvercode @km/silvercode #task #P3 #design

blocks:: [[@km/silvercode]]

Many silvercode components use raw <Text bold color=...> where a typography preset (<H1>/<H2>/<H3>/<Strong>/<Lead>/<Small>) would be more semantic and theme-aware. The Silvery Way principle 6 ('Style using Design Tokens') and Styling Guide §2 ('Build Hierarchy with Color + Typography') — bold/dim/italic are SGR rendering details, not design primitives. Hits found by grep -E '<Text [^>]*\bbold\b' apps/silvercode/src/components/: SessionPromptComposer.tsx (2 sites — prompt color, divider title), AvailableCommandsPalette.tsx (1 — section header), MarkdownView.tsx (3 — markdown bold/heading; legitimate, leave), SidePanel.tsx (15+ section headers — could be <H3>), ToolCallStatusTitle.tsx (3 — could be <Strong color=...>), ToolCallSummary.tsx (3 — count animation needs bold attr, leave), ToolCallError.tsx (2 — could be <Strong>), ApplyPatch.tsx (2 — SEARCH/REPLACE labels, could be <Strong>), Welcome.tsx (1 — diamond glyph; could be <Strong>), SessionRetry.tsx (1 — retry word; could be <Strong>), SubagentActivityPanel.tsx (1 — Task label; could be <Strong>), InlinePermissionPrompt.tsx (1 — header; could be <Strong>), InlineAskUserQuestionPrompt.tsx (2 — header, label; could be <Strong>), UsageMeter.tsx (3 — answer/question heads; could be <Strong>). Approach: introduce <Strong color=...> where the only attr is bold + color, leave alone where typography preset doesn't fit (animated counts, markdown body, divider re-implementation needing fine control). Acceptance: typography presets used wherever semantic; all storybook tests pass; visual diff acceptable. Discovered during @km/silvercode/design-review walkthrough.

