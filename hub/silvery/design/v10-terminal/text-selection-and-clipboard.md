# Text Selection, Clipboard, and Find — Design Document

**Beads**: km-dfrtr (tracking), km-y9zs4 (Phase 1 — userSelect)
**Status**: Design phase
**Date**: 2026-04-05
**Reviewed by**: GPT 5.4 Pro (2026-04-06) — [review output](/tmp/llm-manual-review-this-text-selection-0xgb.txt)

## Problem

Silvery captures all mouse events via DECSET 1003, killing native terminal text selection. Users cannot select or copy text from any silvery surface — help dialogs, detail panes, read-only content, anything. Every TUI framework has this problem; none solve it well.

## Vision

Text selection that feels as natural as a browser. Selectable by default. Interactive elements opt out. Rich clipboard with application-enriched content. Global find with shared infrastructure. Zero overhead when not selecting.

## Design Principles

1. **Selectable by default** — root `userSelect` is `"text"`. Zero config for the common case.
2. **Selection mask, not cell metadata** — bit 31 in existing Uint32 packing as implementation of an abstract selection mask. Stamped during render. Zero overhead. Use `0x80000000 >>> 0` (not `1 << 31`) due to JS signed 32-bit ops.
3. **Buffer layer, not component layer** — selection is a post-render compositing pass. Components never re-render.
4. **Contain = explicit selection boundary** — NOT overloaded from overflow clipping. `userSelect="contain"` is a selection-specific concept, independent of `overflow`.
5. **Two access modes, one range** — mouse drag + keyboard copy-mode share `SelectionRange`. But controllers are separate (mouse vs keyboard state machines).
6. **Alt+drag = universal override** — replaces native terminal selection killed by DECSET 1003. Modifier is configurable.
7. **Style composition, not ANSI overlay** — selection highlight is a cell-style transform in the rendering pipeline, not re-printed chars under SGR 7m.

## The Three Pointer Props

Three orthogonal CSS-like props control pointer behavior:

| Prop            | Question            | Values                            | Status  |
| --------------- | ------------------- | --------------------------------- | ------- |
| `pointerEvents` | See pointer events? | `auto`, `none`                    | Done    |
| `userSelect`    | Text selectable?    | `auto`, `none`, `text`, `contain` | Phase 1 |
| `draggable`     | Node draggable?     | `boolean`                         | Future  |

These compose freely:

| Surface            | pointerEvents | userSelect | draggable     |
| ------------------ | ------------- | ---------- | ------------- |
| Board card         | auto          | none       | true (future) |
| Help dialog        | auto          | contain    | false         |
| Detail pane        | auto          | contain    | false         |
| Decorative overlay | none          | text       | false         |
| Button             | auto          | none       | false         |
| Read-only text     | auto          | text       | false         |

Note: `pointerEvents="none"` + `userSelect="text"` is valid — the node doesn't receive pointer events but its text is still selectable. This is why selection hit testing is separate from pointer hit testing (see below).

### userSelect values

- **`auto`** (default) — inherit from parent. Root resolves to `text`.
- **`none`** — not selectable. Mouse-drag on this node does not start text selection.
- **`text`** — force selectable, even if parent is `none`.
- **`contain`** — selectable, but selection range cannot escape this node's bounds.

### Mouse-drag disambiguation

When mousedown occurs:

```
Alt held?                    → always TEXT SELECTION (principle 6)
Hit draggable=true?          → NODE DRAG (future)
Hit userSelect=text/auto?    → TEXT SELECTION
Hit userSelect=none?         → CLICK ONLY / AREA SELECT
Hit empty space?             → AREA SELECT
```

Priority: Alt override > draggable > userSelect.

## Architecture: Buffer Compositing via Style Composition

```
React tree → ag tree → flexily layout → terminal buffer
                                              │
                                        style composition
                                              │
                              ┌───────────────┼───────────────┐
                              │               │               │
                        selection         find            future
                        transform         transform       transforms
                              │               │               │
                              └───────────────┼───────────────┘
                                              │
                                         diff/output
                                              │
                                           TERMINAL
```

Selection and find are NOT separate overlay passes that re-emit ANSI. They are **cell-style transforms** composed before the normal diff/output renderer. This means:

- Selection composes correctly with existing cell styles (fg/bg/attrs)
- Find highlight composes correctly on top of selection
- Already-inverted content doesn't become ambiguous
- Wide chars are handled by the normal renderer
- One output pass, not multiple overlapping ANSI strings

