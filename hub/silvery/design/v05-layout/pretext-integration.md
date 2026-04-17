# Pretext Integration

Pretext (github.com/chenglou/pretext, MIT) by Cheng Lou is a pure JS text measurement library. It does for text what Flexily does for layout: pure arithmetic, no DOM, cacheable. Together they form a complete layout+text engine that runs anywhere JS runs. Note: Pretext's layout phase is deterministic (pure arithmetic over cached widths), but the preparation phase depends on Canvas `measureText()` and actual fonts, so results may vary across platforms. The DeterministicTestMeasurer eliminates this for tests.

## Why Pretext

Silvery's canvas adapter assumes monospace text (`charWidth = fontSize * 0.6`). This blocks proportional fonts, accurate wrapping, content-aware sizing, and international text correctness. Pretext removes this assumption.

Pretext uses Canvas `measureText()` as ground truth. Two-phase design:

- `prepare(text, font)` — one-time: segment via `Intl.Segmenter`, measure each segment, cache per font. Cost: ~0.03ms per text block.
- `layout(prepared, maxWidth, lineHeight)` — repeated: walk cached segment widths, apply line-breaking rules. Cost: ~0.0002ms. Pure arithmetic, no Canvas access.

This matches Flexily's calling pattern perfectly — Flexily probes text nodes multiple times per layout pass (base size, then flex distribution). The expensive work happens once; the cheap work happens per probe.

## Integration Point: Flexily MeasureFunc

Flexily already has a callback for text measurement:

```typescript
type MeasureFunc = (
  width: number, // available width
  widthMode: number, // UNDEFINED(0) | EXACTLY(1) | AT_MOST(2)
  height: number,
  heightMode: number,
) => { width: number; height: number }
```

With Pretext (illustrative pseudocode — real implementation must handle AT_MOST vs EXACTLY, heightMode, multiline content, and line clamping):

```typescript
const prepared = pretext.prepare(text, font)

function measureFunc(width, widthMode, height, heightMode) {
  if (widthMode === UNDEFINED) {
    // Unconstrained: report intrinsic size (may be multiline if text has explicit breaks)
    const result = prepared.layout(Infinity)
    return { width: result.width, height: result.height }
  }
  const result = prepared.layout(width)
  // AT_MOST: return actual used width, not available width
  const usedWidth = widthMode === AT_MOST ? Math.min(width, result.width) : width
  return { width: usedWidth, height: result.height }
}
```

No Flexily engine changes needed. The MeasureFunc is the seam.

## TextLayoutService

> **Note:** This is a design doc. The shipped API in `flexily/src/text-layout.ts` is the source of truth and may differ slightly from the interfaces below.

Pluggable abstraction — the rendering target selects the backend automatically:

```typescript
interface TextLayoutService {
  prepare(input: {
    text: string
    style: ResolvedTextStyle
    direction?: "auto" | "ltr" | "rtl"
    locale?: string
  }): PreparedText
}

interface PreparedText {
  intrinsicSizes(): IntrinsicSizes
  layout(
    constraints: TextConstraints,
    options?: {
      includeLines?: boolean
    },
  ): TextLayout
}

interface IntrinsicSizes {
  minContentWidth: number // longest unbreakable segment
  maxContentWidth: number // unwrapped total width
}

interface TextConstraints {
  maxWidth?: number
  maxHeight?: number
  maxLines?: number
  wrap?: "normal" | "anywhere" | "none"
  overflow?: "clip" | "ellipsis"
  shrinkWrap?: boolean
}

interface TextLayout {
  width: number
  height: number
  lineCount: number
  firstBaseline: number
  lastBaseline: number
  truncated: boolean
  lines?: readonly TextLine[]

  // Geometry — on the layout result, not on PreparedText.
  // These depend on the specific layout (width, wrap mode, line clamp,
  // direction, actual line breaking), so they are properties of a
  // concrete layout, not generic backend capabilities.
  hitTest?(x: number, y: number): TextHit
  caretRect?(index: number, affinity?: "upstream" | "downstream"): Rect
  selectionRects?(start: number, end: number): readonly Rect[]
}
```

