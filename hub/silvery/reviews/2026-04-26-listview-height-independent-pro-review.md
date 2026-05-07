<!-- llm-meta: {"model":"GPT-5.4 Pro","session":"2405c72e","timestamp":"2026-04-26T07:46:55.256Z","query":"Review the silvery ListView height-independent mode after three recent fixes (J/H/M). Focus on architectural questions 1-6. Honest, technical, no padding.","cost":"$4.03","tokens":42783,"durationMs":406373} -->

**Verdict:** J/H/M are good bug fixes, but they do **not** close the bug class. Height-independent mode still has:

1. **multiple height truths** (`count × estimate`, hybrid measured+estimate sum, actual viewport row offset), and
2. **multiple viewport authorities** (cursor/item-based ensure-visible vs row-based wheel scroll).

That’s why scrollbar visibility, sticky-bottom, and scroll-cap had to be fixed in three separate places. The design is still patchy.

---

## 1) Architectural soundness

### Short answer

`max(estimate, measured)` is a **reasonable emergency patch**, not the right architectural seam.

### Why it’s not the right seam

You currently have at least these height models in play:

- **`totalRowsStable`** = `activeItems.length * (estimateAsNumber + gap)`
- **`totalRowsMeasured`** = `sumHeights(...)` = really **measured-or-estimated**, not “measured”
- **`rowsAboveViewport`** = prefix sum to `scrollOffset`
- plus Box/item-level scroll semantics via `scrollTo`

That’s already too many “totals”.

`max(totalRowsStable, totalRowsMeasured)` fixes one failure mode: **under-count when measured visible items are taller than estimate**. But it’s still structurally wrong because:

### Problems with the current seam

- **Aggregate max is too blunt.**  
  You’re taking `max()` of two totals after the fact, instead of having one per-item predicted height model.
- **False positives if estimate is high.**  
  If `estimateHeight` overshoots real content, `max(...)` can keep scrollbar/cap in overflow mode even when content actually fits.
- **It’s wrong for functional estimates.**  
  `estimateAsNumber = estimateHeight(0)` and then `items.length * estimateAsNumber` is garbage for mixed item types.
- **It’s wrong with `gap`.**  
  `n * (estimate + gap)` counts a trailing gap that doesn’t exist. Total content height is usually:
  `sum(itemHeights) + gap * (n - 1)`.
- **It doesn’t eliminate unseen-tail uncertainty.**  
  New/unmeasured items below viewport still fall back to estimate. So the bug is not gone, only moved.

### What the architecture should be

You want a single **HeightModel**:

- `predictedHeight[i] = measuredHeight(i, width) ?? estimateHeight(i)`
- maintain prefix sums over predicted heights
- every row-space consumer uses that one model:
  - scroll extent
  - max scroll row
  - at-bottom detection
  - scrollbar visibility
  - thumb position
  - anchor preservation

If you care about scrollbar-thumb visual jitter, solve that as **presentation smoothing**, not by introducing a second truth for control flow.

### Do you need a sliding window / confidence interval?

Not first. That’s second-order. The first missing abstraction is **one canonical predicted-height source**, not a fancier estimator.

If you later want better unseen-item prediction, do that inside the HeightModel:

- global rolling mean
- per-item-class mean
- per-renderer estimate
- maybe pessimistic/optimistic bounds

But fix the algebra first.

### Bigger smell: height-independent mode is half a new virtualizer and half the old one

You still call `useVirtualizer`, but then override its range with your own index-window logic. That means:

- measurement/cache comes from one system
- viewport anchoring comes from another
- row totals/scrollbar math comes from scattered calls to `sumHeights`

That split is the real smell. J/H/M don’t fix it.

---

### 2) Streaming-append performance

### Short answer

**Measurements are cached per item**, but the **totals are not**. So this is likely **not O(n) remeasurement**, but it **is O(n) aggregation** per render in important paths.

### What is cached

From the code:

- `measureItem(key, height, width)` suggests per-item measurement caching
- width is part of the cache key
- visible items get measured via `MeasuredItem`

So **already-measured items are not being fully remeasured every frame** unless:

- width changes
- content height changes
- keys change

### What is still O(n)

The expensive part is all the `sumHeights(...)` calls in render/effects. In this file alone, height-independent mode computes:

- `totalRowsMeasured = sumHeights(0, activeItems.length, ...)`
- `rowsAboveViewport = sumHeights(0, scrollOffset, ...)`
- `indexLeadingSpacer = sumHeights(0, indexWindowStart, ...)`
- `indexTrailingSpacer = sumHeights(indexWindowEnd, activeItems.length, ...)`

And the index-window budget loop calls `rowsForRange(start, end)` repeatedly, which calls `sumHeights` again.

So the likely complexity is:

- **O(n)** per render for full/prefix/suffix sums
- plus **O(W²)** inside the shrink loop, where `W <= maxRendered` so bounded, but still wasteful

For 5K items, this is probably still survivable in JS. For 50K, multiple panes, resize churn, or very high-frequency updates, it becomes real.

### Pathological cases

#### 1. Long item grows while streaming

If the last visible message is getting taller token-by-token:

- measurement updates on each layout
- then full-list sums recompute
- sticky-bottom math re-runs
- scrollbar math re-runs

This is exactly the kind of case where a prefix-sum tree pays off.

#### 2. Rapid resize

Width is part of the measurement key, so resize means remeasurement of visible wrapped items.
If the cache stores `(key,width)` entries without evicting old widths, resize drag can also become **memory churn**.

#### 3. Middle insertion/removal with default index keys

This is a serious one:

- default `getKey` is index
- if you insert/remove in the middle, measurement identity shifts
- cache correctness and reuse get sketchy fast

For append-only chat this is mostly fine. For anything else, stable keys are mandatory.

#### 4. Repeated viewport-size oscillation

If some parent layout causes width/height to toggle around a threshold, you can thrash measurement and row sums.

### Recommendation

If this component is going to be a core chat/log primitive, put heights behind a **Fenwick tree / segment tree / prefix-sum cache**:

- update item height: **O(log n)**
- total rows: **O(1)** or **O(log n)**
- rows above viewport: **O(log n)**
- scroll cap: cheap
- delta-on-grow/shrink: cheap

That is the real performance fix. The current cache only solves **measurement**, not **aggregation**.

---

### 3) Comparison with prior art

### react-virtualized

### What it does

- `CellMeasurer` + cache for unknown heights
- can auto-measure cells after render
- supports recomputation/invalidation

### Better than silvery

- More mature dynamic-height story
- More explicit cache/invalidation model
- Closer to a unified height system

### Worse than silvery

- Heavy
- DOM/web-centric
- Not built around TUI layout/render realities
- Sticky-bottom behavior is not a first-class ergonomic feature; you implement it yourself

### Bottom line

Silvery is **more integrated** for a chat/log TUI surface.  
react-virtualized is **more disciplined** about variable-size measurement machinery.

---

### react-window

### What it does

- Much simpler/faster
- `VariableSizeList` requires caller-known sizes
- if sizes change, caller must `resetAfterIndex`

### Better than silvery

- Cleaner mental model
- Better performance for known-size items
- Less architecture to get wrong

### Worse than silvery

- It basically punts on “unknown wrapped height” unless you build your own measuring layer
- No built-in sticky-bottom semantics
- No auto-measure pipeline

### Bottom line

For unknown-height streaming chat, silvery is trying to solve a harder problem than react-window.  
That’s good — but it means silvery needs stronger invariants than it currently has.

---

### OpenTUI ListBox

I’m less certain on OpenTUI internals, but the public shape of a `ListBox`-style widget is usually:

- fixed-row or near-fixed-row selection list
- item-based navigation
- not a sophisticated variable-height measured virtualizer

If that’s true here, then OpenTUI is sidestepping the hard part:

- simpler
- easier to reason about
- fewer scroll math bugs
- but much less suitable for wrapped-message chat/log surfaces

### Silvery vs OpenTUI

Silvery is better if you want:

- arbitrary wrapped items
- integrated measuring
- sticky-bottom
- search/history integration

