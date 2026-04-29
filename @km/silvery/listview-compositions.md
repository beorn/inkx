---
id: "@km/silvery/listview-compositions"
aliases:
  - km-silvery.listview-compositions
  - km-silvery-listview-compositions
created_by: Bjørn Stabell
created_at: 2026-04-02T21:47:08Z
closed_at: 2026-04-03T01:17:58Z
close_reason: "All 5 compositions shipped: SelectList, Console, Table, TreeView,
  PickerList. All delegate to ListView, get cache/nav/search for free."
owner: bjorn@stabell.org
---

# [x] ListView as universal container — SelectList/Console/Table/TreeView compositions @km/silvery #feature #P2

Rewrite all list-like components as thin compositions over ListView, giving them cache/nav/search for free.

## Compositions

| Component | What it adds over raw ListView |
|---|---|
| SelectList | onChange(item) shorthand, children(item, {isSelected}) render API, simpler pick-one API |
| Console | cache:true + followOutput by default, auto-cache completed entries, timestamp/log-level rendering |
| Table | Column definition + header row, cell-level renderItem, column sorting via nav, column resize |
| TreeView | Flatten tree to list, indent rendering, expand/collapse via nav (Enter/arrows), subtree caching |
| PickerList | Fuzzy filter (items filtered before ListView), search for filtering not in-content, onSelect |
| CommandPalette | PickerList + command registry, fuzzy match on titles, keybinding hints |

## Architecture

```
ListView (foundation: items + renderItem + getKey + cache + nav + search)
├── SelectList  = ListView + onChange + isSelected
├── Console     = ListView + cache:true + followOutput
├── Table       = ListView + columns + headers + cell render
├── TreeView    = ListView + flatten + indent + expand/collapse
├── PickerList  = ListView + fuzzy filter + onSelect
└── CommandPalette = PickerList + command registry
```

## Three tiers of usage
- Tier 1 (preset): <SelectList items={items} onChange={fn}>{renderFn}</SelectList>
- Tier 2 (configured): <ListView items={items} cache nav search renderItem={fn} />
- Tier 3 (building blocks): createListCache() + createListDocument() + custom

## What this enables
- Ctrl+F in any component (all get search for free)
- Caching everywhere (Console caches old output, TreeView caches collapsed subtrees)
- Consistent nav everywhere (j/k/arrows/Enter)
- Mode-agnostic (inline/fullscreen/panes via cache backend)
- Headless testable (nav/search are TEA state machines)
- AI-automatable (nav/search are commands in the command tree)

## Dependencies
Requires Phase 0 (naming) + Phase 5 (cache) + search-machine to be done first.