### Cell selection mask

Existing Uint32 cell layout (buffer.ts):

```
Bits 0-7:   foreground color index (8 bits)
Bits 8-15:  background color index (8 bits)
Bits 16-23: attributes (8 bits)
Bits 24-26: underline style (3 bits)
Bits 27-28: flags: wide, continuation
Bits 29-30: flags: true_color_fg, true_color_bg
Bit 31:     SELECTABLE_FLAG (0x80000000 >>> 0)
```

**Bit 31** is the selection mask — set during render based on resolved `userSelect`. Read during selection to determine which cells participate. Zero allocation, zero overhead when not selecting.

This is an implementation detail of the abstract "selection mask" concept. If the bit becomes unavailable, a sidecar boolean array works too.

### Render-time flag stamping

During the render phase, when writing cells to the buffer:

```typescript
const SELECTABLE_FLAG = 0x80000000 >>> 0

// In render-text.ts / render-box.ts:
const selectable = resolveUserSelect(node) !== "none"
const packed = packCell(char, fg, bg, attrs) | (selectable ? SELECTABLE_FLAG : 0)
buffer.setCell(col, row, packed)
```

`resolveUserSelect(node)` walks up ancestors to resolve `auto` → effective value. Cached per-node during render (computed once, used for all cells in that node). Invalidated when node props or ancestry changes.

### Selection style composition

Instead of re-emitting chars with SGR 7m, selection modifies the cell styles before the output phase:

```typescript
function composeSelectionStyle(cell: Cell, theme: Theme): Cell {
  // Use theme tokens if available
  if (theme.selectionbg) {
    return { ...cell, fg: theme.selection, bg: theme.selectionbg }
  }
  // Fallback: swap fg/bg (not raw SGR 7m — handles already-inverted content)
  return { ...cell, fg: cell.bg ?? theme.bg, bg: cell.fg ?? theme.fg }
}
```

The composed cells flow through the normal diff/output renderer, which handles wide chars, cursor positioning, and ANSI emission correctly.

## Hit Testing: Pointer vs Selection

**Selection hit testing is NOT the same as pointer hit testing.** They are orthogonal:

|                          | Pointer hitTest        | Selection hitTest           |
| ------------------------ | ---------------------- | --------------------------- |
| Respects `pointerEvents` | Yes                    | No                          |
| Respects `userSelect`    | No                     | Yes                         |
| Purpose                  | Find click/drag target | Find selection-start target |

Implementation: same tree traversal machinery, but parameterized:

```typescript
export function hitTest(node: AgNode, x: number, y: number, mode: "pointer" | "selection" = "pointer"): AgNode | null {
  // ... existing traversal ...
  const props = node.props as { pointerEvents?: string; userSelect?: string }
  if (mode === "pointer" && props.pointerEvents === "none") return null
  if (mode === "selection" && resolveUserSelect(node) === "none") return null
  // ... continue DFS ...
}
```

This ensures `pointerEvents="none"` + `userSelect="text"` works correctly (decorative overlay with selectable text).

## Z-Order and Nested Regions

### Z-order: painter's algorithm

The terminal buffer is a 2D cell grid. When elements overlap, the last-rendered element overwrites the cell — character, colors, AND SELECTABLE_FLAG. This is the same painter's algorithm the buffer already uses.

- Dialog overlays board → dialog cells overwrite board cells → SELECTABLE_FLAG reflects dialog's userSelect
- hitTest returns the topmost node (reverse child DFS) → consistent with cell flags
- Terminal cells are effectively opaque — no transparency concerns

### Future z-order considerations

If silvery adds real stacking contexts (z-index, portals, popovers), reverse DFS won't be sufficient. The paint order and hit-test order must always agree. Design the stacking model to maintain this invariant.

### Nested contain boundaries

```
<Dialog userSelect="contain">           ← outer contain
  <Text>Title</Text>                    ← selectable (inherits)
  <ScrollView userSelect="contain">    ← inner contain
    <Text>Scrollable content</Text>     ← selectable (inherits)
  </ScrollView>
</Dialog>
```

**Innermost contain wins.** On mousedown:

1. Selection hitTest finds topmost selectable node at pointer position
2. Walk up from node to nearest `userSelect="contain"` ancestor
3. That ancestor's screenRect becomes the selection ClipBounds
4. Mouse-drag is clamped to these bounds

### Two-level filtering