Silvery is worse in:

- conceptual complexity
- scroll-state coherence
- likelihood of subtle bugs returning

---

### 4) Cursor pin vs sticky bottom

### Short answer

Current architecture is **not clean**. It works, but it’s carrying chat semantics in two different mechanisms.

### What’s happening now

`cursorKey={lastKey}` and `stickyBottom={true}` are not redundant because:

- **cursor pin** drives follow in **cursor/item-scroll mode**
- **stickyBottom** drives follow in **row-scroll mode** (`scrollRow !== null`)

That means you currently need both because **stickyBottom alone is not actually the sole source of bottom-follow**.

That is a smell.

### Why it’s a smell

A chat’s “follow latest messages” is a **viewport policy**, not a **selection policy**.

Using `cursorKey=last` as part of bottom-follow means:

- selection/focus state is now driving scroll policy
- at-bottom can become item-based instead of row-based
- cursor ensure-visible and sticky-bottom can both move viewport

That is the wrong split.

### Worse: current `atBottom` logic is not actually viewport-true

This line is telling:

```ts
const atBottomCursor =
  scrollRow === null && (!nav || activeCursor >= lastIdx)
```

Issues:

- if `nav=false`, then `!nav` makes this true whenever `scrollRow === null`
- if cursor is on last item, you treat that as “at bottom” even if the last item is tall and its bottom rows are not visible

For chat, that’s wrong. “At bottom” should mean **last row visible**, not “cursor is on last item”.

### Should stickyBottom supersede cursor pin?

**Yes, conceptually.**  
For chat, I would make bottom-follow a dedicated viewport behavior and keep cursor separate.

### But: can you drop cursor pin today?

**Not cleanly with the current implementation.**  
Today, `stickyBottom` only auto-follows on grow when `scrollRow !== null`. In cursor-follow mode, bottom-follow is piggybacking on cursor pin.

So:

- **conceptually**: `stickyBottom` alone is cleaner
- **in current code**: `stickyBottom` alone is not enough

### Better design

Split these concerns:

- `followEnd` / `stickyBottom` = viewport policy
- `cursorKey` = selection/focus
- optional `ensureCursorVisible` = whether cursor affects viewport

For chat:

- `followEnd=true`
- `ensureCursorVisible=false` unless user is actively navigating
- cursor can still exist, but it should not be the primary scroll authority

If you want one prop, make it something like:

- `follow="none" | "end"`
- `onFollowChange`
- and separate cursor behavior entirely

---

### 5) Height-independent mode invariants

### Short answer

Yes: **unmeasured items below the viewport are estimated**, not known.

So `totalRowsMeasured` is a misleading name. It is really:

- **measured where known**
- **estimate elsewhere**

That means Stream M fixed a real bug, but **not the fundamental uncertainty**.

### So can scroll cap still be wrong?

**Yes.**
If newly appended items are not yet measured and are much taller than estimate:

- `maxScrollRow` can still be too small
- sticky-bottom can snap to an underestimated bottom
- the viewport reaches “current predicted bottom”, not necessarily actual bottom

In a tail-following chat, this often self-heals quickly because the new tail item is rendered and measured soon. But that’s not a strong invariant.

### The more subtle version of the same bug still exists

If new content below viewport remains unrendered/unmeasured, the system still relies on `estimateHeight`.

So the true invariant is not:

> “render every item, measure as you go”

It is:

> “render a window, measure visible items, estimate the rest”

If your docs or mental model say otherwise, they’re wrong.

### Bigger invariant problems I’d flag

#### 1. `totalRowsStable` is not stable in a principled way

It uses:

```ts
items.length * (estimateHeight(0) + gap)
```

That is not a robust total for:

- functional estimates
- gap semantics
- mixed item classes

#### 2. Child-index anchoring is brittle

The viewport-anchored index-window logic maps:

```ts
firstVisibleChild -> item index
```

assuming basically one child per item (plus optional leading spacer).

That breaks or at least becomes suspect when you use:

- `gap > 0`
- `renderSeparator`
- maybe `listFooter`

