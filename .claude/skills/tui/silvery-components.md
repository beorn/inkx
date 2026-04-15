# Silvery Components — Audit Gate

**Before building a new km-tui component, check this list.** If silvery already ships the primitive, use it. Do NOT reimplement.

This is a lookup doc, not a tutorial. For deep docs, read [The Silvery Way](../../../vendor/silvery/docs/guide/the-silvery-way.md) and [Styling](../../../vendor/silvery/docs/guide/styling.md). Source lives in `vendor/silvery/packages/ag-react/src/`.

## Why this exists

Building the km-tui unified omnibox duplicated ~700 lines of silvery primitives: `PickerDialog`, `TextInput`, `useReadline`, `PickerList`, `ModalDialog`, `CommandPalette`. None of these should have been rebuilt. The gap wasn't technical — it was procedural. Nothing in the workflow said "before you write a new component, check silvery." This doc is that gate.

**Rule:** If your km-local component's job matches anything in this table, delete it and use silvery's version. If silvery's version is missing a prop or feature, add the prop or feature to silvery (in `vendor/silvery/`) and then consume it. Never fork.

## Import paths

Everything is re-exported from `@silvery/ag-react`. Subpath barrels:
- `silvery` — main barrel: components, hooks, render, types
- `silvery/runtime` — `run()`, `useInput`, `createRuntime`
- `silvery/theme` — `ThemeProvider`, `useTheme`, palettes, color utils
- `silvery/ui` — full component library

For km-tui code, import from `@silvery/ag-react` (or the `silvery` barrel). The `ag-react` package is the canonical entry point.

## Input primitives

| Component / Hook | Purpose | Key props | Import |
|---|---|---|---|
| **TextInput** | Controlled or uncontrolled single-line input with full readline (kill ring, word movement, Ctrl+A/E/K/U/W/Y, Alt+B/F, transpose). Native placeholder hides on non-empty value. Optional `borderStyle`, `focusBorderColor`, `prompt`, `promptColor`, `mask`, `cursorStyle`. | `value`, `defaultValue`, `onChange`, `onSubmit`, `onEOF`, `placeholder`, `isActive`, `prompt`, `promptColor`, `borderStyle`, `focusBorderColor`, `mask` | `@silvery/ag-react` |
| **TextArea** | Multi-line text editor with the same readline + word movement bindings as TextInput plus soft-wrap and cursor-line awareness. | `value`, `onChange`, `onSubmit`, `width`, `height`, `placeholder` | `@silvery/ag-react` |
| **useReadline** | Headless state machine underlying TextInput / TextArea. All readline bindings, kill ring, word/line movement, transpose — zero UI. Use when you need custom chrome around readline semantics. | `{ initialValue, onChange, isActive, handleEnter?, handleEscape?, handleVerticalArrows? }` → `{ value, beforeCursor, afterCursor, target }` | `@silvery/ag-react` |
| **CursorLine** | Pure-display cursor helper: renders `beforeCursor` + block cursor + `afterCursor`. Used inside TextInput/TextArea. Use only if you're building a custom input and already own the readline state. | `beforeCursor`, `afterCursor`, `showCursor` | `@silvery/ag-react` |
| **useEditContext** | Lower-level edit context (not readline-specific). Backs inline edit targets for board cards. Use `useReadline` first — this is for non-readline edit flows (e.g. card title edit with Enter semantics). | `{ initialValue, onChange, onConfirm, onCancel }` → `{ beforeCursor, afterCursor, setValue, target }` | `@silvery/ag-react` |

## Lists, pickers, and palettes