| Level    | Mechanism                     | Purpose                                          |
| -------- | ----------------------------- | ------------------------------------------------ |
| Spatial  | Contain boundary (screenRect) | Limits WHERE selection range extends             |
| Per-cell | SELECTABLE_FLAG (bit 31)      | Determines WHICH cells within range are selected |

Both are needed. Without spatial: highlight shows gaps across the screen. Without per-cell: overlapping non-selectable elements get incorrectly included.

## Selection State Model

### Expanded state

```typescript
interface TerminalSelectionState {
  range: SelectionRange | null
  selecting: boolean
  source: "mouse" | "keyboard" | null // who initiated
  mode: "normal" | "copy" // app mode
  granularity: "char" | "word" | "line" // double/triple click
  scope: Rect | null // contain boundary ClipBounds
}
```

Mouse and keyboard share the `range` but have separate controller state. If mouse-drag starts during copy-mode, **mouse takes over** — copy-mode exits, range transfers.

### Resize/reflow policy (v1)

- **Clear selection on resize/reflow.** Boring but consistent.
- `SelectionRange` is viewport-relative screen coordinates. After reflow, those coordinates no longer map to the same content.
- Copy-mode may optionally freeze selection (future enhancement).
- Log views that append: selection persists if the selected rows haven't scrolled out.

## Selection Interaction Model

### Mouse text selection

```
mousedown(x, y)
  → selectionHitTest(root, x, y) → node N
  → resolveUserSelect(N):
      "none" (no Alt) → node-pointing (no text selection)
      "text"/"auto"   → text-pointing
      Alt held         → text-pointing (override)
  → walk up to nearest contain → scope S
  → set anchor = (x, y), scope = S, source = "mouse"

mousemove(x2, y2)
  → clamp (x2, y2) to scope S's screenRect
  → update head = (clamped x2, y2)
  → compose selection style on affected cells
  → normal diff/output renders the change

mouseup
  → if copyOnSelect: extractText → clipboard
  → else: selection persists, await explicit copy command
```

**Drag threshold**: small distance + time threshold before selection starts, so clicks still work normally.

### Copy trigger

Copy is NOT unconditional on mouseup. Configurable via `copyOnSelect` option:

- `copyOnSelect: true` — copy on mouseup (tmux-like)
- `copyOnSelect: false` (default) — selection persists, explicit `y` or `Ctrl+C` to copy
- Status bar hint when selection is active: "y to copy"

### Double-click / triple-click

- **Double-click**: select word (boundary = whitespace/punctuation). Sets `granularity: "word"`.
- **Triple-click**: select line. Sets `granularity: "line"`.
- Uses existing double-click detection (300ms + 2-cell threshold)
- Extend to triple-click with same pattern

### Alt+drag override

When Alt (or configured modifier) is held, pointer state machine always enters text-selection mode regardless of `userSelect` or `draggable` props. ~5 lines in event processing.

Modifier is configurable: `selectionModifier: "alt" | "shift" | "ctrl+shift"`. Default: `"alt"`.

When drag is blocked by `userSelect="none"`, show transient hint: "Hold Alt to select text".

### Keyboard copy-mode

Enter with a keybinding. Vim-style navigation:

```
h/j/k/l     move cursor
w/b/e       word motion
0/$         line start/end
v           start visual (character) mode
V           start visual (line) mode
y           yank selection → clipboard
Esc         exit copy-mode
```

Sets `source: "keyboard"`, `mode: "copy"`. Shares `range` with mouse. Auto-scrolls within contain boundaries and virtual lists.

If mouse-drag starts during copy-mode: mouse takes over, copy-mode exits, range transfers.

### Auto-scroll

When mouse-drag or copy-mode cursor reaches the edge of a scroll container:

- Scroll the container to reveal more content
- Extend selection into newly-visible cells
- Rate: proportional to distance past edge (faster the further you go)
- Reuses existing scroll infrastructure

## Clipboard Architecture

### Two-layer design

The clipboard system has two cleanly separated layers:

**Layer 1 — Framework visual copy (always works):**

- Extract plain text from buffer (respecting SELECTABLE_FLAG)
- Transport via clipboard backend
- No application involvement needed

**Layer 2 — Optional semantic providers (app-enriched):**

- Application registers semantic copy providers
- Providers receive selection context and produce rich data
- Rich data sent to clipboard backend alongside plain text
- Separate from the buffer-level extraction