Because those add extra child nodes, and this mapping:

```ts
viewportFirstItem = prev.startIndex + (f - leadingOffset)
```

is no longer item-accurate.

If silvercode uses no gaps/separators, you got lucky. The architecture is still brittle.

#### 3. Audit the width-aware `sumHeights` calls

Some `sumHeights(...)` calls in this file pass `viewportSize?.w`, some don’t.
If width is part of the measurement cache key, then any scrollbar-critical call omitting width may silently fall back to estimates after resize.

That needs auditing immediately.

### What a real invariant should be

For a given width:

- each item has a predicted height
- total scroll extent is the prefix sum of those predicted heights
- any change in measurement/width/content updates that structure
- if follow-end is active, scroll position tracks `maxRow` by delta

That’s the invariant that prevents this class from coming back.

---

### 6) Test coverage: what’s obviously missing

Yes, several important cases are missing.

### Highest-priority missing tests

### 1. Resize while scrolled, with wrapped content

Not just trackHeight change. Also:

- width shrink/grow
- measured heights invalidate
- scrollbar/cap/at-bottom recompute correctly
- if sticky-bottom active, tail stays pinned by **row delta**

This is probably the most important missing case.

---

### 2. Reactive height change without item-count change

Example:

- last message streams tokens and wraps from 3 rows to 4 to 5
- collapse/expand toggle
- syntax-highlighting block mounts later and changes height

This is a core chat/log case. The current fixes are very append-focused.

---

### 3. Insert/remove in middle while scrolled near end

You already mentioned removal from middle. Test both:

- stable `getKey`
- default index keys

The latter should probably be documented as unsafe for non-append lists.

---

### 4. Oversized estimate (false-positive overflow)

You fixed underestimation. You need the opposite test:

- estimate = 5
- actual items = 1 row
- content fits
- scrollbar should not appear / cap should be 0

Right now `max(estimate, measured)` and `totalRowsStable` make me suspicious here.

---

### 5. Tall appended item that is initially unmeasured

Specifically:

- append a very tall last item
- before onLayout measurement lands, ensure bottom-follow semantics don’t regress badly
- after measurement lands, viewport corrects to true bottom if sticky follow is on

That’s the subtle Stream M follow-up.

---

### 6. `gap` / `renderSeparator` in height-independent mode

This is not optional. The child-index anchoring math looks incompatible with extra child nodes between items.

Test:

- `gap > 0`
- `renderSeparator`
- wheel scroll
- viewport anchor stays stable
- no jumpy range selection

---

### 7. Sticky-bottom + cursor pin interaction

You specifically asked about this; test it directly:

- cursor pinned to last
- stickyBottom true
- append while at bottom
- wheel up then append
- wheel back to bottom then append
- keyboard move cursor up then append
- ensure only one scroll authority wins in each case

---

### 8. Shrink while at bottom

You test growth; also test:

- item removal from tail
- maxScrollRow decreases
- `scrollRow` clamps
- `onAtBottomChange` is sane
- no stale bump indicator

---

### 9. Width-key cache invalidation correctness

Because you’re keying measurements by width:

- measure at width 80
- resize to 40
- heights change
- totals/cap/scrollbar use the new measurements, not old cache

---

### 10. `nav=false` + stickyBottom

Given current code, `atBottom` semantics look wrong when `nav=false`.
This deserves a test because it may expose a real bug, not just a smell.

---

### Bottom line

These three fixes are **worth keeping**, but **no**, this is not yet “the design where the bug class can’t return”.

### The deeper problems are:

- no single canonical height model
- row scroll and cursor scroll both own the viewport
- height-independent mode is half index-window virtualizer, half legacy measured virtualizer
- several calculations are still estimate-driven in ad hoc ways
- child-index anchoring is brittle

### If you only do one real architectural fix:

Build a **single prefix-summed HeightModel** and make **all scroll extent / at-bottom / cap / thumb math derive from it**.

### If you do two:

Also make **sticky end-follow** the sole owner of chat auto-scroll, and stop using cursor pin as scroll policy.

That’s the line between “patched” and “closed”.