| Component | Purpose | Key props | Import |
|---|---|---|---|
| **ListView** | Virtualized scrolling list. Foundation for every list in silvery — use directly when you need custom rendering + virtualization without selection semantics. | `items`, `height`, `renderItem(item, index, meta)`, `getKey`, `cursorKey`, `nav`, `active` | `@silvery/ag-react` |
| **VirtualList** | Alias around ListView for the common "render a long list" case. | same shape as ListView | `@silvery/ag-react` |
| **HorizontalVirtualList** | Horizontal scrolling variant. Used for column strips. | `items`, `width`, `renderItem`, `getKey` | `@silvery/ag-react` |
| **SelectList** | List with built-in j/k navigation, mouse, scroll, selection highlighting. Use when you want a list the user picks from with the keyboard out of the box. | `items`, `onSelect`, `isActive`, `cursorIndex`, `onCursorChange`, `renderItem` | `@silvery/ag-react` |
| **PickerList** | Scrollable selection list with scroll offset + viewport management. Caller owns `selectedIndex`. Use inside a custom picker shell when you want the virtualization and scroll math but your own input + keyboard routing. | `items`, `selectedIndex`, `renderItem(item, selected)`, `getKey`, `emptyMessage`, `maxVisible` | `@silvery/ag-react` |
| **PickerDialog<T>** | Full search-and-select dialog: `ModalDialog` + readline input + `PickerList` + keyboard routing (arrows, Enter, Esc, PgUp/PgDn). The default shape for "user types to filter, arrows to navigate, Enter to pick". | `title`, `placeholder`, `items`, `renderItem`, `getKey`, `onSelect`, `onCancel`, `onChange`, `initialValue`, `emptyMessage`, `maxVisible`, `width`, `height`, `footer`, `prompt`, `promptColor` | `@silvery/ag-react` |
| **CommandPalette** | Opinionated command-palette variant of PickerDialog — items are `{ name, description, shortcut }`, fuzzy filter is built in. | `commands`, `onSelect`, `onClose`, `placeholder`, `maxVisible`, `isActive` | `@silvery/ag-react` |
| **TreeView** | Collapsible tree renderer with keyboard navigation and expand/collapse. Use for hierarchical data. | `items`, `renderNode`, `getChildren`, `expanded`, `onExpand`, `cursorKey` | `@silvery/ag-react` |

## Dialogs and overlays

| Component | Purpose | Key props | Import |
|---|---|---|---|
| **ModalDialog** | Bordered, centered dialog shell with optional title, hotkey badge, footer. Children render inside. Pair with `CenterDialog` / `TopRightDialog` from km-tui for absolute positioning. | `title`, `hotkey`, `width`, `height`, `footer`, `titleAlign` | `@silvery/ag-react` |
| **Toast** | Transient notification. `ToastStack` manages the queue. | `message`, `kind`, `duration` | `@silvery/ag-react` |
| **Tooltip** | Inline tooltip — renders next to its anchor. For floating popovers with viewport clamping and overlap positioning, see the km-local `Popover.tsx` (no silvery equivalent yet — tracked in `km-silvery.popover`). | `content`, `children` | `@silvery/ag-react` |

## Data display

| Component | Purpose | Key props | Import |
|---|---|---|---|
| **Table** | Tabular layout with column widths, headers, row selection. Use instead of hand-rolling `Box` grids for aligned data. | `columns`, `rows`, `selectedIndex` | `@silvery/ag-react` |
| **GridCell** | Grid cell primitive for custom table/grid layouts. | `row`, `col`, `width`, `height` | `@silvery/ag-react` |
| **ProgressBar** | Horizontal progress indicator with optional label. | `value`, `max`, `label`, `width`, `color` | `@silvery/ag-react` |
| **Spinner** | Loading indicator with optional label. | `label`, `color`, `frame` | `@silvery/ag-react` |
| **Skeleton** | Loading placeholder block. | `width`, `height` | `@silvery/ag-react` |
| **Badge** | Small inline status/count pill. | `children`, `color`, `variant` | `@silvery/ag-react` |
| **Console** | Terminal-style log console with scrollback. Used by km-tui's `/console`. | `entries`, `height` | `@silvery/ag-react` |

## Navigation

