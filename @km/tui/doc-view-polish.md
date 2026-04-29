---
id: "@km/tui/doc-view-polish"
aliases:
  - km-tui.doc-view-polish
  - km-tui-doc-view-polish
created_by: claude:ceb7c9cb
created_at: 2026-03-29T06:40:39Z
closed_at: 2026-03-30T07:40:10Z
close_reason: "Fixed all items: (1) Popover uses DocContent renderer via lazy
  render callback — done in prior session. (2) stripInlineRules now strips
  [[wikilinks]] — done in prior session. (3) Unfocused cursor blue-on-blue:
  added colorOverride=null on cursor row in DetailView DocNode, stripping link
  colors when bg is selection-bg. (4) Card title heading colors:
  colorOverride=null when ownColor is set in TreeNode."
---

# [x] Doc view polish: wikilink rendering, unfocused cursor colors, link visibility @km/tui #bug #P2

## Pipeline Analysis (2026-03-28)

All core content paths use InlineText with resolveWikiLink:
- Card title (TreeNode:618) ✅
- Card body (FoldedChildRow:942) ✅
- Detail/doc view (DocNode) ✅
- Search results (NodeLine) ✅

Paths that DON'T use InlineText:
- **Popover preview** ❌ — renders raw child.content. BUG.
- Breadcrumb — parseToPlainText(). Intentional.
- Column header — displayName. Intentional.

## Bracket mystery

Screenshots show [[brackets]] in card titles despite InlineText being wired.
Parser correctly parses [[wikilinks]] (confirmed with test).
InlineWikiLink renders WITHOUT brackets in both resolved and unresolved paths.
Hypothesis: silvery incremental rendering mismatch — stale content from a prior frame.
Test with SILVERY_STRICT=1 to confirm.

## Remaining fixes
1. Popover: use DocContent renderer (2 levels) instead of PopoverLine text
2. Unfocused cursor: blue bg + blue link = invisible
3. Breadcrumb: skip last segment in detail view mode
4. Investigate brackets — likely incremental render bug