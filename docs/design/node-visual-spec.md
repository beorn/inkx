# Node Visual Spec — State × Role Matrix

Single source of truth for how every node state maps to visual treatment across all roles. If it's not in this table, it's not a rule. If the code disagrees with this table, the code is wrong.

Replaces the 8-rule comment in `selection-style.ts` and the scattered implementation across 6+ files.

## Roles (determined by depth from board root)

| Role | Depth | Component | What it looks like |
|------|-------|-----------|-------------------|
| Board | 0 | Board.tsx | Fullscreen container |
| Column | 1 | CardColumn (column section) | Header bar + card list |
| Card | 2 | CardColumn (card section) | Bordered box with title + body + sub-items |
| Sub-item | 3+ | TreeNode | Indented line within a card |
| Body | any | TreeNode (no item) | Leaf content block within a card/sub-item |

## States (from reduced signals)

| Signal | Meaning |
|--------|---------|
| `cursor` | I am the cursor node |
| `selected` | I am in the multi-selection set (shift-selected, not cursor) |
| `cursorDescendant` | A descendant of mine has the cursor |
| `selectedAncestor` | An ancestor of mine is selected — I should be muted |
| `editingDescendant` | A descendant of mine is being edited |
| `editing` | I am being edited (inline text input active) |
| `isDone` | Task with done/dropped status |
| `doneAncestor` | An ancestor is done — I should be dimmed |
| `hovered` | Mouse is hovering over me |

## The Matrix

### Background

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | $selection-bg tint | — | — | — |
| selected | — | — | selectedBg (14%) | selectedBg on title row |
| cursorDescendant | — | — | — | — |
| selectedAncestor (muted) | — | mutedBg (6%) | mutedBg, no border | mutedBg |
| editing | — | — | — | — |
| editingDescendant | — | — | — | — |
| hovered | — | — | hoverBorder | — |
| normal | — | — | default border | — |

### Title / head row

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | — | inverseBg + $selection fg | inverseBg + $selection fg | inverseBg + $selection fg |
| selected | — | — | selectedBg on title row | selectedBg on title row |
| cursorDescendant | — | $selection fg + underline | yellow fg (not inverse) | — |
| selectedAncestor | — | dim | dim | dim |
| normal | — | default | default | default |

### Border

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | — | — | $selection-bg (yellow) | — |
| selected | — | — | $selection-bg | — |
| cursorDescendant (breadcrumb) | — | $selection-bg underline | $selection-bg border | — |
| selectedAncestor (muted) | — | — | none (border hidden) | — |
| hovered | — | — | hover color | — |
| normal | — | $surface-bg | $muted | — |

### Strip colors (inline content loses fg colors)

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor | — | — | yes (title row only) | yes (title row only) |
| selectedAncestor (muted) | — | yes | yes | yes |
| isDone / doneAncestor | — | yes | yes | yes |
| normal | — | no | no | no |

### Expand (show all children, override fold)

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| editingDescendant | — | — | expand to show editing child | — |
| cursor (direct) | — | — | expand | — |
| normal | — | — | respect fold | — |

### Dim (entire content dimmed)

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| isDone / dropped | — | dim all | dim all | dim all |
| doneAncestor | — | dim | dim | dim |
| body block (non-cursor) | — | — | dimColor | dimColor |
| normal | — | — | — | — |

### Overflow indicators ("+N more")

| State | Board | Column | Card | Sub-item |
|-------|-------|--------|------|----------|
| cursor/selected container | — | — | inherits card bg tint | — |
| normal | — | — | dimColor | — |

## Composition rules

States are **not mutually exclusive**. When multiple states apply, visual properties compose per-aspect:

1. **bg**: cursor wins > selected > muted > normal (first match)
2. **border**: breadcrumb wins > selected > hovered > muted (hidden) > normal
3. **strip colors**: cursor OR muted OR done → yes
4. **dim**: done/doneAncestor → yes (regardless of other states)
5. **expand**: editingDescendant OR cursor-direct → expand

A node CAN be: selected + cursorDescendant + editingDescendant simultaneously. bg comes from `selected`, border from `cursorDescendant` (breadcrumb), expand from `editingDescendant`.

## Token reference

| Token | Value | Used for |
|-------|-------|----------|
| `$selection-bg` | yellow-ish | Cursor inverse bg, breadcrumb borders |
| `$selection` | dark on yellow | Cursor inverse fg |
| `selectedBg(theme)` | blend(bg, primary, 14%) | Multi-selected card/sub-item bg |
| `mutedBg(theme)` | blend(bg, primary, 6%) | Muted (ancestor selected) bg |
| `$muted` | gray | Default card border, dimmed text |
| `$surface-bg` | subtle | Column border |

## Signals → visual mapping (what components actually read)

```tsx
// Card component
const { cursor, selected, cursorDescendant, selectedAncestor,
        editingDescendant, editing } = readSignals(nodeId)

const bg = cursor ? undefined          // title-only inverse, not container
  : selected ? selectedBg
  : selectedAncestor ? mutedBg
  : undefined

const border = cursor || cursorDescendant ? '$selection-bg'
  : selected ? '$selection-bg'
  : hovered ? hoverColor
  : selectedAncestor ? bg             // invisible — border matches bg
  : '$muted'

const stripColors = cursor || selectedAncestor || isDone
const expand = editingDescendant || cursor
```

## Open questions (resolved)

- ~~Should board-level cursor show ANY visual treatment?~~ **Yes** — board-level cursor tints everything with $selection-bg. Confirmed by user 2026-04-08.

## Open questions
- Should muted cards hide their border entirely or show it as the bg color?
- When cursor is on a sub-item, should the parent card show selectedBg? Currently no.
- Should `hovered` and `cursorDescendant` compose (hover on a breadcrumb card)?

## Notes

- **Deselected state** (cursor=null, all signals false) is a valid state — all nodes render as "normal". See [selection-state-spec.md](selection-state-spec.md).
- **Editing border**: editing card gets bold `$focusborder` (not `$selection-bg`), per selection-state-spec.md. This distinguishes edit scope from cursor scope visually.
- **Visible vs structural**: this spec describes visual treatment per node. State propagation uses structural tree walks (tree.ancestors/descendants). Range selection uses visible order. See [tree-reduce.md](tree-reduce.md).

## See also

- [tree-reduce.md](tree-reduce.md) — the signal propagation system
- [selection-state-spec.md](selection-state-spec.md) — 5 state concepts, mode ladder, interaction matrix
- [data-model.md](data-model.md) — visual roles are positional, not typed
- `apps/km-tui/src/views/selection-style.ts` — old rules (to be replaced by this spec)