| Component | Purpose | Key props | Import |
|---|---|---|---|
| **Tabs** | Tabbed view with keyboard navigation. | `items`, `selected`, `onSelect` | `@silvery/ag-react` |
| **Breadcrumb** | Path-style breadcrumb trail. | `items`, `separator` | `@silvery/ag-react` |
| **SearchBar** | Thin compact search bar (query + match count). For a full search surface use `PickerDialog`. | `query`, `matchCount`, `matchIndex` | `@silvery/ag-react` |

## Form controls

| Component | Purpose | Key props | Import |
|---|---|---|---|
| **Button** | Focusable, clickable button. Use instead of `<Box onClick>` + `<Text>` for any interactive primitive. | `onClick`, `children`, `isActive`, `disabled` | `@silvery/ag-react` |
| **Toggle** | Boolean toggle (checkbox / switch). | `value`, `onChange`, `label` | `@silvery/ag-react` |
| **Form** | Form layout with field registration and submit handling. | `onSubmit`, `children` | `@silvery/ag-react` |

## Layout

| Component | Purpose | Key props | Import |
|---|---|---|---|
| **Box** | Core layout primitive. Flexbox via Flexily. Every custom layout starts here. | `flexDirection`, `flexGrow`, `gap`, `padding`, `border*`, `backgroundColor`, `width`, `height`, `overflow`, `onMouseEnter`, `onClick`, `onWheel`, `id`, `data-*` | `@silvery/ag-react` |
| **Divider** | Horizontal or vertical divider. | `orientation`, `color`, `char` | `@silvery/ag-react` |
| **Screen** | Full-terminal Screen wrapper — manages alt screen, dimensions. | `children` | `@silvery/ag-react` |
| **SplitView** | Resizable 2-pane split. | `direction`, `initialRatio`, `children` | `@silvery/ag-react` |

## Typography

Use these instead of `<Text color="$primary" bold>` manual combinations — they bake the semantic token pairing so themes flip cleanly.

| Component | Role | Import |
|---|---|---|
| **H1** / **H2** / **H3** | Headings. H1 = `$primary` bold, H2 = `$accent` bold, H3 = bold. | `@silvery/ag-react` |
| **Muted** | Secondary text in `$muted`. | `@silvery/ag-react` |
| **Small** | Dim secondary in `$muted + dim`. | `@silvery/ag-react` |
| **Code** | Inline code in `$mutedbg` background. | `@silvery/ag-react` |
| **Blockquote** | Indented quote style. | `@silvery/ag-react` |
| **Text** | Generic styled text. Only use directly when typography presets don't fit. | `@silvery/ag-react` |
| **Heading** | Generic heading when you need a non-H1/H2/H3 level. | `@silvery/ag-react` |
| **Link** | Underline-on-hover hyperlink. Emits `link:open` on Cmd+click. | `@silvery/ag-react` |

## Feedback

| Component | Purpose | Import |
|---|---|---|
| **ErrorBoundary** | React error boundary with fallback UI. Wrap any subtree that could throw. | `@silvery/ag-react` |

## Hooks

### Input and focus

| Hook | Purpose | Returns |
|---|---|---|
| **useInput** | Subscribe to raw keypresses. Return `"exit"` to quit. Supports `isActive`, `onRelease`, `onPaste`. One unified hook — same from `silvery` and `silvery/runtime`. | — |
| **useFocus** | Register a component in the focus tree. Modals auto-consume input. | `{ isFocused }` |
| **useFocusManager** | Read/write the focus tree: `focusNext`, `focusPrev`, `setFocus`, `activeId`, `scopeStack`. | focus manager |
| **useFocusable** | Lower-level focus registration with scoping. | `{ isFocused, ref }` |
| **useFocusWithin** | Is any descendant focused? | `boolean` |
| **useModifierKeys** | Tracks held Cmd/Shift/Ctrl/Alt via Kitty release events. Gate with `enabled: hovered` so zero cost for non-hovered elements. | `{ super, shift, ctrl, alt }` |
| **useMouseCursor** | Request a pointer cursor style while a condition holds. | — |
| **useCursor** | Low-level cursor position state. | `{ row, col }` |
| **useInputLayer** | Push an input layer (captures keys until popped). | `{ push, pop }` |
| **useCopyModeState** | Copy-mode state for vim-style selection. | state |
| **useFindState** | In-app Find (`Ctrl+F`) state. | state |