This separation resolves the tension between pure buffer-layer selection and rich clipboard. The framework never tries to reconstruct markdown/HTML from painted cells.

### Text extraction correctness

Current `extractText()` has correctness issues that must be fixed:

**Problems:**

- Drops blank lines within selection
- Strips all trailing whitespace
- Ignores soft-wrap vs hard-break semantics
- Doesn't account for wide-char continuation cells
- May mishandle grapheme clusters / emoji / combining marks

**Solution — row metadata:**

```typescript
interface RowMetadata {
  softWrapped: boolean // line continues on next row (soft wrap, not hard break)
  lastContentCol: number // rightmost column with non-space content
}
```

Row metadata is maintained by the render phase. During text extraction:

- `softWrapped: true` → join with next row (no newline)
- `softWrapped: false` → insert newline
- Blank lines within selection are preserved (not dropped)
- Trailing spaces trimmed to `lastContentCol` (not regex)
- Wide-char continuation cells are skipped (not duplicated)
- Grapheme clusters are treated as atomic units

### Clipboard backend abstraction

```typescript
interface ClipboardBackend {
  write(data: ClipboardData): Promise<void>
  read?(): Promise<string>
  capabilities: {
    text: true // always
    html?: boolean
    markdown?: boolean
    internal?: boolean
  }
}
```

**Default backend**: OSC 52 (text only). Works across SSH, in most modern terminals. Has quirks: some terminals limit payload size, tmux requires `set -g set-clipboard on`, some terminals only support BEL terminator.

**Optional backends**: native clipboard (pbcopy on macOS), electron clipboard, app-internal clipboard store.

Backend selection is configurable. Multiple backends can be active (e.g., OSC 52 + internal store).

### Semantic copy providers (Layer 2)

```typescript
interface SemanticCopyProvider {
  // Called when text is copied from within this provider's scope
  enrichCopy(event: CopyEvent): ClipboardData | Promise<ClipboardData> | void
}

interface CopyEvent {
  text: string // plain text from buffer extraction
  range: SelectionRange // screen coordinates
}

interface ClipboardData {
  text: string // plain text (always)
  markdown?: string // structured content
  html?: string // rich format
  internal?: unknown // app-specific structured data
}
```

Providers are registered on components (not globally). The nearest ancestor provider handles the copy.

**Async is allowed but never blocks plain text.** Plain text copies immediately via OSC 52. Async enrichment is best-effort — if the provider returns a promise, rich data arrives after plain text is already on the clipboard.

km examples:

- Help dialog provider: returns plain text only (no enrichment needed)
- Detail pane provider: returns markdown from the node model
- Board provider: returns markdown + internal node tree for structured paste

### Paste

**External paste (from system clipboard):**

- Bracketed paste mode (DECSET 2004) — terminal wraps pasted text in escape sequences
- silvery detects `\e[200~...\e[201~` and fires paste event
- Route to nearest paste handler component

**Internal paste:**

- If copy produced `ClipboardData` with internal/markdown data, paste provides it
- Application decides: insert text, parse markdown, reconstruct nodes

```typescript
interface PasteEvent {
  text: string                     // raw pasted text
  source: "bracketed" | "internal" // where it came from
  structured?: ClipboardData       // rich data if internal paste
}

// On components that accept paste:
onPaste?: (event: PasteEvent) => void
```

km examples:

- Paste in text edit → insert text at cursor
- Paste on board → parse markdown, create nodes
- Internal paste → reconstruct node tree (hierarchy preserved)

## Global Find

Find and selection share the style composition architecture.

### Architecture

```
Ctrl+F → open find bar (overlay component)
       → user types query
       → scan buffer for matches
       → compose find highlight style on matching cells
       → n/N navigate between matches (auto-scroll)
       → Enter → set selection to current match → explicit copy
       → Esc → clear find, close bar
```

### Style precedence

When both selection and find are active on the same cell:

- Selection style takes precedence (it's the user's explicit action)
- Find match outside selection uses find highlight style
- Find match inside selection uses selection style (find is subordinate)

### Find within virtual lists

Two levels:

**Framework (visible buffer search):**

- Search rendered cells for text matches
- Highlight matches on visible content
- n/N navigation across visible matches

**App provider (model-level search):**

```typescript
interface FindProvider {
  search(query: string): FindResult[] | Promise<FindResult[]>
  reveal(result: FindResult): void // scroll to make result visible
  totalCount?(query: string): number
}

interface FindResult {
  itemId: string // virtual list item identifier
  offset: number // character offset within item
  length: number // match length
}
```

