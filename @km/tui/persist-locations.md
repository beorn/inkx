---
id: "@km/tui/persist-locations"
aliases:
  - km-tui.persist-locations
  - km-tui-persist-locations
created_by: Bjørn Stabell
created_at: 2026-03-31T01:05:40Z
---

# [ ] Persist favorites & dynamic journal location @km/tui #feature #P2

## Problem

Locations (digit keys 0-9, custom letter keys, system keys like j/i/h/a/p/g/G)
are in-memory only — lost on exit. The journal location is static (resolves
@journal sigil node) rather than navigating to today's date file.

## Design

### Storage: <vault>/.km/config.json

Unified locations map. Every key is a location. Values are templates with tokens
expanded at navigation time.

```json
{
  "locations": {
    "h": "@next",
    "i": "@inbox",
    "j": "journals/{YYYY}/{YYYY-MM-DD}.md",
    "a": "@archive",
    "p": "{parent}",
    "g": "{first}",
    "G": "{last}",
    "0": "<node-id>",
    "1": "<node-id>"
  }
}
```

### Token types

- Date tokens: {YYYY}, {MM}, {DD}, {YYYY-MM-DD} — resolved to today's date
- Positional tokens: {parent}, {first}, {last} — resolved relative to cursor
- No tokens: literal node reference — passed to resolveNode()

### Behavior

- On startup: load .km/config.json, populate locations map
- On setFavorite/clearFavorite: write back to .km/config.json
- resolveLocationKey: expand tokens, then resolveNode() or positional dispatch
- Template paths (date tokens): expand, resolveNode(), auto-create file if missing
- Default config created on first launch with system defaults above

### Implementation

1. Add .km/config.json read/write (next to workspace-persist.ts)
2. Unify favorites.ts — single persisted locations map replaces in-memory Map
3. Template expander: detect {tokens}, expand date/positional
4. resolveLocationKey: use expanded template instead of hardcoded REPO_LOCS
5. Auto-create missing files for date-template locations (mkdir -p + write)
6. Remove hardcoded REPO_LOCS, hardcoded positional cases — all from config