### API Design Rationale

**Geometry on layout result, not capabilities.** `hitTest`, `caretRect`, and `selectionRects` depend on width, wrap mode, line clamp, overflow, direction, and actual line breaking. They are properties of a specific layout, not generic backend capabilities. The earlier `PreparedText.capabilities` placement would have painted us into a corner.

**Wrapping vocabulary.** `"normal" | "anywhere" | "none"` is closer to CSS/Unicode behavior than `"word" | "grapheme"`. "Word" is not a great universal term for CJK and bidi text. Long-term, separate `lineBreak` / `overflowWrap` may be needed.

**Direction and locale.** Without these, bidi and locale-sensitive segmentation become awkward. Added to `prepare()` input.

**lineHeight belongs in resolved text style, not constraints.** The container constrains width/height/maxLines/clamp; style controls font metrics. `lineHeight` was moved out of `TextConstraints` into `ResolvedTextStyle`.

**maxLines replaces lineClamp + overflowY.** Text layout cares about `maxLines` + `overflow: "clip" | "ellipsis"`, not the box-level `overflowY`/`overflowX` axis abstraction.

### Future: Paragraph/Run Model

The current API assumes `string + style` — one string, one style per text node. This is correct for v1 leaf text but not a final text substrate.

For textily/docily (rich text editing), the API will need a paragraph/run model:

```typescript
// Future extension — not needed now, but API should not prevent it
prepareParagraph(runs: readonly TextRun[], style: ParagraphStyle): PreparedText

interface TextRun {
  text: string
  style: ResolvedTextStyle
}
```

This supports multiple styles in one paragraph (inline formatting, syntax highlighting, links/marks, inline widgets/embeds). The `prepare(string, style)` API remains for simple leaf text nodes.

## Backends

| Backend                   | Used by                         | How it works                                               |
| ------------------------- | ------------------------------- | ---------------------------------------------------------- |
| PretextMeasurer           | Canvas, SVG, PDF, image, remote | Wraps @chenglou/pretext prepare/layout                     |
| MonospaceMeasurer         | Terminal                        | charCount \* charWidth, always 1 line                      |
| DeterministicTestMeasurer | Tests, CI                       | Fixed grapheme width table (Latin 0.8, CJK 1.0, emoji 1.8) |
| Browser native            | DOM standalone                  | No silvery measurement — browser CSS handles text          |

Rule: if silvery owns positioning, Pretext measures. If the browser owns positioning, let it.

## When to Use Each Approach

Text in a UI engine involves three jobs: measuring (how wide/tall?), positioning (where does it go?), and painting (make it visible). Different approaches split these jobs differently.

| Approach                     | Who measures         | Who positions              | Who paints               | When to use                                                                                                                          |
| ---------------------------- | -------------------- | -------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Browser DOM                  | Browser              | Browser (CSS)              | Browser                  | Normal web apps. Full browser features (selection, find, a11y, IME) for free.                                                        |
| Pretext + DOM positioning    | Pretext              | You (absolute positioning) | Browser (DOM text nodes) | Precise layout control + real DOM text (selectable, searchable, accessible). What Cheng Lou's demos do. What PDF.js text layer does. |
| Pretext + Canvas             | Pretext              | You                        | You (ctx.fillText)       | Pixel-perfect rendering, custom compositing, non-DOM surfaces. Requires DOM mirror for accessibility.                                |
| MonospaceMeasurer + Terminal | Monospace arithmetic | You (cell grid)            | You (ANSI)               | Terminal surface. Always monospace.                                                                                                  |

### Mapping to Silvery Rendering Targets

