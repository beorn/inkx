# Overlay / Anchor System — Design

> Status: research + design (Phase 4c of `km-silvery.view-as-layout-output`).
> Owning bead: `km-silvery.overlay-anchor-system` (P2, in progress).
> Implementation deferred — this doc names the destination so we stop accreting bespoke per-overlay signals.

## 1. Problem

The view-as-layout-output substrate (closed bead `km-silvery.view-as-layout-output`) reframed cursor / focus / selection as **layout outputs** rather than React-effect-bridged signals. That removed the "first-frame returns null/0" bug class and gave us three new peer signals on `LayoutSignals`:

| Semantic input (BoxProps)          | Geometric output (LayoutSignals)            |
| ---------------------------------- | ------------------------------------------- |
| `cursorOffset: { col, row, ... }`  | `cursorRect: CursorRect \| null`            |
| `focused: boolean`                 | `focusedNodeId: string \| null`             |
| `selectionIntent: { from, to }`    | `selectionFragments: readonly Rect[]`       |

That pattern works. The problem is the next plateau: every new overlay-shaped feature wants the same shape and we'd accrete one bespoke signal per kind:

- Popovers anchored to a Box (autocomplete dropdowns, command palettes)
- Tooltips anchored to a hover target
- Hover indicators (link underline-on-hover, drag-drop landing zones)
- Annotation pins (silvercode autolinks → URI pivots)
- Find/replace match highlights (peer of selection but a different intent)
- Drag overlays (a ghost rectangle following the cursor)
- IME composition rectangles (when we get there)

GPT 5.4 Pro flagged this in two senior-engineer reviews (`/tmp/llm-2405c72e-...-5zsn.txt` § 6 and `...-yvaz.txt` § A): the right abstraction is **frame artifacts** — a single derived-overlays mechanism whose inputs are semantic and whose outputs are geometric. Not "every bug gets a new layout signal."

## 2. Industry survey

Five prior-art systems, what they model, what we steal.

**CSS Anchor Positioning** (Chrome 125+, May 2024). Declarative: a target element binds to an anchor via `position-anchor: --my-anchor`, then expresses its rectangle relative to the anchor (`top: anchor(bottom); left: anchor(start)`). The browser does the geometry after layout. *Lesson:* anchors are first-class IDs in the layout pipeline, not derived from element references in JS. Positioning is a declarative function of `(anchor rect, target intent)`, not imperative math at the call site.

**SwiftUI `@Anchor` + `AnchorPreference`**. A child publishes a geometry preference up the tree (`.anchorPreference(key:value:)`); ancestors read it and overlay decorations using `.overlayPreferenceValue`. Geometry flows up via the preference protocol, never read synchronously by the child. *Lesson:* publishing geometry as a tree-scoped preference (rather than every consumer querying `GeometryReader`) keeps overlay placement out of the per-component render path. Cautionary tale (per /pro): `GeometryReader` proved enough of a footgun that Apple migrated everyone toward this preference protocol.

**Popper.js / Floating UI**. Imperative library: given an anchor element and a "floating" element, compute placement (`top`, `top-start`, ...) with collision detection, flipping, shifting. Stateless except for a `Modifier[]` pipeline. *Lesson:* placement is a pure function of `(anchorRect, floatingSize, viewport, modifiers)` — that math is portable across DOM/canvas/terminal. We do *not* need to invent it; we only need to feed it the right inputs from our layout pipeline.

**ProseMirror Decorations**. Three kinds: `widget` (insert a DOM node at a position), `inline` (style a text range), `node` (style a block node). Decorations are built as a `DecorationSet` per editor state, diffed across transactions, and applied at render time. They are **not** part of the document model — they're a derived view layer. *Lesson:* the right model isn't "selection vs caret vs popover" — they're all decorations of distinct *kinds*, addressed by document position, derived per frame. ProseMirror's `inline` ≈ our selection; `widget` ≈ our caret + popover anchor; `node` ≈ our focus ring.

**TextKit / AppKit anchor preferences**. macOS text system: caret + selection rectangles are computed by `NSLayoutManager` from `(textStorage, glyphRange)` after layout. The text view never asks for caret coordinates synchronously during render — it asks the layout manager *after* layout has settled. AppKit uses `anchor` preferences on `NSView` for sheet/popover placement in a similar shape to SwiftUI. *Lesson:* caret + selection geometry are layout-system outputs, not view-system inputs. Same conclusion view-as-layout-output already reached.

