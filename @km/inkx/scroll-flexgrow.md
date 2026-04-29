---
id: "@km/inkx/scroll-flexgrow"
aliases:
  - km-inkx.scroll-flexgrow
  - km-inkx-scroll-flexgrow
created_by: claude:a3625ec3
created_at: 2026-02-09T14:43:38Z
closed_at: 2026-02-09T15:21:33Z
owner: bjorn@stabell.org
assignee: claude:a3625ec3
---

# [x] overflow=scroll/hidden + flexGrow shows bottom of content instead of top @km/inkx #bug #P2 @claude:a3625ec3

When a Box has overflow='scroll' or overflow='hidden' and uses flexGrow={1} for height (no explicit height prop), content renders from the bottom instead of the top. scrollOffset={0} and scrollTo={0} have no effect. The scroll example works because it uses an explicit height={10}. The Sidebar works because width={28} gives it a fixed dimension. Root cause: likely the layout engine gives the Box its full content height rather than the flex-allocated height when calculating scroll viewport. Repro: viewer.tsx SourceCode component with 200+ line files.