- **ag-term**: MonospaceMeasurer (always). Terminal is a cell grid; monospace arithmetic is exact.
- **ag-canvas**: Pretext + Canvas. Silvery owns the entire pipeline — measure, position, paint.
- **ag-dom** (standalone): Browser handles text, Flexily handles boxes only — no Pretext needed. The browser's text engine does measurement and painting; silvery only positions the boxes.
- **ag-a11y** (DOM mirror): No measurement needed — positions come from Flexily computed bounds. The mirror is a write-only semantic projection, not a rendering target.
- **ag-dom-pos** (Internal/debug): Pretext + DOM positioning. Pretext-measured layout rendered as absolutely positioned DOM text elements. Primarily for validating Flexily+Pretext layout and debugging. May serve niche use cases (document-like surfaces where text selection matters).

ag-dom-pos is primarily an internal adapter for validating Flexily+Pretext layout and debugging. It may serve niche use cases (document-like surfaces where text selection matters) but is not a react-dom replacement for general web apps. Canvas is the primary browser surface for apps that need owned rendering.

Cheng Lou's demos use Pretext + DOM because it is the simplest rendering for demos — you measure with Pretext, then set `style.left`/`style.top` on real DOM text nodes. Pretext itself is renderer-agnostic. It just gives you numbers. What you do with those numbers (DOM positions, canvas draw calls, ANSI cell grid) is the rendering target's job.

### ag-dom-pos vs react-dom

ag-dom-pos renders positioned DOM elements — so how is it different from just using React DOM?

**What ag-dom-pos gives you over react-dom:**

| Advantage                      | Why                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Flexily layout                 | Deterministic flexbox, identical on terminal/canvas/export. No CSS browser quirks.                   |
| Shrinkwrap                     | Tightest text width preserving line count. CSS `fit-content` can't do this.                          |
| Content-aware intrinsic sizing | Pretext gives exact min/max-content before rendering. CSS needs DOM measurement round-trips.         |
| Variable-width text routing    | Text flowing around objects. CSS `shape-outside` is limited; Pretext `layoutNextLine` is general.    |
| Same components on terminal    | Same `<Box>`, `<Text>`, `<SelectList>` also work in terminal and canvas. react-dom components don't. |
| Deterministic testing          | `createTestMeasurer()` gives reproducible layout in CI without a browser.                            |
| Export parity                  | Same layout engine drives PDF/SVG/image export. react-dom layouts don't export.                      |

**What react-dom gives you over ag-dom-pos:**

| Advantage                | Why                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Entire web ecosystem     | CSS libraries, animations, media queries, CSS Grid, scroll snap, `:hover`, `@container` queries...                        |
| Browser text layout      | Line breaking, hyphenation, `text-align: justify`, `writing-mode: vertical`, font fallback cascading — decades of polish. |
| No double layout         | Browser does layout. ag-dom-pos computes layout in Flexily THEN positions DOM elements.                                   |
| CSS cascade/inheritance  | Themes, media queries, `:focus-visible` — all native.                                                                     |
| Third-party integrations | Analytics, A/B testing, browser extensions, translation tools.                                                            |
| Developer familiarity    | Everyone knows CSS.                                                                                                       |

**When to use which:**

ag-dom-pos is primarily an internal adapter for validating Flexily+Pretext layout and debugging. It may serve niche use cases (document-like surfaces where text selection matters) but is not a react-dom replacement for general web apps. For a normal web app — react-dom is better. You get the entire browser platform for free.

The value of ag-dom-pos is as a development/debugging tool for the silvery layout pipeline, not as a production rendering surface.

## Caching

Two-tier, orthogonal to Flexily's per-node cache:

**Tier 1 — prepared cache**: keyed by text content + resolved font properties. Value: segmented + measured PreparedText. Invalidated on content or style change.

**Tier 2 — layout cache**: keyed by PreparedText identity + width + constraints. Value: TextLayout result. Cheap to recompute but worth caching for repeated flex probes at the same width.

Pretext also caches segment metrics per-font internally. All three caches (Pretext internal, prepared, layout) coexist without redundancy.

## Font Resolution

