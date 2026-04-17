# Text Selection

_Status: draft (2026-03-16). App-level text selection — DOM-based, not screen-row-based._

_See also: [mouse-events-design.md](../../archive/pre-era2/mouse-events-design.md) (mouse event system), [architecture-overview.md](../../archive/pre-era2/architecture-overview.md) (concepts), [windowing.md](../v-undecided/windowing.md) (view scoping)._

## The Problem

Terminal-native selection operates on the screen buffer — raw characters including padding spaces, border characters, box-drawing chrome, broken words at wrap points, and ANSI escape remnants. Scrolled content is invisible to it (the terminal only sees the viewport). Copy produces garbled text.

Silvery owns the render tree. It knows which nodes contain text, where they are on screen, and how they wrap. It can do what browsers do: select the _semantic content_ of DOM nodes, not screen cells.

## The Model

Selection operates on the **render tree**, not the terminal buffer. The same way `window.getSelection()` in a browser walks DOM nodes, silvery's selection walks `AgNode`s.

### NodePosition — where in the tree

```typescript
/** A position within a text node, analogous to DOM's (node, offset) */
interface NodePosition {
  /** The AgNode containing the text (type: "silvery-text", isRawText: true) */
  nodeId: string
  /** Character offset within the node's textContent */
  offset: number
}
```

Only raw text nodes (`isRawText: true`, `textContent !== undefined`) are selectable. Virtual text nodes (styling wrappers like `<Text bold>`) are transparent — selection walks through them to their raw text children. Box nodes (borders, padding, layout) are skipped entirely.

### SelectionRange — what's selected

```typescript
/** A selection range, analogous to DOM Selection's anchor/focus */
interface SelectionRange {
  /** Where the selection started (mousedown position) */
  anchor: NodePosition
  /** Where the selection currently ends (tracks mouse/keyboard) */
  head: NodePosition
  /** Selection granularity */
  granularity: "character" | "word" | "line"
}
```

The anchor is fixed; the head moves. When `anchor` equals `head`, the selection is collapsed (no visible highlight). The anchor can be after the head (backwards selection) — this is normalized during text extraction.

### SelectionState — runtime state

```typescript
interface SelectionState {
  /** Current selection range, or null if nothing is selected */
  range: SelectionRange | null
  /** True while the user is dragging (mousedown held) */
  dragging: boolean
  /** The view (pane) containing this selection — selection doesn't cross views */
  viewId: string | null
}
```

Selection lives in a single `SelectionState` on the app — only one selection exists at a time, scoped to one view. Starting a selection in a different view clears the previous one.

## Character-Level Hit Testing

The existing `hitTest(root, x, y)` returns the deepest node at a screen position. Text selection needs one more level: which _character_ within that node.

### From screen position to character offset

```typescript
/**
 * Resolve a screen (x, y) to a position within a text node.
 *
 * 1. hitTest(root, x, y) → AgNode (deepest node at position)
 * 2. Walk up to nearest raw text ancestor if needed
 * 3. Compute character offset from (x, y) relative to the text node's screenRect
 */
function hitTestText(root: AgNode, x: number, y: number): NodePosition | null
```

**How the character offset is computed:**

Given a text node with `screenRect { x: 10, y: 5, width: 30, height: 3 }` and a click at screen position `(18, 6)`:

1. Compute local position: `localX = 18 - 10 = 8`, `localY = 6 - 5 = 1`
2. Use `getWrappedLines(textContent, width)` to get visual line layout (same function the renderer uses — positions are guaranteed to match)
3. Map `(localY, localX)` to character offset via `rowColToCursor(textContent, localY, localX, width)`

This reuses the existing text cursor math from `text-cursor.ts`, which is already proven to match the render pipeline's wrapping behavior.

**Edge cases:**

- Click on a Box node (border, padding) → walk up the hit chain, return null if no text ancestor
- Click on a virtual Text node (styling wrapper) → walk down to first raw text child
- Click past the end of a short line → clamp to line length
- Wide characters (CJK, emoji) → `graphemeWidth()` handles display width; click on the right half of a wide char selects it

### Text node discovery

Not all nodes under a screen position are selectable. The hit test filters:

| Node type             | `isRawText` | Has `textContent` | Selectable?           |
| --------------------- | ----------- | ----------------- | --------------------- |
| Raw text (`"hello"`)  | `true`      | `"hello"`         | Yes                   |
| Virtual `<Text bold>` | `false`     | `undefined`       | No — walk to children |
| `<Box>`               | —           | —                 | No — skip             |

## Range Resolution — Collecting Selected Text

Given `anchor` and `head`, walk the render tree in **document order** (DFS, children left-to-right) between the two positions. Collect `textContent` from every raw text node in the range.

```typescript
/**
 * Extract the plain text content of a selection range.
 *
 * Walks the render tree from anchor to head (normalizing direction),
 * collecting textContent from raw text nodes. Skips non-text nodes.
 */
function resolveSelectionText(root: AgNode, range: SelectionRange): string
```

**Algorithm:**

1. **Normalize** — if anchor is after head in document order, swap them → `(start, end)`
2. **Walk** — DFS from root, collecting raw text nodes in document order
3. **Trim** — first node: slice from `start.offset`; last node: slice to `end.offset`; middle nodes: full `textContent`
4. **Join** — concatenate with appropriate separators

**Separator logic:**

When consecutive text nodes are in different layout containers (different parent Box), insert a newline between them. When they're siblings in the same Box, concatenate directly (they're inline text). This mirrors how browsers handle block vs inline elements in selection.

```
Box (column)           → newline between children
  Text "Task title"    → "Task title"
  Box (row)            → newline before (different container)
    Text "Status: "    → "Status: "
    Text "Done"        → "Done" (same container, no separator)
```

Result: `"Task title\nStatus: Done"`

## Visual Rendering

Selected text is rendered with **inverted colors** (swap foreground and background), matching terminal convention and browser highlight behavior.

### How it works in the pipeline

The selection overlay is applied in the **render phase**, after text rendering and before output. For each selected cell:

```typescript
// In the render phase, after rendering text to the buffer:
// Walk selected cells and invert fg/bg
for (const { x, y } of selectedCells(buffer, selectionState)) {
  const cell = buffer.getCell(x, y)
  buffer.setCell(x, y, {
    ...cell,
    fg: cell.bg ?? defaultBg,
    bg: cell.fg ?? defaultFg,
  })
}
```

**Why post-process, not inline?** The selection highlight is ephemeral UI state, not part of the content. It should not participate in dirty flag logic or incremental rendering decisions. Post-processing the buffer after content rendering keeps selection decoupled from the render pipeline.

### Computing selected cells

The selection range (two `NodePosition`s) must be mapped to screen cells:

1. For each raw text node in the selection range, get its `screenRect`
2. Use `getWrappedLines()` to map character offsets to (row, col) pairs
3. For the first and last nodes, only highlight from/to the relevant offset
4. Collect all (x, y) screen positions

**Scroll-aware:** Uses `screenRect` (which accounts for scroll offsets), so selected text in a scrolled container highlights at the correct screen position.

### Dirty flag integration

Selection changes (start, extend, clear) set a lightweight `selectionDirty` flag on the app. The render phase checks this flag:

- If only selection changed (no other dirty flags), skip the full render phase — just re-process the selection overlay on the existing buffer
- This makes selection highlighting essentially free (no re-layout, no re-render)

## Interactions

### Mouse

| Gesture                        | Action                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| **mousedown**                  | Start selection — set anchor at hit position, begin dragging |
| **mousemove** (while dragging) | Extend selection — update head to current position           |
| **mouseup**                    | End drag — finalize selection                                |
| **double-click**               | Select word at click position                                |
| **triple-click**               | Select line at click position                                |
| **shift+click**                | Extend existing selection — move head to click position      |

**State machine:**

```
idle ──mousedown──→ dragging ──mouseup──→ selected
  ↑                    │                     │
  │                    │ mousemove           │ mousedown (new)
  │                    ↓                     ↓
  │                 dragging              dragging
  │                                         │
  └─────────── Escape / click elsewhere ────┘
```

### Keyboard (when selection exists)

| Key                | Action                      |
| ------------------ | --------------------------- |
| **Cmd+C / Ctrl+C** | Copy selection to clipboard |
| **Escape**         | Clear selection             |

Keyboard-driven selection extension (Shift+arrows) is deferred — it requires cursor-in-text concepts that overlap with the editing system. Mouse selection is the MVP.