### Layout and measurement

| Hook | Purpose | Returns |
|---|---|---|
| **useLayout** | Base synchronous layout access. | `{ width, height, x, y }` |
| **useBoxMetrics** | Synchronous Box rect — width, height, inner/outer, border-aware. | metrics |
| **useScrollRegion** | Scroll offsets for an overflow container. | `{ scrollTop, scrollLeft }` |
| **useGridPosition** | Grid cell position info. | `{ row, col }` |
| **useAgNode** | Raw AgNode handle + signals. Rarely needed — use `useBoxMetrics` first. | `{ node, signals }` |

### App and lifecycle

| Hook | Purpose | Returns |
|---|---|---|
| **useApp** | Access the app store (zustand API). | store |
| **useRuntime** | Access the runtime (term, plugins, dispatch). | runtime |
| **useTerm** | Access the Term abstraction (stdin/stdout/dims/backend). | term |
| **useStdout** | Access the stdout writer. | writable |
| **useStderr** | Access the stderr writer. | writable |
| **useTerminalFocused** | Is the terminal window focused? | `boolean` |
| **useExit** | Request app exit. | `() => void` |
| **useSignal** | Subscribe to an alien-signal. | `T` |

### Interaction

| Hook | Purpose | Returns |
|---|---|---|
| **useInteractiveState** | Tracks hover / pressed / focused for interactive primitives. | flags |
| **useDragState** | Drag state for draggable elements. | state |
| **useSelection** | Mouse-drag text selection. | selection |
| **useAnimation** | Frame-based animation tick. | `frame` |
| **useColorScheme** | Current theme / palette info. | scheme |
| **useConsole** | Access the Console log surface. | handlers |
| **usePaste / usePasteCallback / usePasteEvents** | Bracketed paste events. | — |
| **usePositionRegistry** | Register positions for cross-component lookup. | — |
| **useVirtualization / useVirtualizer** | Virtualization primitives (used by VirtualList/ListView). | — |
| **useListItem** | Per-item state for list rows. | — |

## Anti-patterns

These are the ways km-tui has accidentally reinvented silvery primitives. If you catch yourself doing any of these, stop and switch to the silvery version.

| Don't | Use instead | Why |
|---|---|---|
| Hand-roll a text input with `CursorLine` + a local state machine | `TextInput` (or `useReadline` + `CursorLine` if you need custom chrome) | Silvery's readline handles kill ring, word movement, transpose, Ctrl shortcuts, placeholder, border, focus — every time you reimplement you miss some |
| Manually track `selectedIndex` + keyboard routing for a list picker | `SelectList` (built-in j/k) or `PickerList` (caller owns index) | Scroll offset math, keyboard routing, mouse hover, highlighting — all solved |
| Compose `ModalDialog + InputBox + filtered list` | `PickerDialog<T>` | ~150 lines of routing, readline wiring, auto-size, footer all baked in |
| Write a custom "command palette" overlay | `CommandPalette` | Fuzzy filter, keyboard nav, dismiss semantics already there |
| Manually parse Cmd/Shift/Ctrl/Alt from keypresses | `useModifierKeys` | Release events are handled, no subscribe-cost when not hovered |
| `Box theme={{ bg: "#xxx" }}` for a background change | `backgroundColor="$surfacebg"` | `theme={{}}` re-resolves every `$token` — wastes render work |
| Hardcoded color strings (`"red"`, `"#ff0000"`) | Semantic tokens (`$primary`, `$success`, `$error`, `$muted`) | Themes won't flip; 38 palettes break |
| `<Text color="$primary" bold>...</Text>` for headings | `<H1>`, `<H2>`, `<Muted>`, `<Small>` | Typography presets bake the semantic token pairing |
| Manual mouse event parsing on `Box` | `Box.onClick`, `Box.onMouseEnter`, `useMouseCursor` | Already wired through the dispatch pipeline |