**Synthesis.** All five converge on: declare semantic intent on tree nodes, derive geometry after layout, consume an immutable per-frame snapshot at paint time. Differences are mostly surface (preference protocol vs CSS property vs decoration set vs per-frame map). silvery already has an alien-signals peer-of-rect-signals substrate that fits cleanly.

## 3. Reframe — semantic inputs vs geometric outputs

The current three signals each obey the same shape:

```
BoxProps.<input>  ──▶  syncRectSignals  ──▶  LayoutSignals.<output>  ──▶  scheduler / renderer
   (semantic)         (post-layout pass)        (geometric, immutable per frame)
```

Generalize that shape to **N decoration kinds** sharing one mechanism:

| Layer            | Today                                                  | After                                                         |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Semantic input   | `cursorOffset`, `focused`, `selectionIntent`           | + `anchorRef`, `decorations: Decoration[]`                    |
| Per-node compute | `computeCursorRect`, `computeFocusedNodeId`, ...       | + `computeAnchorRect`, `computeDecorationRects`               |
| Per-node signal  | `cursorRect`, `focusedNodeId`, `selectionFragments`    | + `anchorRects: Map<id, Rect>`, `decorationRects: ...`        |
| Tree-walk lookup | `findActiveCursorRect`, `findActive*`                  | + `findAnchor(id)`, `collectOverlayLayer()`                   |
| Frame artifact   | (implicit — scheduler reads each signal independently) | one `OverlayLayer` returned alongside the buffer              |

Three new ideas, each modest:

1. **Anchor IDs are first-class.** A Box can opt in via `anchorRef: { id, edge?: "top" | "bottom" | ... }`. The layout phase records `(id → contentRect | edgeRect)` in a tree-scoped `anchorRects` map. Consumers (popover, tooltip, drag indicator) reference by ID and the placement math is decoupled from the anchor's tree position. This is what CSS Anchor Positioning normalized, and it fits silvery's existing per-node signal pattern.
2. **Decorations are a typed list, not a parallel hierarchy.** Each Box can declare `decorations: Decoration[]` to attach overlays to *itself* without inventing new BoxProps fields. Caret, focus-ring, and selection are special cases that stay as their own props (back-compat + ergonomics + frequency); popovers / tooltips / hover-indicators / annotation pins / find-matches go through the generic list.
3. **One frame artifact at paint time.** After layout + sync, the pipeline produces an `OverlayLayer = { kind, z, rects, ... }[]` snapshot (post-order traversal, deepest-wins precedence already established for cursor/focus). The scheduler / output phase reads that snapshot, not N independent signals. This matches GPT 5.4 Pro's "atomic snapshot" recommendation and matches ProseMirror `DecorationSet` shape.

## 4. Decoration / Overlay shape

```ts
// Coordinates always in the same absolute terminal-cell space as cursorRect.
type Rect = { x: number; y: number; width: number; height: number }

type Edge = "top" | "bottom" | "left" | "right" | "center"
type Placement =
  | "top-start" | "top" | "top-end"
  | "bottom-start" | "bottom" | "bottom-end"
  | "left-start" | "left" | "left-end"
  | "right-start" | "right" | "right-end"

// Semantic input (BoxProps additions — caret/focus/selection retain their
// dedicated props; this is for everything else).
type AnchorRef = {
  id: string                 // stable, app-chosen
  edge?: Edge                // which edge of the anchor's contentRect to expose
}

type Decoration =
  | { kind: "popover"; id: string; anchorId: string; placement: Placement; offset?: number; size?: { width: number; height: number } }
  | { kind: "tooltip"; id: string; anchorId: string; placement: Placement; text?: string }
  | { kind: "hover-indicator"; id: string; rect?: Rect }
  | { kind: "highlight"; id: string; intent: { from: number; to: number }; style: "find" | "replace" | "annotation" }
  | { kind: "drag-overlay"; id: string; rect: Rect }
  | { kind: "custom"; id: string; payload: unknown }   // escape hatch for plugins

type BoxPropsAdditions = {
  anchorRef?: AnchorRef
  decorations?: readonly Decoration[]
}

// Geometric output (per-node signal additions — peer of cursorRect etc.)
type AnchorRectsByEdge = { [edge in Edge]?: Rect }
type LayoutSignalsAdditions = {
  anchorRect: WritableSignal<AnchorRectsByEdge | null>
  decorationRects: WritableSignal<readonly DecorationRect[]>
}

type DecorationRect =
  | { kind: "popover"; id: string; rects: Rect[]; anchorId: string }
  | { kind: "tooltip"; id: string; rects: Rect[]; anchorId: string }
  | { kind: "hover-indicator"; id: string; rects: Rect[] }
  | { kind: "highlight"; id: string; rects: Rect[]; style: "find" | "replace" | "annotation" }
  | { kind: "drag-overlay"; id: string; rects: Rect[] }
  | { kind: "custom"; id: string; rects: Rect[]; payload: unknown }

// Frame artifact — collected post-order at end of layout, consumed by paint.
type OverlayLayer = {
  caret: CursorRect | null
  focus: { id: string; rects: Rect[] } | null
  selection: { rects: Rect[] }
  decorations: readonly DecorationRect[]   // already z-ordered by paint convention
  anchors: ReadonlyMap<string, AnchorRectsByEdge>
}
```

