---
id: "@km/tui/press-typesafe"
aliases:
  - km-tui.press-typesafe
  - km-tui-press-typesafe
created_by: Bjørn Stabell
created_at: 2026-04-02T00:17:27Z
---

# [ ] Type-safe board.press() — key string literal union @km/tui #task #P3

Standardize key format across keybindings, tests, and silvery keyToAnsi.

## Canonical Format (VS Code convention)
- Lowercase modifiers: ctrl, shift, alt, cmd, opt
- Proper-case named keys: Enter, Escape, Tab, ArrowUp, ArrowDown, Backspace, Delete
- Plus separator: ctrl+n, shift+Tab, cmd+k
- Single chars as-is: j, k, /, ?

## Migration Scope

### keybindings.ts (139 occurrences)
- 41x ctrl-X → ctrl+X
- 48x shift-X → shift+X
- 41x cmd-X → cmd+X
- 9x opt-X → opt+X

### Keybinding parser (keybindings.ts parseKey)
- Currently splits on "-" — needs to split on "+"
- Chord format "v c" stays unchanged

### verb-locations.ts (5x shift-)
### key-adapter.ts (1x shift-)
### Tests: already migrated (Control+ → ctrl+)

### silvery keyToAnsi
- Already uses "+" separator — no change needed
- Already accepts "ctrl" alias — no change needed

### Type Safety
- Define KeyName union type covering all valid key strings
- Apply to board.press(), keybinding definitions, keyToAnsi parameter
- Catches typos like "ctrl-n" or "Contrl+n" at compile time

## Evidence of completion
- Zero hyphen-separated modifier keys in km code
- KeyName type applied to board.press() and keybinding key field
- bun run test:fast passes