Critical: measurement and painting must use the same font string. One canonical resolver:

```typescript
resolveTextStyle(style: TextStyle): ResolvedTextStyle {
  fontShorthand: string    // "14px 'Inter', sans-serif"
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: string
  lineHeight: number
}
```

Both Pretext `prepare()` and canvas `ctx.fillText()` consume the same resolved output. If they diverge, text wraps at one width during layout but paints wider/narrower — clipping, overlap, line-jump bugs.

## Intrinsic Sizing

CSS Flexbox needs min-content and max-content for flex-basis:auto and flex-shrink:

- **max-content**: width if text never wraps. From `prepare()` — sum of all segment widths.
- **min-content**: width of longest unbreakable segment. From Pretext's segment analysis — it already identifies break opportunities.

Today Flexily approximates these via MeasureFunc with UNDEFINED mode. With Pretext, both become exact. This is where Flexily could gain optional `intrinsicSizes()` hooks on nodes — generic, not Pretext-specific.

## Shrinkwrap

Binary-search for the tightest width that preserves line count — zero wasted pixels. Pretext's layout() is pure arithmetic over cached widths, so the binary search costs ~10 probes at ~0.0002ms each = ~0.002ms total.

Use case: chat bubbles, tooltips, badges, tags, auto-sized containers. Impossible in CSS without expensive DOM reflow. See chenglou.me/pretext/bubbles/.

## Variable-Width Line Routing

`layoutNextLine(prepared, start, maxWidth)` returns one line at a time with a different maxWidth per line:

```
Line 1: maxWidth = 300  (full width)
Line 2: maxWidth = 300
Line 3: maxWidth = 180  (image floated on right)
Line 4: maxWidth = 180
Line 5: maxWidth = 300  (past the image)
```

Enables: text wrapping around floated images/avatars, hanging indents, magazine-style layouts, chat bubbles with avatars causing non-rectangular text regions. See chenglou.me/pretext/masonry/.

## Pretext Capabilities We Leverage

| Capability            | Value in UI engine context                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| Grapheme segmentation | Correct caret movement, backspace, selection through emoji/ZWJ              |
| CJK line breaking     | Per-character break opportunities, correct min-content width                |
| Bidi support          | Mixed RTL/LTR display and wrapping (simplified, not full UAX#9)             |
| Emoji correction      | Canvas measures emoji wider than DOM at small sizes — Pretext auto-corrects |
| Segment caching       | Per-font measurement cache survives across prepare() calls                  |

## Pretext Limitations

- Not a full shaping engine (not HarfBuzz). Complex script edge cases may surface.
- Canvas measureText is the oracle — results depend on actual browser/font environment.
- Not fully deterministic across platforms (hence the DeterministicTestMeasurer).
- Font loading races: layout may shift when web fonts load. Need invalidation policy.
- Editor-grade features (bidi cursor rules, IME composition ranges) need augmentation beyond Pretext.
- Maturity: promising but not battle-hardened. Pressure-test: maintenance cadence, API stability, correctness corpus.

## Why Not Alternatives

| Alternative             | Why not                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Raw `ctx.measureText()` | Too primitive — no caching, no line breaking, no intrinsic sizes                        |
| Browser DOM measurement | Causes reflow, not deterministic, breaks headless/export story                          |
| WASM text engines       | Bridge overhead per MeasureFunc call, distribution friction, overkill for current stage |
| Yoga for text           | WASM→JS bridge per call is expensive; Flexily+Pretext is pure JS, zero overhead         |

Flexily + Pretext is the fastest possible integration — both pure JS, plain function calls, no bridge.

## References

- Pretext repo: github.com/chenglou/pretext
- Shrinkwrap demo: chenglou.me/pretext/bubbles/
- Masonry demo: chenglou.me/pretext/masonry/
- Pretext API: prepare, layout, prepareWithSegments, layoutWithLines, layoutNextLine
- License: MIT
- Bead: km-silvery.engine, km-silvery.engine.text