### Double-click word selection

On double-click, expand the selection to the word at the click position:

```typescript
function expandToWord(text: string, offset: number): { start: number; end: number } {
  // Walk backwards to word start (non-word-char or start of string)
  // Walk forwards to word end (non-word-char or end of string)
  // Word characters: letters, digits, underscore (like \w)
}
```

Set `anchor = { nodeId, offset: start }`, `head = { nodeId, offset: end }`, `granularity: "word"`.

### Triple-click line selection

Extend double-click detection to triple-click (three clicks within 300ms × 2 = 600ms window). Select the full logical line containing the click position — from the start of the text node's content on that visual line to its end.

## Scroll Integration

When dragging near the viewport edge, scroll the container to extend the selection beyond the visible area.

```typescript
// During mousemove while dragging:
const viewRect = getViewportRect(scrollContainer)

if (y <= viewRect.y) {
  // Mouse at top edge → scroll up
  scrollBy(container, -1)
} else if (y >= viewRect.y + viewRect.height - 1) {
  // Mouse at bottom edge → scroll down
  scrollBy(container, +1)
}

// Then update selection head at the (possibly new) scroll position
```

**Scroll rate:** 1 line per mousemove event at the edge. Faster scrolling comes naturally from faster mouse movement (more mousemove events per second).

**Selection persists across scrolls.** The anchor is a `NodePosition` (node + offset), not a screen position. When the viewport scrolls, the anchor stays at the same logical position in the text. The visual highlight is recomputed from the `NodePosition`s via `screenRect` on each frame.

## View Scoping

Selection is scoped to a single **view** (pane in the windowing model). When the mouse crosses a pane boundary during drag:

- Selection continues updating (the head tracks the mouse)
- But only text nodes within the originating view are included in the range
- Text in other views is not highlighted and not copied

This matches browser behavior (selection doesn't jump between iframes) and editor behavior (selection doesn't jump between editor groups).

**Implementation:** When resolving the selection range to text, filter the tree walk to descendants of the view's root node.

## Clipboard

### Copy