## Known duplication in km-tui (to clean up)

These km-local components duplicate silvery primitives. Migrate when you next touch them.

- **`apps/km-tui/src/views/shared-components.tsx:423` — `InputBox`** — duplicates `TextInput`. Wraps `CursorLine` + prompt + placeholder + focus ring. km's `ghostHint` prop should move to silvery's `TextInput` as a new feature. Consumers: `SearchDialog.tsx`, `WorkspaceChrome.tsx` (omnibox), `UnifiedOmnibox.tsx`. Tracked in `km-tui.omnibox-use-silvery`.
- **`apps/km-tui/src/hooks/use-dialog-input.ts` — `useDialogInput`** — wraps `useEditContext` with dialog Enter/Escape/arrow routing. Most of this lives in silvery's `useReadline` (with `handleEnter: false, handleEscape: false, handleVerticalArrows: false`) plus a thin `useInput` for the dialog-specific keys. Tracked in `km-tui.omnibox-use-silvery`.
- **`apps/km-tui/src/views/SearchDialog.tsx`** — hand-rolls ModalDialog + InputBox + filtered list. `PickerDialog<SearchResult>` composes exactly this shape. Migration deferred — track in `km-review.silvery-gap-analysis`.
- **`apps/km-tui/src/views/ItemPicker.tsx`** — same shape (ModalDialog + input + list). `PickerDialog` covers it. Deferred.
- **`apps/km-tui/src/views/FavoritesDialog.tsx`** — same shape. `PickerDialog` covers it. Deferred.
- **`apps/km-tui/src/views/Popover.tsx`** — rich floating popover with viewport clamping and corner-cascade positioning. Silvery has `Tooltip` but it's inline-only. No duplication yet — this is a **SILVERY GAP**. Tracked as `km-silvery.popover` — when that lands, migrate km's Popover to consume it.
- **`apps/km-tui/src/views/FilterDialog.tsx`** — uses `ModalDialog` directly, which is correct (it's not a picker). No action.
- **`apps/km-tui/src/views/shared-components.tsx:579` — `ConfirmDialog`** — no direct silvery equivalent; keep until silvery ships a `ConfirmDialog` primitive.

## When to upgrade silvery vs wrap locally

**Upgrade silvery** when the feature is a generic concern that any terminal UI would want:
- A new `TextInput` prop (ghost hint, mask variant, cursor style)
- A new `PickerList` prop (group headers, empty state content)
- A new hook (useModifierKeys was added this way)

**Wrap locally in km-tui** when the feature is domain-specific:
- km's `OmniboxRow` is a `renderItem` for `PickerList` — it's km-specific because it knows about KNode icons, task status, and highlighted match decorations. Keep.
- km's `omnibox-row-adapters.ts` converts `CommandDef` / `KNode` / favorites into row data. km-specific. Keep.
- km's sigil detection (`omnibox.ts`) and slippery rule — km-specific. Keep.

The test: **would any silvery user want this?** If yes, upstream it. If no, wrap.

## Further reading

- [The Silvery Way](../../../vendor/silvery/docs/guide/the-silvery-way.md) — 10 principles for building canonical silvery apps
- [Styling Guide](../../../vendor/silvery/docs/guide/styling.md) — semantic tokens, typography presets, component defaults
- [vendor/silvery/CLAUDE.md](../../../vendor/silvery/CLAUDE.md) — silvery project overview and testing patterns
- Source: `vendor/silvery/packages/ag-react/src/ui/components/` and `vendor/silvery/packages/ag-react/src/hooks/`