Caret / focus / selection retain dedicated props because they are core, frequent, and benefit from inline ergonomics (`<Box selectionIntent={…}>`). Everything else routes through `decorations`. Caret/focus/selection still appear in `OverlayLayer` so a single object describes the frame.

## 5. Semantic input → geometric output mapping

For each kind, the layout-phase computation:

| Kind             | Input fields                                | How geometry is derived                                                                                                  |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Caret            | `cursorOffset` + `contentRect`              | Already implemented (`computeCursorRect`).                                                                               |
| Focus ring       | `focused` + `boxRect`                       | Already implemented (`computeFocusedNodeId` + a paint-time rect lookup via `boxRect`).                                   |
| Selection        | `selectionIntent` + `contentRect` + text    | `computeSelectionFragments` (today: `\n`-split only; soft-wrap is § 8).                                                  |
| Anchor           | `anchorRef.id` + `contentRect`              | New: write `(id → { top, bottom, left, right, center })` into a tree-scoped map at end of layout.                        |
| Popover          | `anchorId` + `placement` + `size?`          | New: lookup anchor rect → place floating rect via Popper-style algorithm (collision flip is v2).                         |
| Tooltip          | same as popover, with intrinsic `text`      | Same as popover.                                                                                                         |
| Hover indicator  | rect (or implicit hovered-element rect)     | Pass-through if rect provided; else lookup last-known hover registry rect.                                               |
| Highlight        | `intent: {from,to}` + `contentRect` + text  | Same algorithm as selection; one `Decoration` per match. Soft-wrap fragmentation must be shared with selection (see § 8).|
| Drag overlay     | rect (mouse-position-driven by app)         | Pass-through.                                                                                                            |
| Custom           | payload + per-plugin compute hook           | Plugin-provided. Out of v1 scope.                                                                                        |

### New layout APIs needed

1. `wrappedLineRects(node, range)` — given a Box and a `(from, to)` character range, return one Rect per visual line (after soft-wrap) within the node's content area. **Used by both selection (§ 8) and highlight kinds.** Lives in the same package as `computeSelectionFragments`.
2. `getAnchorRect(rootOrNode, anchorId, edge?)` — tree-walk lookup, mirrors `findActiveCursorRect`. Keys off the post-order tree map.
3. `placeFloating(anchor, target, placement, viewport)` — pure Popper-algebra function. No DOM, no canvas, no terminal — just rects → rect. Lives in `@silvery/ag` next to `rectEqual`.

### Layering constraint (the load-bearing one)