Providers are registered on scroll containers / virtual lists. silvery orchestrates: calls provider, scrolls to reveal, then highlights the now-visible match.

### Find scope

- Default: global (all visible content)
- Within a `userSelect="contain"` boundary: find bar inside a contain scope searches only that scope
- Component-provided `FindProvider` handles model-level search for virtual content

## Virtual Lists

Virtual lists only render visible items. Off-screen content is not in the buffer.

### Text selection in virtual lists

1. **Auto-scroll on drag**: mouse near container edge scrolls, selection extends into newly-visible cells
2. **Copy-mode + scroll**: j/k scrolls list, selection extends as new content renders
3. **Application-level structured copy**: for model-aware selection, use node-level selection + semantic copy provider

Limitation: you can only select what's rendered. This matches browser behavior with virtualized lists.

### Find in virtual lists

App-provided `FindProvider` searches the model, returns results, silvery calls `reveal()` to scroll to match.

## Performance

### Zero-cost when idle

- SELECTABLE_FLAG is set during normal render (one OR per cell, ~0 cost)
- No selection state machine processing when no gesture is active
- No style composition when selection is null
- No React re-renders for selection changes ever

### During selection

- Pointer-move fires at ~60-1000Hz
- Skip no-ops: if head didn't change cell position, no state update
- Style composition is incremental: only recompose changed rows
- extractText is single-pass through buffer cells, respects row metadata
- ClipBounds check is O(1) per mousemove

### Memory

- No additional allocations for selection (bit flag in existing cells)
- Row metadata: one bool + one number per row (small)
- Selection state: range + scope + source + mode + granularity
- Clipboard backend: one ClipboardData object

## Alternatives Considered

### Per-component TextArea approach

Wrap every surface in a read-only TextArea. Rejected: doesn't generalize, requires component changes, breaks layout, doesn't compose.

### Terminal-native selection (Shift+click)

Let the terminal handle it. Rejected: DECSET 1003 kills native selection. Can't have both app mouse handling and native selection.

### DOM-like selection API on ag tree

Selection ranges that reference ag nodes (like DOM Range). Rejected: over-engineered for TUI. Buffer-level is simpler and more correct (handles overlap, clipping, z-order automatically).

### Separate selection buffer

A parallel boolean grid tracking selectability. Rejected: wastes memory. Bit 31 in existing cells is free.

### ANSI overlay rendering (SGR 7m re-emission)

Re-print selected chars with inverse video. Rejected after Pro review: doesn't restore per-cell styles, breaks on already-inverted content, doesn't compose with find highlight, wide chars are risky. Style composition is the correct approach.

### Overflow boundaries as selection scope

Use `overflow="hidden"` boundaries for selection clipping. Rejected: overflow clipping and selection scoping are different concepts. A pane can clip overflow but want cross-pane selection, or not clip but want contained selection.

### Auto-copy on mouseup as default

Copy immediately when mouse is released. Rejected as default: surprising to many users, spams clipboard. Made configurable via `copyOnSelect` option.

## Phase Summary

| Phase | Feature                                                                          | Effort | Depends On |
| ----- | -------------------------------------------------------------------------------- | ------ | ---------- |
| 1     | Selection mask + visual selection + correct extraction + contain + explicit copy | Medium | —          |
| 2     | Word/line selection + visible-buffer find + keyboard copy-mode basics            | Medium | Phase 1    |
| 3     | Semantic copy providers + clipboard backends + paste handling                    | Medium | Phase 1    |
| 4     | Virtual list find providers + advanced copy-mode                                 | Medium | Phases 2-3 |
| 5     | Demos, km integration, silvery.dev docs                                          | Medium | Phases 1-4 |
| 6     | Pointer state machine unification                                                | Medium | Phase 1    |
| 7     | draggable                                                                        | Large  | Phase 6    |
| 8     | Per-node interactive signals                                                     | Medium | Phase 6    |

## Review History

- **2026-04-06 GPT 5.4 Pro**: Architecture validated ("good architecture, right center of gravity"). Six corrections incorporated: (1) text extraction correctness with row metadata, (2) style composition instead of ANSI overlay, (3) separate visual/semantic clipboard layers, (4) selection-specific hit testing, (5) configurable copy trigger, (6) clipboard backend abstraction. See full review at `/tmp/llm-manual-review-this-text-selection-0xgb.txt`.