When the user presses Cmd+C (or the app's copy command triggers):

1. Resolve the selection range to text via `resolveSelectionText()`
2. Write to system clipboard via OSC 52: `copyToClipboard(stdout, text)`
3. Visual feedback: brief flash or status bar message ("Copied N chars")

OSC 52 is already implemented in `@silvery/ag-term/clipboard.ts`. It works across SSH, in tmux, and in all modern terminals (Ghostty, Kitty, WezTerm, iTerm2, xterm, foot).

### Paste

Paste (`Cmd+V`) is handled by the terminal — it sends the clipboard contents as keystrokes (bracketed paste mode). No silvery involvement needed for basic paste. For rich paste (preserving structure), the app can request clipboard contents via `requestClipboard()` and parse them — but that's a separate concern.

## API

### Hooks

```typescript
/** Read the current selection state */
function useSelection(): SelectionState

/** Get the selected text content (resolved from the range) */
function useSelectedText(): string | null

/** Programmatically set or clear the selection */
function useSelectionActions(): {
  select(range: SelectionRange): void
  clear(): void
  copy(): void // resolve + OSC 52
  selectAll(viewId?: string): void
}
```

### Commands

```typescript
// Registered by the selection system
commands.selection.copy // Cmd+C — copy selection to clipboard
commands.selection.clear // Escape — clear selection
commands.selection.selectAll // Cmd+A — select all text in focused view
```

### Events

```typescript
// On Box/Text props (mirrors DOM)
interface SelectionEventProps {
  /** Fires when a selection starts, changes, or ends within this element */
  onSelectionChange?: (range: SelectionRange | null) => void
}
```

## What Already Exists

| Component                               | Status      | Reuse                                        |
| --------------------------------------- | ----------- | -------------------------------------------- |
| `hitTest(root, x, y)`                   | Implemented | Extend with character offset resolution      |
| `mousedown/move/up` events              | Implemented | Drive selection state machine                |
| `doubleClick` detection                 | Implemented | Extend to triple-click                       |
| `OSC 52 clipboard`                      | Implemented | Use directly for copy                        |
| `screenRect` on all nodes               | Implemented | Map selection to screen cells                |
| `getWrappedLines()`                     | Implemented | Map screen position ↔ character offset       |
| `cursorToRowCol()` / `rowColToCursor()` | Implemented | Character offset math                        |
| `collectPlainText()`                    | Implemented | Base for range text extraction               |
| `graphemeWidth()`                       | Implemented | Wide character handling                      |
| `FocusManager`                          | Implemented | View scoping (selection within focused view) |

## Platform Mapping

| Capability         | Terminal (silvery/term)            | Web (silvery/web)                   | Native                          |
| ------------------ | ---------------------------------- | ----------------------------------- | ------------------------------- |
| Selection model    | Same `SelectionRange`              | Delegate to `window.getSelection()` | Platform selection API          |
| Visual highlight   | ANSI inverse (post-process buffer) | CSS `::selection` pseudo-element    | Platform highlight              |
| Clipboard write    | OSC 52                             | `navigator.clipboard.writeText()`   | `NSPasteboard` / `UIPasteboard` |
| Clipboard read     | OSC 52 response                    | `navigator.clipboard.readText()`    | Platform API                    |
| Scroll-during-drag | Manual scroll-on-edge              | Native browser behavior             | Platform behavior               |
| Word boundaries    | `\w` regex                         | `Intl.Segmenter` (better unicode)   | Platform word boundaries        |

The terminal implementation does everything manually. Web and native get most of this for free from the platform — the selection _model_ (range, anchor/head) is the same, but the _rendering_ delegates to platform primitives.

## Tradeoffs

**Post-process vs inline rendering.** Post-processing the buffer for selection highlighting is simpler and decoupled, but means the selection colors are always "invert the rendered colors" rather than configurable per-component. This is fine for MVP — browsers also use a fixed highlight color (configurable only via CSS `::selection`).

**No keyboard selection extension.** Shift+arrow selection requires a text cursor concept for non-editing contexts. This overlaps with the editing system's cursor. Deferring to avoid designing two cursor systems that need to merge later.

**Character-level, not grapheme-cluster-level.** The offset model uses JavaScript string offsets, not grapheme clusters. This means a flag emoji (4+ code units) has multiple "positions" within it. For selection purposes this is fine — selecting any part of an emoji selects the whole grapheme cluster during text extraction. But the model is technically imprecise. The browser has the same issue with `Selection.anchorOffset`.

**Single selection.** Only one selection exists at a time. Multiple selections (like VS Code's multi-cursor) are a different feature with different complexity. Single selection is the browser model and covers the primary use case.

## Implementation Phases

### Phase 1: Character hit testing

Extend `hitTest` to return `NodePosition`. Add `hitTestText(root, x, y)` that resolves to (node, character offset). Reuses `getWrappedLines()` and `rowColToCursor()`.

**Test:** Click at known screen positions, verify correct node and offset.

### Phase 2: Selection state + mouse interaction

Add `SelectionState` to the app. Wire mousedown/move/up to set anchor, update head, finalize selection. Double-click word selection.

**Test:** Drag across text nodes, verify `SelectionRange` has correct anchor/head. Double-click a word, verify word boundaries.

### Phase 3: Visual highlighting

Post-process buffer to invert selected cells. Wire into render phase with `selectionDirty` flag.

**Test:** Render with selection, verify inverted cells at expected positions. Verify incremental rendering still matches fresh render.

### Phase 4: Clipboard + range resolution

Implement `resolveSelectionText()` — walk tree, collect text, join with separators. Wire Cmd+C to copy via OSC 52.

**Test:** Select across multiple text nodes with different containers, verify extracted text matches expected content with correct separators.

### Phase 5: Scroll + view scoping

Scroll-on-drag-edge for scroll containers. Scope selection to view boundaries.

**Test:** Select text, scroll, verify selection persists at correct positions. Start selection in one pane, drag to another, verify text from other pane is excluded.

### Phase 6: Triple-click + polish

Triple-click line selection. Escape to clear. Visual feedback on copy. `selectAll` command.

---

_See also: [mouse-events-design.md](../../archive/pre-era2/mouse-events-design.md) (foundation), [windowing.md](../v-undecided/windowing.md) (view scoping context), [commands.md](../v15-tea/commands.md) (command registration)._
