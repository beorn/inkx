---
mentions:
  - km
id: "@km/silvery/search-match-ranges-in-renderitem"
aliases:
  - km-silvery.search-match-ranges-in-renderitem
  - km-silvery-search-match-ranges-in-renderitem
created_by: claude:c56dc5d6
created_at: 2026-04-23T20:36:20Z
closed_at: 2026-04-23T21:25:19Z
close_reason: fba21c81e — ListItemMeta.matchRanges + searchQuery shipped;
  computeMatchRanges(text, query) exported from @silvery/ag-term; km-logview
  migrated (highlightQuery) with 2 new logview tests + 4 new ListView tests; 0
  new tsc errors; 69/69 vendor + 44/44 logview tests pass
owner: bjorn@stabell.org
---

# [x] Pass search match ranges to ListView renderItem via ListItemMeta @km/silvery #feature #P2

## Problem

Silvery's ListView exposes a \`search={{ getText }}\` prop that lets consumers make items searchable, and SearchProvider's useSearch hook returns \`matches: SearchMatch[]\`. But match coordinates are \`{ row, startCol, endCol }\` indexed into a concatenated virtual-stream of all items' text — NOT mapped back to item + field. So consumers cannot highlight matches in their own renderItem output without re-running indexOf against the source strings.

Discovered 2026-04-23 while wiring search highlighting in @km/logview. Every field (pill, body line) has to re-scan for the query — cheap in practice, but feels like a framework gap.

## Design

Extend \`ListItemMeta\` (the third arg to \`renderItem\`) with an optional \`searchMatches: SearchMatch[]\` field populated with the matches whose \`row\` falls within this item's line range. The consumer can then paint highlights precisely without re-searching.

\`\`\`ts
export interface ListItemMeta {
  isCursor: boolean
  // NEW — matches that belong to THIS item, already translated to
  // item-local coordinates (row → lineIdx within the item's text).
  searchMatches?: SearchItemMatch[]
}
export interface SearchItemMatch {
  lineIdx: number     // 0-indexed within the item (0 = first line of item)
  startCol: number
  endCol: number
  isCurrent: boolean  // true when this is the currently-navigated match
}
\`\`\`

## Acceptance criteria

- [ ] \`ListItemMeta.searchMatches\` populated from the active search state
- [ ] \`isCurrent\` flag identifies the currently navigated match (for brighter bg)
- [ ] Coordinates are item-local (lineIdx), not global (row)
- [ ] Contract test: items with no matches get undefined/empty searchMatches
- [ ] Feature test: during active search, matching rows get their matches attached
- [ ] @km/logview can drop its local highlight() helper in favor of using the meta

## Notes for implementation

- Virtualizer already tracks item → line range via \`getText\` (each item can span multiple logical lines). Reuse that lookup.
- Current-match identification: find match.row == state.currentMatch's row (they'll share the same absolute row)
- This is additive — existing renderItems that ignore the meta continue to work

