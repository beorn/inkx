# Width Allocation

Every surface that splits an integer span across parallel tracks — table columns, board columns, pane lanes — uses one allocator: `apportion()` from `@silvery/ag`. You give it a `[min, max]` band per track and the number of cells you actually have; it gives you back one integer width per track, plus an honest answer when nothing legal fits.

There is exactly one of these in silvery on purpose. Hand-rolled splitters (`Math.floor(width * 0.3)`, per-side floors, quadratic `flexShrink` weights) all look right at the width you tested and misbehave somewhere else in the sweep — a column that shrinks as the terminal widens, a lane that oscillates, a prose column squeezed to four characters per line while a short column sits on slack it cannot use. Those are not tuning problems; they are properties the arithmetic either has or doesn't. `apportion()` has them.

```ts
import { apportion, type ApportionTrack } from "@silvery/ag"

const tracks: ApportionTrack[] = [
  { min: 10, max: 16 }, // short id
  { min: 12, max: 76 }, // label
  { min: 52, max: 209 }, // prose
]

const { widths, t, feasible } = apportion(tracks, 99)
// widths → [11, 19, 69]   t ≈ 0.11   feasible → true
```

## Intrinsic widths: the band

A track's band is `[min-content, max-content]`.

- **max-content** is the width the content wants if nothing ever wrapped — the longest line, measured unwrapped.
- **min-content** is the narrowest width the content can survive: the longest run the wrap mode is unable to break.

For text, both come from `intrinsicWidths(text, wrap)` in `@silvery/ag-term/unicode`, and **the wrap mode decides the floor**:

```ts
import { intrinsicWidths } from "@silvery/ag-term/unicode"

intrinsicWidths("checkout the branch", "wrap")
// → { minContentWidth: 8, maxContentWidth: 19 }   "checkout" is unbreakable

intrinsicWidths("checkout the branch", "truncate")
// → { minContentWidth: 1, maxContentWidth: 19 }   truncation can always fit
```

Word-aware modes (`wrap`, `even`) report the longest unbreakable segment as their floor: squeeze below it and a word gets cut with no visible sign that anything was lost. The truncate family (`truncate`, `truncate-start`, `truncate-middle`, `truncate-end`, `clip`, `wrap={false}`) and character-level `hard` declare a min-content of **1** cell for non-empty text — both can break or trim anywhere, so any width ≥ 1 is legal for them. Multi-line strings take the max over their lines.