`@silvery/ag` is below `@silvery/ag-term` and **cannot import from it** (see vendor `package.json` and the `wrapText` lives in `ag-term/unicode.ts` constraint that originally deferred Phase 4b's soft-wrap path). Anchor lookup and Popper-algebra are pure rect math → fine to live in `@silvery/ag`. Soft-wrap fragmentation needs `wrapText`, which today lives in `ag-term` for Unicode/measurer reasons. § 8 picks the fix.

## 6. Cross-target story

The `OverlayLayer` artifact is target-agnostic. Each renderer paints it differently:

| Target   | Caret                              | Selection / highlight                   | Popover / tooltip                              | Anchor map                            |
| -------- | ---------------------------------- | --------------------------------------- | ---------------------------------------------- | ------------------------------------- |
| Terminal | DECSCUSR + cursor-positioning ANSI | Inverse / accent bg fill in buffer      | Sub-buffer composited into the parent buffer   | (debug-only; no direct paint)         |
| Canvas   | Caret rect drawn each frame        | Painter draws semi-transparent fills    | Floating canvas group at computed rect          | (debug-only)                          |
| DOM      | Browser-native caret               | Range API or absolute-positioned `<div>`| `<div class="overlay">` positioned via anchor   | Could feed CSS `anchor-name`           |

Same input / output contract; target-specific painters consume `OverlayLayer`. This is exactly where /pro pushed back hardest: `CursorShape` leaking into core was a target leak; the same rule applies — overlay *kinds* are semantic, *paint* is target-specific.

The terminal scheduler today reads `cursorRect` directly. Migration arc collapses that into `overlayLayer.caret`; same for focus + selection. New kinds (popover, tooltip) are painted by a new `OverlayPainter` in `@silvery/ag-term/pipeline` — invoked after the buffer diff, before output emission, so painted overlays participate in incremental rendering and dirty tracking.

## 7. Migration arc

The unified mechanism is a **peer that consumes** today's signals, not a replacement. Three cycles:

**Cycle 1 (this bead's followup `overlay-anchor-impl-v1`).** Add `anchorRef` + `decorations` to `BoxProps`. Add `anchorRect` + `decorationRects` peer signals. Add `OverlayLayer` collection at end of `syncRectSignals`. Existing scheduler code keeps reading `cursorRect` / `focusedNodeId` / `selectionFragments` directly — they now also appear in `OverlayLayer`. No breaking change.

**Cycle 2.** Migrate scheduler + selection-renderer + focus-renderer to read from `OverlayLayer.{caret,focus,selection}`. Deprecate per-signal reads at scheduler level (still readable from app code via `LayoutSignals`).

**Cycle 3.** First popover / tooltip ships in km-tui or silvercode using the new mechanism. Acceptance: zero new bespoke per-overlay signals on `LayoutSignals` for that feature.

Importantly: `cursorRect`, `focusedNodeId`, `selectionFragments` keep their docstrings and stay as-is — they are the canonical "frequent" cases. The mechanism subsumes *everything else* without forcing a rename of the substrate that just landed.

## 8. Soft-wrap selection-fragments — concrete path

Phase 4b shipped with a known gap: `computeSelectionFragments` only splits on embedded `\n`. Soft-wrap (a long paragraph the renderer breaks into multiple visual lines) produces one wide rectangle that visually looks correct because the underlying buffer also wraps, but doesn't produce per-visual-line entries. That blocks scrolling/clipping logic that wants to know "is the selection visible in the viewport" by inspecting `selectionFragments[i].y`.

The blocker: `computeSelectionFragments` lives in `@silvery/ag/layout-signals.ts`. Soft-wrap lives in `@silvery/ag-term/unicode.ts` (`wrapText` / `wrapTextWithMeasurer`). `@silvery/ag` cannot import from `@silvery/ag-term` (lower-level package).

### Options

**Option A — lift `wrapText` into a layering-neutral package.** Move the Unicode + width logic to `@silvery/text-utils` (or fold into `@silvery/ag` directly). `wrapText` only needs a `Measurer`-shaped object (`graphemeWidth`, `displayWidth`); it doesn't need any terminal-specific code. The terminal-specific bits (`textSizing`, `maybeWideEmojis` caps) are already passed in via `Measurer`.
  - Pros: Clean. `computeSelectionFragments` calls `wrapText` directly. Same path for canvas/DOM future.
  - Cons: Largest move (~800 LOC of unicode.ts), needs careful split (some of unicode.ts is genuinely terminal-specific — ANSI stripping, escape parsing).

**Option B — register a wrap measurer with `@silvery/ag`.** Add `setWrapMeasurer(m)` / `getWrapMeasurer()` in `@silvery/ag`. `@silvery/ag-term` calls `setWrapMeasurer` at runtime init. `computeSelectionFragments` calls `getWrapMeasurer()?.wrapText(text, width)` and falls back to `\n`-split when no measurer is registered (e.g., in pure-layout unit tests).
  - Pros: Smallest change. Mirrors how `_scopedMeasurer` already works inside `unicode.ts`. No package moves.
  - Cons: Adds a runtime singleton (mild global-state smell). Hidden coupling — pure-layout tests of `@silvery/ag` need a mock measurer to exercise the soft-wrap path.

**Option C — compute fragments terminal-side.** Move `computeSelectionFragments` into `@silvery/ag-term` and have `LayoutSignals.selectionFragments` be populated by a sync function in `ag-term` instead of `ag`. `@silvery/ag` keeps just the type.
  - Pros: No layering inversion.
  - Cons: Canvas + DOM targets need their own duplicate. Inverts the current pattern (all `compute*` functions live in `ag`). Spreads the layout-signals story across packages.

### Recommendation: Option B for v1, Option A as a planned follow-on.

Option B is the smallest correct change and matches the existing `_scopedMeasurer` indirection pattern that `@silvery/ag-term/unicode.ts` already uses internally. The wrap measurer is a tree-of-app singleton (one per `Term` lifecycle) in practice — `setWrapMeasurer` is called once in `createTerm` / `createTermless` setup. Pure-layout tests can pass an explicit measurer via a helper.

Long-term Option A is cleaner: text-utils as a sibling package would be nice for canvas and especially DOM (where browser text-measurement APIs differ entirely). Filing as a future cleanup, not blocking v1.

The `softwrap-selection-fragments` followup bead implements Option B with these acceptance points:

1. `@silvery/ag` exports `setWrapMeasurer({ wrapText })` + `getWrapMeasurer()`.
2. `@silvery/ag-term` calls `setWrapMeasurer` at runtime init (or per-Term scoped).
3. `computeSelectionFragments` honors the registered measurer; without it, falls back to `\n`-only.
4. New STRICT test: a wrapping selection across 3 visual lines emits 3 `Rect` entries, matches `term.cell` highlight bg.
5. The `\n`-only fallback path is preserved (no perf regression for `Text` without wrap).

The same `wrappedLineRects(node, range)` helper introduced for highlights (§ 5) reuses this infrastructure — implementing it once unblocks both kinds.

## 9. What this is NOT

- **Not Floating UI / Popper.js port.** Cycle 1 is rect-math placement only (place anchored rect, no flip, no shift). Collision-aware flipping is a v2 feature once we have a real popover use-case.
- **Not a popover library.** No transition animations, no portals, no accessibility tree manipulation. Just "where do these rects go this frame."
- **Not a replacement for `cursorOffset`/`focused`/`selectionIntent`.** Those stay as dedicated props for ergonomic + back-compat reasons.
- **Not a generic "decoration" extension point in v1.** The `kind` enum is closed; `custom` exists only as an escape hatch for plugins, with no compute hook in v1.
- **Not z-order management.** Decorations have a fixed paint order: caret > selection > highlight > popover > tooltip > drag-overlay > custom. App-level z-index would force decoration ordering into a separate concern — defer until a real use-case shows up.
- **Not anchor-from-popover-trigger pattern.** v1 anchors are declared on Boxes that exist in the tree; popovers reference them by ID. The "trigger automatically becomes its own anchor" sugar (à la `<Popover.Trigger>`) is for the popover *component* to add, not for the substrate.

## 10. Acceptance for the implementation beads

For `km-silvery.overlay-anchor-impl-v1`:

1. `BoxProps` gains `anchorRef?: AnchorRef` and `decorations?: readonly Decoration[]`.
2. `LayoutSignals` gains `anchorRect` and `decorationRects` peer signals.
3. `syncRectSignals` populates them; reference-equality skip mirrors the cursor/selection pattern.
4. `findAnchor(root, id, edge?)` returns the rect (or null) for any tree.
5. `placeFloating(anchor, target, placement)` is a pure function with unit tests covering all 12 placements.
6. `OverlayLayer` is exposed as a per-frame artifact alongside `term.frame`.
7. Caret / focus / selection appear in `OverlayLayer.{caret,focus,selection}` with values matching the existing per-signal reads (cross-check property test).
8. Per-frame STRICT test: fixture with one anchor + one popover renders the popover at the expected rect; SILVERY_STRICT=2 incremental == fresh.
9. No new BoxProps tests pass without a corresponding contract test (per the `New Props Require Tests` rule in `vendor/silvery/CLAUDE.md`).
10. Lint: zero new violations from the existing layout-output lint heuristics.

For `km-silvery.softwrap-selection-fragments`:

1. `setWrapMeasurer` + `getWrapMeasurer` exported from `@silvery/ag`.
2. `@silvery/ag-term` registers at runtime init.
3. `computeSelectionFragments` produces one Rect per visual line for soft-wrapped selections.
4. Highlight decoration kind reuses the same `wrappedLineRects` helper.
5. STRICT test: 60-character paragraph wrapped at width 20 with selection `(5, 35)` emits 2 fragments at `y=0` and `y=1` of the content rect.
6. Fallback path (no measurer registered) preserves `\n`-only behaviour, verified by a unit test with a fresh `@silvery/ag` import.

When both ship, Phase 4 is fully closed and the destination /pro flagged is reachable.
