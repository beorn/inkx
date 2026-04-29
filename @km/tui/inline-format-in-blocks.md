---
id: "@km/tui/inline-format-in-blocks"
aliases:
  - km-tui.inline-format-in-blocks
  - km-tui-inline-format-in-blocks
created_by: Bjørn Stabell
created_at: 2026-04-14T17:31:28Z
closed_at: 2026-04-14T17:32:18Z
close_reason: "Fixed in efb1db1ff. Two root causes: (1) nodeToText flattens
  inline mdast into plain text — getDisplayContent now prefers data._mdSource
  when unedited so **Bolded** survives to InlineText; (2) TreeNode suppressed
  bullets for ALL body nodes — now excludes KNode.isListItem so list items keep
  their marker. Test: apps/km-tui/tests/text/inline-rendering.test.ts 'inline
  formatting in body blocks' — 43 passed in file, 2119 passed in km-tui fast
  suite."
---

# [x] Bullets and bold render as plain p-blocks in body content @km/tui #bug #P2

blocks:: [[@km/tui]]