The wrap modes themselves are documented in [Text Layout](/guide/layouts#text-layout); this page only cares about what each mode does to the floor.

## One tension slides every track

The allocator does not size tracks one at a time. It picks a single scalar **tension** `t` in `[0, 1]` and slides every track across its own band together:

```
w_i = min_i + t · (max_i − min_i)
```

`t` is chosen so the real-valued widths sum to the width you have:

```
t = clamp((width − Σmin) / (Σmax − Σmin), 0, 1)
```

At `t = 0` every track sits on its floor; at `t = 1` every track sits on its cap. This is the css-tables-3 automatic-layout distribution specialized to the all-auto column case, where the sizing guesses collapse to that one interpolation parameter.

Two consequences fall out for free and are worth internalizing, because they are the reason you rarely need per-column tuning:

- **Shrink is proportional to shrinkability** (`max − min`), not to current size. A wide prose column has a lot of room between its floor and its cap, so it yields most of the deficit. A short id column has almost none, so it barely moves.
- **A rigid track never yields.** If `min === max`, the term `t · (max − min)` is zero at every tension. You do not need a `flexShrink={0}` escape hatch; the band already says it.

Two helpers expose the intermediate values when you want to reason about them or write a test:

```ts
import { apportionTension, apportionRealWidths } from "@silvery/ag"

apportionTension(tracks, 99) // the scalar t the allocation used
apportionRealWidths(tracks, 99) // the unrounded ideal, before integer rounding
```

`apportion()` also returns `t` on its result, so you can read the tension without a second call.

## Monotone rounding

Terminal cells are indivisible, so the real-valued ideal has to become integers. **How** you round is the whole ballgame.

`apportion()` uses Webster/Sainte-Laguë incremental apportionment: award the `Σmax`-capped cells one at a time to whichever track has the highest priority `weight_i / (2·awarded_i + 1)`, skipping tracks already at their cap. That method is **house-monotone by construction** — apportioning `units + 1` cells extends the apportionment of `units` by exactly one cell:

> Widening the span by one cell gives exactly one track one more cell. No track ever shrinks as the span widens.

That is the property you feel when you drag a terminal edge and nothing jitters. Largest-remainder (cumulative) rounding — the obvious implementation, and the one most hand-rolled splitters reach for — does **not** have it. It was measured violating it here, which is the Alabama paradox; Balinski–Young proves only divisor methods are house-monotone, so largest-remainder is deliberately not offered as an option.

The regression suite pins this on the real defect specimen: going from width 92 to width 93 on the three-track table above moves exactly one column by exactly one cell, and no column shrinks anywhere across the full `Σmin`…`Σmax` sweep.

Ties go to the **lowest index**, so the leftmost track wins every tied cell. That positional bias is deliberate and is a separate knob from correctness — a rotating or center-out tie-break would change *which* track gets the extra cell, not whether the result is valid. Don't quietly fold a different tie-break into the allocator.

## Infeasibility is reported, not rendered

When `width < Σmin`, there is no legal allocation: some track would have to sit below its own floor. `apportion()` does not pick a least-bad squeeze and hand it back looking like a normal result. It returns:

```ts
const result = apportion(tracks, 69) // Σmin is 74
result.feasible // false
result.widths // [10, 12, 52] — the min-content widths, for reference only
```

**Rendering `result.widths` without checking `result.feasible` is the silent failure this design exists to prevent.** The widths are a diagnostic, not an allocation: laid out unconditionally they overflow the container by `Σmin − width` cells while every individual column still looks plausible on screen, which is precisely the bug that is hardest to notice and hardest to trace back.

The contract is that the caller escalates — degrade the wrapping, drop a column, switch presentation, or fall back to a different sizing path — and the escalation is visible to the user. That is the house style: make the broken state loud rather than approximately correct. See [The Silvery Way](/guide/the-silvery-way) for the wider convention, and [Debugging](/guide/debugging) for the `SILVERY_STRICT` checks that enforce the same instinct at runtime.

## stretch

By default (`stretch: false`) widths cap at `max` and the returned sum may fall **short** of the width you passed. That is what you want for a natural-width table: no column is padded past the point where the extra cells do anything.

```ts
apportion(tracks, 5000) // widths → [16, 76, 209], sum 301, not 5000
apportion(tracks, 5000, { stretch: true }) // widths sum to exactly 5000
```

With `stretch: true`, any excess beyond `Σmax` is distributed proportionally to each track's `max` (through the same monotone rounding), so wide tracks absorb proportionally more of the surplus. Reach for it when the tracks must tile a fixed span exactly — a full-width status bar, a pane row that has to cover the screen — and leave it off when trailing whitespace is the better answer.

## Table's escalation ladder

`<Table>` is the reference consumer. It builds one track per column — `min-content + chrome` and `max-content + chrome`, where chrome is the cell padding plus the column separator cell when framed — and then walks three rungs, in order, stopping at the first one that produces a legal allocation.

**Rung 1 — the bands as measured.** `apportion(bands, available)`. The normal case; nothing else runs.

**Rung 2 — degrade the wrapping.** If the floors don't fit and the cell wrap mode is wrap-capable, every non-fixed track drops its floor to one content cell (character wrapping can break anywhere) and the allocation is retried. When this rung wins, body cells switch to `wrap="hard"`, so the degradation is **visible** — text breaks mid-word — rather than a silent squeeze below a floor. Explicit `width` columns keep their band and do not degrade.

**Rung 3 — flex fallback.** If even one-cell floors don't fit, no legal allocation exists. The table stops asking the allocator and hands sizing to flexbox: each cell takes `flexBasis` at its max-content, shrink weight equal to its band shrinkability (`max − min`) for columns that opted in via `shrink` or `grow`, and `overflow="hidden"` on both cell and row. Text-level truncation marks the loss with an ellipsis. This is also the path for the very first frame, before the container has been measured.

One default catches people out: `<Table>`'s `cellWrap` defaults to `truncate`, and the truncate family is not wrap-capable — there is nothing left to degrade, since truncation already declares a floor of 1. **With the default wrap mode, rung 2 is skipped entirely** and an infeasible allocation goes straight to rung 3. Pass `cellWrap="wrap"` (or `"even"`) when you would rather have narrow columns wrap than have wide ones truncate.

## Per-column control

You rarely need any of these — the bands are measured from your actual data — but each one is a specific, local override:

```tsx
<Table
  data={rows}
  cellWrap="wrap"
  columns={[
    { header: "PID", key: "pid", width: 7, align: "right" }, // pinned
    { header: "Name", key: "name", minWidth: 12 }, // floor raised
    { header: "Command", key: "cmd", maxWidth: 60, grow: true }, // cap + takes slack
  ]}
/>
```

- **`width`** pins the track: its band becomes a single point, so it is rigid at every tension and never degrades on rung 2.
- **`minWidth`** raises the measured floor; **`maxWidth`** lowers the measured cap. Both are *total* track widths, chrome included. They are clamps applied on top of the intrinsic measurement, and `maxWidth` wins if the two conflict — the floor is capped by the cap, never the other way round.
- **`grow`** lets a column keep taking positive free space past its allocation (`flexGrow: 1` on top of the allocated width). Useful for the one column that should absorb whatever the others leave behind.
- **`shrink`** only affects rung 3: it opts a column into flex shrinking when no legal allocation exists. Inside rungs 1 and 2, shrink behavior is already implied by the band.

**Intrinsic sizing reads the rendered cell text, not the source data.** A `render()` that turns a 300-character source field into a short label contributes the *label's* width to the band — the long source never inflates the floor. The flip side is the gotcha: if `render()` returns a React node rather than a string or number, that cell contributes nothing to the measurement, and the column is sized from its header and its string-valued rows alone. Give such a column an explicit `minWidth` (or return a string) when the rendered node is wider than the header.

## Why it cannot oscillate

Allocating from a measured width is the shape that classically feeds back on itself: measure → allocate → relayout → measure something different → allocate again. It doesn't here, for two independent reasons.

First, the measurement is a **committed** rect. `<Table>` reads its container through `useBoxRectDangerously()`, which returns the rect as of the most recent event-batch commit boundary. That value is invariant across every convergence pass within a batch, so a render that reads it and writes layout-affecting props produces the same output on every pass. The convergence loop terminates in one pass; no feedback edge can form. (This is the general contract described in [Layout Coordinates](/guide/layout-coordinates) — width allocation is just one consumer of it.)

Second, the interesting case is a **fixpoint**. A content-sized parent measures `Σmax`, and `apportion(tracks, Σmax)` returns exactly the max widths — tension is 1, every track sits on its cap, the sum is `Σmax`. Feeding the output back in as the input reproduces the input. There is no width at which the loop could chase its own tail.

## Using apportion directly

You do not need a `<Table>` to use the allocator. Any integer span split across parallel tracks qualifies — pane lanes, board columns, a status bar's segments:

```ts
import { apportion, type ApportionTrack } from "@silvery/ag"

function splitPanes(available: number) {
  const lanes: ApportionTrack[] = [
    { min: 20, max: 40 }, // sidebar: useful between 20 and 40
    { min: 40, max: 120 }, // editor: wants the room
    { min: 0, max: 24 }, // inspector: optional
  ]

  const { widths, feasible } = apportion(lanes, available)
  if (!feasible) return collapseInspectorAndRetry(available) // escalate — never render these widths
  return widths
}
```

The whole discipline is in those two lines: describe each lane as a band, and branch on `feasible` before you use the numbers.

### The same failure, outside the allocator

`computeRowSideGeometry()` (`Content.Row`'s side-slot math) is worth reading as a specimen even though it does not call `apportion()` — it is a hand-rolled splitter that had exactly the defect the allocator is built to prevent, and its docstring records it:

> The historic inline math floored HALF the remainder into EACH side slot independently, so the slot PAIR consumed two cells for every one the row gained and the middle lane oscillated (shrank as the terminal widened) six times across available 30..43 — split-pane territory.

Two independent `Math.floor()` calls on halves of the same remainder is a rounding rule with no monotonicity guarantee, and the terminal widths where it bites are ordinary split-pane widths, not exotic ones. The fix floors **once** on the pair budget and sends the parity cell to the centering margins, which restores monotonicity while leaving every slot width identical to its historic value.

The lesson generalizes past that one function: if you find yourself dividing an integer span and rounding the pieces independently, you are writing an allocator. Use the one that already has the properties.

## Gotchas

- **Non-integer input throws.** Fractional widths, mins, or maxes are a programming error, not a rounding job — `apportion()` raises rather than silently flooring. `min > max` and negative `min` throw too. Round at the boundary where you measure, and pass whole cells in.
- **`feasible: false` widths must not be rendered.** They are min-content values, returned so you can report or log what was needed. Using them unconditionally overflows the container while looking locally correct. Branch on `feasible` at every call site.
- **Ties favor the leftmost track.** With identical bands, column 0 collects every tied cell, so an odd remainder lands on the left. If that reads badly in your layout, adjust the bands — do not change the tie-break inside the allocator.
- **`stretch: false` means the widths may not sum to `width`.** That is by design (natural-width tables). If you are asserting `Σwidths === available` in a test, either pass `stretch: true` or assert `Σwidths === Math.min(available, Σmax)`.

## See also

- [Text Layout](/guide/layouts#text-layout) — wrap modes, and what each one does to min-content
- [Layout Coordinates](/guide/layout-coordinates) — the committed-rect contract that makes measured allocation safe
- [Table API](/api/table) — props, columns, and the escalation ladder in component terms
- [The Silvery Way](/guide/the-silvery-way) — the wider house style this design follows
