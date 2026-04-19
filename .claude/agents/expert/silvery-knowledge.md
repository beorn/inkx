# Silvery Knowledge — silvery agent

Last updated: 2026-04-18

## References (canonical sources — don't duplicate, supplement)

- `vendor/silvery/packages/ag-term/src/pipeline/RENDERING.md` — step-by-step pipeline algorithm
- `vendor/silvery/packages/ag-term/src/pipeline/LESSONS.md` — postmortems
- `vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md` — pipeline internals summary
- `vendor/silvery/CLAUDE.md` — silvery overview, key internals, debugging, testing
- `vendor/flexily/CLAUDE.md` — layout algorithm docs
- `vendor/silvery/docs/guide/the-silvery-way.md` — canonical component guide
- `vendor/silvery/docs/guide/styling.md` — semantic colors, typography

**DRY note**: sections below that overlap with canonical sources are initial snapshots. On future updates, prune to operational delta only — gotchas, failures, regressions, cross-domain connections, current state.

## Pipeline Phases

The full phase sequence runs on every frame, in strict order:

```
measure -> layout -> scroll -> sticky -> scrollRect -> [notify] -> content -> output
```

| Phase       | File                     | What it does |
|-------------|--------------------------|--------------|
| measure     | `measure-phase.ts`       | Set Yoga constraints for `fit-content` nodes. Traverses nodes with `width/height="fit-content"`, measures intrinsic content size. |
| layout      | `layout-phase.ts`        | Run `calculateLayout()` (Flexily), propagate computed rects to all nodes. Sets `layoutChangedThisFrame = true` on changed nodes. Sets `subtreeDirty` upward from changed nodes to root. |
| scroll      | `layout-phase.ts`        | Compute scroll offsets for `overflow="scroll"` containers. Determine visible children, sticky header positions within scroll containers. |
| sticky      | `layout-phase.ts`        | Compute sticky render offsets for non-scroll parents with `position="sticky"` children. |
| scrollRect  | `layout-phase.ts`        | Compute screen-relative positions (content position minus ancestor scroll offsets). Used by `useScrollRect()`. |
| notify      | `layout-phase.ts`        | Sync rect signals via `syncRectSignals()` driving `useBoxRect()`/`useScrollRect()` callbacks. Skipped for STRICT comparison renders to avoid side effects. |
| **content** | **`render-phase.ts`**    | **Render nodes to a `TerminalBuffer` (2D cell grid). This is the most complex phase -- incremental rendering with dirty flag cascade.** |
| output      | `output-phase.ts`        | Diff current buffer against previous, emit minimal ANSI escape sequences to stdout. |

All files live under `vendor/silvery/packages/ag-term/src/pipeline/`.

Orchestrated by `createAg()` in `ag.ts`. Callers use `ag.layout(dims)` + `ag.render()`, then run output phase separately via `term.paint(buffer, prev)`.

`TerminalBuffer` is the internal mutable representation. The public read API is `TextFrame` (created via `createTextFrame(buffer)` in `buffer.ts`), which provides an immutable snapshot with resolved RGB colors. `App` structurally implements `TextFrame`.

## Dirty Flag Cascade

The reconciler sets flags on nodes when props/children change. The render phase reads them to decide what to re-render. All are cleared after processing.

### Reconciler-set flags (epoch-stamped)

| Flag              | Set by                    | Meaning |
|-------------------|---------------------------|---------|
| `contentDirty`    | `commitUpdate`, `commitTextUpdate`, `appendChild`, etc. | Text content or content-affecting props changed. |
| `stylePropsDirty` | `commitUpdate` (always for visual changes) | Visual props changed (color, bg, border). Survives measure phase clearing `contentDirty`. |
| `bgDirty`         | `commitUpdate` (when `backgroundColor`, `borderStyle`, `outlineStyle` removed, or theme changed) | `backgroundColor` specifically changed (added, modified, or removed). |
| `childrenDirty`   | `appendChild`, `removeChild`, `insertBefore`, `clearContainer` | Direct children added, removed, or reordered. |
| `subtreeDirty`    | `markSubtreeDirty` (walks up from dirty descendant); `propagateLayout` (child rect change); `scrollPhase`; `stickyPhase` | Some descendant has dirty flags. Node's OWN rendering may be skippable. |

### Layout-phase flag

| Flag                     | Set by       | Meaning |
|--------------------------|--------------|---------|
| `layoutChangedThisFrame` | `propagateLayout` in layout phase | Node's `boxRect` changed this frame. Cleared by render phase after processing. |

### Epoch-based clearing

Dirty flags use epoch stamps rather than boolean fields. `advanceRenderEpoch()` is called once per render pass -- O(1) global clear. Individual node flags can also be cleared via `clearNodeDirtyFlags()` when a node is skipped.

Layout-affecting prop changes call `node.layoutNode.markDirty()` directly -- Flexily's `isDirty()` propagation to root is the sole layout gate. No silvery-side layout dirty flag exists.

### Style-Only Tracking

The reconciler tracks nodes where ONLY visual style props changed (no content, layout, or children changes) in a module-level `styleOnlyDirtyNodes` set (`dirty-tracking.ts`). This enables text restyle fast paths. The reconciler checks `!instance.contentDirty && !instance.childrenDirty` before tracking (React processes children before parents in the commit phase).

### How propagation works

The three cascade flags propagate top-down through `renderNodeToBuffer` calls:

- **`hasPrevBuffer`**: When true, child can use fast-path skip (pixels intact from clone). Set to false when `childrenDirty`, `childPositionChanged`, or `childrenNeedFreshRender`.
- **`ancestorCleared`**: Tells descendants that an ancestor erased the buffer at their position. A Box WITH `backgroundColor` **breaks** the cascade (its fill covers stale pixels). Without bg, it propagates.
- **`ancestorLayoutChanged`**: Tells descendants that an ancestor's layout changed. Does NOT break at `backgroundColor` boundaries (unlike `ancestorCleared`). Propagated as `childAncestorLayoutChanged = node.layoutChangedThisFrame || ancestorLayoutChanged`.

```typescript
// Normal containers:
childHasPrev = childrenDirty || childPositionChanged || childrenNeedFreshRender ? false : hasPrevBuffer
childAncestorCleared = contentRegionCleared || (ancestorCleared && !props.backgroundColor)
childAncestorLayoutChanged = node.layoutChangedThisFrame || ancestorLayoutChanged
```

## The Critical Formulas

Six computed outputs from 14 boolean inputs control the entire incremental rendering cascade. Pure logic extracted to `cascade-predicates.ts` for exhaustive testing (2^14 = 16,384 cases). Also implemented as reactive computeds in `reactive-node.ts` using alien-signals.

### canSkipEntireSubtree

```
= hasPrevBuffer && !contentDirty && !stylePropsDirty && !layoutChanged
  && !subtreeDirty && !childrenDirty && !childPositionChanged
  && !ancestorLayoutChanged && !scrollOffsetChanged
```

True only when `hasPrevBuffer=true` AND all dirty flags are false. Node is skipped entirely (clone has correct pixels). `scrollOffsetChanged` is checked inline in render-phase.ts (defensive check for scroll containers), not modeled in cascade-predicates.

### textPaintDirty (intermediate)

```
= isTextNode && stylePropsDirty
```

For TEXT nodes, `stylePropsDirty` IS a content area change (text has no borders). Measure phase may clear `contentDirty`, so `stylePropsDirty` is the surviving witness.

### contentAreaAffected

```
= contentDirty || layoutChanged || childPositionChanged
  || childrenDirty || bgDirty || textPaintDirty
  || absoluteChildMutated || descendantOverflowChanged
```

True when anything changed that affects the node's content area. **Excludes border-only paint changes for BOX nodes** -- this is why `needsOwnRepaint` (which includes `stylePropsDirty`) is NOT used here. Using it caused border color changes to cascade re-renders through ~200 child nodes per Card.

`absoluteChildMutated`: absolute child had `childrenDirty`, `layoutChanged`, or `childPositionChanged`. Forces parent to clear (removes stale overlay pixels in gap areas).

`descendantOverflowChanged`: a descendant's `prevLayout` extended beyond THIS node's rect and its layout changed. Recursive check following `subtreeDirty` paths via `hasDescendantOverflowChanged()`.

### bgRefillNeeded

```
= hasPrevBuffer && !contentAreaAffected && subtreeDirty && hasBgColor
```

A descendant changed inside a bg-bearing Box. The bg fill must re-run to clear stale child pixels (e.g., trailing chars from a shrunk Text). Mutually exclusive with `contentAreaAffected` (gated on `!contentAreaAffected`).

### contentRegionCleared

```
= (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !hasBgColor
```

Clear region with inherited bg when content area changed but node has no own bg fill. False when `!hasPrevBuffer && !ancestorCleared` (fresh buffer has no stale pixels).

### skipBgFill

```
= hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !bgRefillNeeded
```

Clone already has correct bg -- skip redundant fill. Critical for `subtreeDirty` cases: re-filling would destroy child pixels that won't be repainted (they're clean and will be fast-path skipped).

### childrenNeedFreshRender

```
= (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || bgRefillNeeded) && !bgOnlyChange
```

Children must re-render (`childHasPrev=false`). `bgRefillNeeded` triggers this because bg refill overwrites child pixels. Exception: `bgOnlyChange` uses `fillBg()` which preserves chars, so children skip.

### bgOnlyChange (fast path)

```
bgOnlyAffected = bgDirty && !contentDirty && !layoutChanged && !childPositionChanged
  && !childrenDirty && !textPaintDirty && !absoluteChildMutated && !descendantOverflowChanged
bgOnlyChange = hasPrevBuffer && bgOnlyAffected && hasBgColor && !ancestorLayoutChanged && !ancestorCleared
```

When ONLY `backgroundColor` changed on a Box node: uses `buffer.fillBg()` instead of `buffer.fill()` -- updates cell bg WITHOUT overwriting chars. Children skip (their chars are preserved). Disabled when any descendant has explicit `backgroundColor` (checked via `hasDescendantWithBg` inline).

### Key invariants

1. `contentAreaAffected && bgRefillNeeded` can never both be true
2. `contentRegionCleared && skipBgFill` can never both be true
3. When `!hasPrevBuffer && !ancestorCleared`: `contentRegionCleared=false`, `childrenNeedFreshRender=false`
4. `canSkipEntireSubtree` requires `hasPrevBuffer=true`

## Scroll Container Tiers

Scroll containers (`overflow="scroll"`) have special rendering logic in `renderScrollContainerChildren`. Three tiers, selected by `planScrollRender()`:

### Tier 1: Buffer Shift (scrollOnly)

When ONLY the scroll offset changed (no child/parent changes):
- Shift buffer contents by scroll delta via `buffer.scrollRegion()`
- Only re-render newly exposed children at the edges
- Previously visible children keep their shifted pixels

**Unsafe with sticky children** -- sticky headers render in a second pass that overwrites first-pass content. After a shift, those overwritten pixels corrupt items at new positions. Falls back to Tier 2.

### Tier 2: Full Viewport Clear (needsViewportClear)

When children restructured, scroll offset changed with sticky children, or parent region changed:
- Clear entire viewport with inherited bg (`scrollBg` = node's own `backgroundColor` or `nodeState.inheritedBg`)
- Re-render all visible children (`childHasPrev=false`)

`subtreeDirty` alone does NOT trigger viewport clear. Clearing for `subtreeDirty` caused a 12ms regression (re-rendering ~50 children vs 2 dirty ones).

### Tier 3: Subtree-Dirty Only

When only some descendants changed:
- Children use `hasPrevBuffer=true` and skip via fast-path if clean
- Only dirty descendants re-render

**Exception with sticky children**: When sticky children exist in Tier 3, all first-pass items are forced to re-render (`stickyForceRefresh`). This is needed because sticky headers overwrite first-pass content in a second pass -- the cloned buffer has stale content from previous frames' sticky positions that must be refreshed before the sticky pass. Pre-clear uses `bg: null` to match fresh render state.

## Sticky Two-Pass Rendering

### Scroll containers

Scroll containers with `position="sticky"` children render in two passes:

1. **First pass**: Non-sticky items, rendered with scroll offset
2. **Second pass**: Sticky headers, rendered at computed sticky positions (`hasPrevBuffer=false`, `ancestorCleared=false`)

Order matters: sticky headers render ON TOP of first-pass content. The second pass uses `hasPrevBuffer=false` because the effective scroll offset for a sticky child can change even when the container's doesn't.

Sticky children use `ancestorCleared=false` to match fresh render semantics. On a fresh render, the buffer at sticky positions has first-pass content, not "cleared" space. Using `ancestorCleared=true` caused transparent spacer Boxes to clear their region, wiping overlapping sticky headers rendered earlier in the second pass.

### Normal containers (non-scroll)

`renderNormalChildren` uses three passes (CSS paint order):

1. **First pass**: Normal-flow children (skip sticky + absolute)
2. **Second pass**: `position="sticky"` children at computed `renderOffset` positions (when `node.stickyChildren` is present -- set by `stickyPhase`)
3. **Third pass**: `position="absolute"` children (rendered on top)

Absolute children always use `hasPrevBuffer=false, ancestorCleared=false` in the third pass. The buffer at their position contains first-pass content, not previous-frame content -- conceptually a fresh render. Prevents transparent overlays from clearing first-pass content via `contentRegionCleared`.

## Incremental Rendering Invariant

**Incremental render must produce identical output to a fresh render.** This is THE key correctness rule.

`SILVERY_STRICT=1` verifies this by:
1. Running the normal incremental render (clone prevBuffer, skip clean subtrees)
2. Running a fresh render (null prevBuffer, render all nodes)
3. Comparing cell-by-cell

When a mismatch is detected, `IncrementalRenderMismatchError` captures:
- Cell values (incremental vs fresh)
- Node path to the mismatched cell
- Dirty flags and scroll state
- Fast-path analysis (which formula made the wrong decision)
- Render-phase stats (nodes visited/rendered/skipped)

### How incremental rendering works

**First render** (`prevBuffer === null`): Create fresh buffer, render ALL nodes.

**Incremental render** (`prevBuffer !== null`):
1. Clone `prevBuffer` (previous frame's pixels are the starting point)
2. Walk tree, evaluate dirty flags on each node via cascade formulas
3. Skip clean subtrees (all flags false -- pixels in clone are correct)
4. Re-render only dirty nodes and affected descendants
5. Three-tier scroll container strategy
6. Multi-pass rendering: normal flow -> sticky -> absolute

### Region Clearing

When a node's content area changed but it has no `backgroundColor`, stale pixels from the clone remain. `clearNodeRegion` fills the node's rect with inherited bg (from `nodeState.inheritedBg`, threaded top-down -- O(1) per node).

When a node shrinks, `clearExcessArea()` fills old-minus-new bounds. Two guards:
1. **Position-change guard**: Skip when node MOVED (prev.x != layout.x or prev.y != layout.y) -- formulas mix coordinates incorrectly.
2. **Parent border inset**: Clips to immediate parent's content area (inside border/padding), even when inherited bg comes from a colored ancestor.

### Descendant Overflow Clearing

`hasDescendantOverflowChanged()` recursively checks if any descendant's `prevLayout` extended beyond THIS node's rect and had `layoutChangedThisFrame`. When detected, `contentAreaAffected=true` triggers the node to clear its own region (restoring borders) and `clearDescendantOverflowRegions()` clears overflow beyond the node's rect. Only runs when `hasPrevBuffer && subtreeDirty`. Follows only `subtreeDirty` paths, returns early on first match.

### Text Background Inheritance (inheritedBg)

Text nodes with no explicit background inherit bg from their nearest ancestor Box with `backgroundColor`. Done via `inheritedBg` on `NodeRenderState`, threaded top-down in O(1) per node (no parent chain walks).

```typescript
// render-text.ts -> renderGraphemes: priority chain for bg
// 1) Text's own bg  2) inheritedBg from ancestor Box  3) getCellBg buffer read (legacy fallback)
const existingBg = style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : buffer.getCellBg(col, y)
```

The `getCellBg` fallback remains only for external callers of `renderTextLine` that don't pass `inheritedBg` (e.g., scroll indicators in `render-box.ts`).

## Flexily Layout

Flexily is a pure JavaScript flexbox layout engine -- Yoga-compatible API, 1.5-2.5x faster initial layout, 5.5x faster no-change re-layout, pure JS (no WASM).

### Integration with silvery

- Silvery's measure phase calls `node.layoutNode.markDirty()` for layout-affecting prop changes
- Flexily's `isDirty()` propagation to root is the sole layout gate (no silvery-side layout dirty flag)
- `calculateLayout()` runs in the layout phase, results are read via node rects

### Caching and fingerprinting

- **Zero-allocation design**: `layout-zero.ts` reuses `FlexInfo` objects, no `new` in layout loops
- **Re-layout consistency**: 1200+ fuzz tests verify incremental re-layout of partially-dirty trees matches fresh layout
- **Mutation testing**: `bun scripts/mutation-test.ts` verifies fuzz suite catches deliberate cache mutations

### Key files

| File | Purpose |
|------|---------|
| `vendor/flexily/src/layout-zero.ts` | Core layout algorithm (most critical, hot path) |
| `vendor/flexily/src/node-zero.ts` | Node class with FlexInfo (second most critical) |
| `vendor/flexily/src/layout-helpers.ts` | Edge resolution: margins, padding, borders |
| `vendor/flexily/src/layout-flex-lines.ts` | Pre-alloc arrays, line breaking, flex distribution |
| `vendor/flexily/src/layout-measure.ts` | `measureNode` -- intrinsic sizing |

### Intentional divergences from Yoga

- Default `flexDirection`: Row (CSS default), not Column (Yoga default)
- `overflow:hidden/scroll` + `flexShrink:0`: Item shrinks to fit parent (CSS spec), not expands to content (Yoga)
- `aspect-ratio` + implicit `stretch`: AR fallback alignment = `flex-start` (CSS spec), not stretch override (Yoga)

## Performance Characteristics

### Output phase efficiency

| Scenario          | Full Render | Incremental | Reduction |
|-------------------|-------------|-------------|-----------|
| 10 rows, 1 change | 1,196 bytes | 42 bytes    | 28x       |
| 30 rows, 1 change | 3,540 bytes | 33 bytes    | 107x      |
| 50 rows, 1 change | 6,324 bytes | 33 bytes    | 192x      |

### Scheduler batching

- `scheduleRender()` -> `queueMicrotask` -> frame rate check -> `doRender()`
- Coalesces synchronous updates via queueMicrotask
- Frame rate limiting: 16ms minimum between renders

### Key bottlenecks

- Viewport clear for subtreeDirty in scroll containers caused 12ms regression (re-rendering ~50 children vs 2 dirty ones) -- fixed by limiting Tier 2 triggers
- Border color changes cascading through ~200 child nodes -- fixed by using `contentAreaAffected` instead of `needsOwnRepaint`
- `getCellBg` buffer reads creating coupling with buffer state -- mostly resolved via `inheritedBg` inheritance

### Instrumentation

- `SILVERY_INSTRUMENT=1` enables stats collection
- Stats exposed on `globalThis.__silvery_content_detail` for programmatic access
- Per-frame: node visit/skip/render counts, cascade diagnostics, scroll container tier decisions
- Per-node trace entries gated on `_instrumentEnabled`

## Known Gotchas

1. **Transparent Boxes cascade clears.** A Box without `backgroundColor` propagates `ancestorCleared` to all descendants. A Box WITH `backgroundColor` breaks the cascade. Don't remove the `!props.backgroundColor` check from `childAncestorCleared`.

2. **Border-only changes must not cascade.** `stylePropsDirty` without `bgDirty` means only the border changed. Must NOT trigger `contentAreaAffected` or `childrenNeedFreshRender`, otherwise every `borderColor` change cascades through the entire subtree.

3. **Buffer shift + sticky = corruption.** Never use Tier 1 (`scrollRegion` shift) when sticky children exist. The sticky second pass overwrites pixels that the shift assumed were final.

4. **Scroll Tier 3 + sticky = stale content.** The cloned buffer has stale content from previous frames' sticky positions. Tier 3 must force all items to re-render (`stickyForceRefresh`) and pre-clear to `null` bg.

5. **Absolute children need `ancestorCleared=false` in second pass.** After first pass, the buffer at absolute positions has correct normal-flow content. Setting `ancestorCleared=true` causes transparent overlays to clear that content.

6. **`skipBgFill` is critical for `subtreeDirty`.** When only a descendant changed, the parent's bg fill must be skipped. Re-filling destroys child pixels that won't be repainted (they're clean and fast-path skipped).

7. **`getCellBg` coupling (mostly resolved).** Text bg uses `nodeState.inheritedBg` (threaded top-down, O(1)). The `getCellBg` fallback remains for scroll indicators in `render-box.ts`.

8. **Descendant overflow must be detected recursively.** `clearExcessArea` clips to the immediate parent's content area. If overflow extends into a grandparent's border/padding, the grandparent must detect and handle it -- clearing at child level overwrites grandparent's border (parent-first render order).

9. **`Box theme={{}}` re-resolves ALL `$tokens`.** Don't use for bg-only changes. Use `backgroundColor` directly.

12. **ThemeProvider theme changes don't propagate to descendant Text nodes via dirty flags.** `markSubtreeDirty` only walks UP to ancestors, setting `SUBTREE_BIT` on them. Descendant Text nodes keep their dirty bits from the previous epoch (clean). The Level 1 collected text cache (`prepared-text.ts`) embeds ANSI-encoded `$token` colors at collection time. Without a theme-context cache key, descendant Text nodes reuse stale cached text with the old theme's ANSI codes. Fix: `getCachedCollectedText` takes `contextTheme = getActiveTheme()` as a cache key. A theme ref change (identity check, O(1)) invalidates the cache and forces re-collection with the new token values. See `tests/features/theme-provider-cascade.test.tsx`.

13. **`collectTextWithBg` embeds `$token`-resolved ANSI codes into the cached text string.** This happens in `applyTextStyleAnsi` for virtual text children (raw text nodes without `layoutNode`). The ANSI codes include RGB values for `$primary`, `$muted`, etc. These are theme-context-dependent and become stale when an ancestor ThemeProvider changes its theme. `getTextStyle` at line 1434 of `render-text.ts` is called unconditionally and produces correct `style.fg`, but `mergeAnsiStyle` applies segment ANSI codes from the cached string OVER the base style — the segment override wins, restoring the old color.

10. **`prevLayout` vs `layoutChangedThisFrame`.** `layoutChanged` is driven by the `layoutChangedThisFrame` flag (set by layout phase, cleared by render phase). The old `!rectEqual(prevLayout, boxRect)` was permanently stale when layout phase skipped. `prevLayout` is still used by `clearExcessArea` and `hasChildPositionChanged`.

11. **`bgDirty` exists for a reason.** When `backgroundColor` changes from `"cyan"` to `undefined`, the current value is falsy but stale cyan pixels remain in the clone. `bgDirty` ensures `contentAreaAffected` fires so the region gets cleared.

## Failed Approaches

| Approach | Why it failed |
|----------|---------------|
| Broader viewport clearing for subtreeDirty | 12ms regression: re-renders ~50 children vs 2 dirty ones |
| Using `needsOwnRepaint` for cascade decisions | Includes `stylePropsDirty`: border color changes cascade through ~200 child nodes |
| Pre-clearing only current sticky positions | Old positions also have stale content in the buffer |
| `hasPrevBuffer=false` without clearing buffer | Stale content remains in the cloned buffer regardless of hasPrevBuffer flag |
| `ancestorCleared=true` for sticky second pass | Transparent spacer Boxes clear their region, wiping overlapping sticky content |
| Overflow clearing at immediate parent only | Child-level clear overwrites grandparent's border (parent-first render order) |
| Row pre-check with only packed metadata + chars | Misses true-color Map diffs (fgColors/bgColors) when both cells have TC flag |
| `!rectEqual(prevLayout, boxRect)` for layoutChanged | Permanently stale when layout phase skipped (no dirty nodes), causing O(N) render every frame |
| ANSI-embedded backgrounds in text | Bg leaked across wrapped lines via ANSI codes; replaced with `BgSegment` tracking |

## Regression Patterns

### Changes that commonly cause regressions

| Change type | Typical regression |
|-------------|-------------------|
| Modifying dirty flag evaluation in `renderNodeToBuffer` | Cascade propagation error -- either too many nodes skip (stale pixels) or too many render (performance) |
| Adding/changing scroll container logic | Tier selection error -- Tier 1 with sticky = corruption, Tier 2 for subtreeDirty = 12ms regression |
| Touching `clearNodeRegion` or `clearExcessArea` | Border corruption, bg bleed into sibling areas, grandparent border overwrite |
| Output phase row pre-check changes | True color garble -- progressive color corruption with correct characters |
| Wide char / emoji handling | Cursor drift -- each wide char shifts subsequent chars by 1 column |
| Adding new props that affect rendering | Missing dirty flag propagation -- incremental render skips the change |
| Background color changes on containers | Missing `bgDirty` handling, or `bgOnlyChange` fast path incorrectly triggered |

### How regressions manifest

- **Stale pixels**: A clean subtree was skipped but its pixels in the clone are wrong (cascade formula bug)
- **Pixel soup**: Region cleared with wrong bg color (inheritance error)
- **Border corruption**: Excess clearing extends into parent's border row (missing parent border inset)
- **Progressive garble**: Output phase skips rows with true-color differences (row pre-check bug)
- **Cursor drift**: Wide chars cause subsequent chars to shift right (missing continuation skip or CUP re-sync)
- **Blank children**: Parent cleared region but didn't set `childHasPrev=false` (`childrenNeedFreshRender` formula bug)
- **Flickering**: Every frame triggers full re-render (`layoutChangedThisFrame` not cleared properly)

## STRICT Mode

### Level 0 (default in production)

No verification. Fastest. Incremental rendering runs without any checks.

### Level 1 (`SILVERY_STRICT=1`, default in tests via `vitest/setup.ts`)

- **Buffer comparison**: After incremental render, runs a fresh render (null prevBuffer) and compares cell-by-cell
- **vt100 output verification**: Replays ANSI output through internal VT100 parser and compares
- Auto-enables instrumentation for the comparison render
- Enhanced `IncrementalRenderMismatchError` with dirty flags, scroll state, fast-path analysis

### Level 2 (`SILVERY_STRICT=2`, run via `test:strictest`)

Every-action invariants:
- Cursor visibility checks after every action
- Border integrity checks after every action
- End-of-test structural checks
- Everything from Level 1 plus per-action verification

### Terminal verification backends

```bash
SILVERY_STRICT_TERMINAL=vt100    # Internal VT100 parser (fast, same process)
SILVERY_STRICT_TERMINAL=xterm    # Independent xterm.js emulator
SILVERY_STRICT_TERMINAL=ghostty  # Ghostty WASM emulator
SILVERY_STRICT_TERMINAL=all      # vt100 + xterm + ghostty
SILVERY_STRICT_ACCUMULATE=1      # Replay ALL frames (O(N^2)) -- catches compounding errors
```

### What each mode catches and misses

| Mode | Catches | Misses |
|------|---------|--------|
| `STRICT` (buffer) | Render phase bugs: wrong dirty flag evaluation, skipped nodes, wrong region clearing, scroll tier errors | Output phase bugs, terminal interpretation bugs |
| `STRICT_TERMINAL=vt100` | `changesToAnsi` bugs where parser disagrees with generator (style transitions, cursor arithmetic) | Bugs where parser and generator agree but real terminals disagree (pending-wrap, `\x1b[K` in wrap state) |
| `STRICT_TERMINAL=xterm` | Terminal interpretation bugs (xterm.js-specific: OSC 66, wide char cursor, buffer overflow) | Ghostty-specific bugs, accumulated state bugs |
| `STRICT_TERMINAL=ghostty` | Ghostty-specific bugs | xterm.js-specific bugs |
| `STRICT_ACCUMULATE` | Compounding errors across multiple frames | Same limitation as vt100 (self-referential parser) |

### CI strategy

- PR CI: `SILVERY_STRICT_TERMINAL=vt100` (fast, zero deps)
- Nightly: `SILVERY_STRICT_TERMINAL=xterm` (independent emulator)
- Scheduled/allow-fail: `SILVERY_STRICT_TERMINAL=ghostty` (WASM, known grapheme bugs)
- Local debug: `SILVERY_STRICT_TERMINAL=all`

### Diagnostic env vars

```bash
SILVERY_STRICT=1                           # Buffer + vt100 verification
SILVERY_STRICT_TERMINAL=vt100|xterm|ghostty|all  # Terminal-level verification
SILVERY_STRICT_ACCUMULATE=1                # All-frames replay (O(N^2))
SILVERY_INSTRUMENT=1                       # Stats collection
SILVERY_CELL_DEBUG=77,85                   # Per-cell trace at col,row
DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log  # All silvery logging
DEBUG=silvery:content                       # Render phase stats
DEBUG=silvery:content:trace                 # Per-node trace entries
DEBUG=silvery:content:cell                  # Per-cell debug
DEBUG=silvery:measure                       # Measure phase debug
TRACE=silvery:render                        # Pipeline phase timing
```

### Loggily namespace reference

| Namespace | What |
|-----------|------|
| `silvery:render` | Frame-level spans with per-phase timing |
| `silvery:content` | Render phase stats per frame (render/skip counts) |
| `silvery:content:trace` | Per-node trace entries (skip/render decisions) |
| `silvery:content:cell` | Per-cell debug (node coverage at target coords) |
| `silvery:measure` | Measure phase debug (text measurement calls) |
| `@silvery/ag-react` | React reconciler pipeline spans |

## Package Structure

### Public packages (npm)

| Package | What |
|---------|------|
| `silvery` | Main barrel -- components, hooks, render, types, runtime |
| `@silvery/create` | App composition -- `createApp`, `pipe`, `with*` providers, TEA store |
| `@silvery/test` | Testing utilities -- `createRenderer`, `createTermless`, locators |
| `@silvery/headless` | Pure state machines -- SelectList, Readline (no React) |
| `@silvery/commands` | Command registry, keymaps, invocation |
| `@silvery/scope` | Structured concurrency -- `createScope`, `withScope` |
| `@silvery/signals` | Reactive signals -- thin wrapper around alien-signals |
| `@silvery/model` | Optional DI model factories |
| `@silvery/commander` | Type-safe Commander.js with colorized help, Standard Schema |
| `@silvery/ansi` | Everything terminal -- styling, ANSI primitives, detection, theme derivation |
| `@silvery/color` | Color math -- blend, brighten, darken, hexToRgb, contrast |

### Internal packages (workspace-only, `"private": true`)

| Package | What |
|---------|------|
| `@silvery/ag` | Core types, layout-signals (framework-agnostic reactive layer) |
| `@silvery/ag-react` | React reconciler, hooks (`useSignal`, `useAgNode`, `useBoxRect`), UI components |
| `@silvery/ag-term` | Terminal runtime, ANSI output, pipeline, `syncRectSignals` bridge |
| `@silvery/theme` | Theme tokens, 38 palettes, theme CLI |
| `@silvery/ink` | Ink/Chalk compatibility layers |

### Subpath imports from `silvery`

- `silvery` -- components, hooks, render, types
- `silvery/runtime` -- `run()`, `useInput`, `createRuntime`
- `silvery/theme` -- `ThemeProvider`, `useTheme`, palettes, color utilities
- `silvery/ui` -- component library
- `silvery/ui/cli` -- CLI progress indicators (no React)
- `silvery/ui/react` -- React progress components
- `silvery/ink`, `silvery/chalk` -- Ink/Chalk compatibility layers

### Key internal files

| File | What |
|------|------|
| `packages/ag/src/layout-signals.ts` | All node signals (rects + textContent + focused) -- Layer 1 |
| `packages/ag-react/src/hooks/useSignal.ts` | alien-signals -> React bridge -- Layer 2 |
| `packages/ag-react/src/hooks/useLayout.ts` | `useBoxRect`, `useScrollRect`, `useScreenRect` -- Layer 3 |
| `packages/ag-react/src/hooks/useAgNode.ts` | Raw AgNode + signals access for components |
| `packages/ag/src/text-frame.ts` | TextFrame + FrameCell type definitions |
| `packages/ag-term/src/ansi/term.ts` | Term type and `createTerm()` -- the central abstraction |
| `packages/ag-term/src/runtime/term-provider.ts` | Terminal as Provider (state, events, input parsing) |
| `packages/ag-term/src/runtime/run.tsx` | Layer 2 entry -- `run(<App />, term)` |
| `packages/ag-term/src/runtime/create-app.tsx` | Layer 3 -- multi-provider apps with zustand store |
| `packages/ag-term/src/scheduler.ts` | Batching, frame timing, stdout.write, STRICT comparison |

### Pipeline file map

| File | Responsibility |
|------|---------------|
| `render-phase.ts` | Tree traversal, dirty-flag evaluation, incremental cascade logic, scroll container tiers, region clearing |
| `render-box.ts` | Box bg fill (`skipBgFill` aware), border rendering, scroll indicators |
| `render-text.ts` | Text content collection, ANSI parsing, bg segment tracking, `inheritedBg` inheritance, bg conflict detection, inline rects |
| `layout-phase.ts` | Layout calculation, scroll state, screen rects, layout subscriber notification |
| `measure-phase.ts` | Intrinsic size measurement for fit-content nodes |
| `output-phase.ts` | Buffer diff, dirty row tracking, minimal ANSI output generation, inline incremental rendering |
| `cascade-predicates.ts` | Pure boolean logic for all 6 cascade outputs -- exhaustive testing oracle |
| `reactive-node.ts` | alien-signals wrappers for cascade derivations -- production path |
| `render-helpers.ts` | Color parsing, text width, border chars, style computation |
| `helpers.ts` | Border/padding size calculation |
| `index.ts` | Phase orchestration, type re-exports |
| `diff-buffers.ts` | Buffer diff algorithm (row pre-check + per-cell comparison) |
| `output-modes.ts` | Fullscreen vs inline output mode handling |
| `output-verify.ts` | STRICT terminal verification backends |
| `collect-text.ts` | Text content collection with bg segment tracking |
| `prepared-text.ts` | Pre-formatted text handling |
| `adapter-pipeline.ts` | Pipeline adapter (deprecated -- use `createAg()`) |
| `render-phase-adapter.ts` | Render phase adapter |
| `types.ts` | Shared pipeline types (`NodeRenderState`, `PipelineContext`, `RenderPhaseStats`, etc.) |

## Output Phase Details

### First render (prev === null)

`bufferToAnsi(next)` -- full sequential render:
1. `\x1b[H` (home cursor)
2. For each row: CUP to row start, write all cells with SGR style transitions, `\x1b[K` (clear to EOL)
3. Wide chars: skip continuation cell, emit CUP re-sync after each wide char
4. OSC 66 text sizing for terminals that support it

### Incremental render (prev !== null)

1. **`diffBuffers`**: Compare prev and next cell-by-cell
   - Dirty row bounding box narrows scan range
   - Row-level pre-check: `rowMetadataEquals` + `rowCharsEquals` + `rowExtrasEquals` (true colors, hyperlinks)
   - Per-cell comparison for dirty rows
   - Wide->narrow transition: emit continuation cell as extra change
   - Size growth/shrink: add strips for new/removed areas
   - Output: change pool (pre-allocated, no allocation) + count

2. **`changesToAnsi`**: Emit ANSI for changed cells
   - Sort changes by position (y * maxWidth + x)
   - CUP `\x1b[row;colH` (fullscreen) or relative `\x1b[nA/B/C` (inline)
   - Optimizations: `\r\n` for next-row-col-0, CUF for same-row-forward
   - SGR style delta: only emit changed attributes
   - CUP re-sync after each wide char

### Inline incremental rendering

`inlineIncrementalRender()` brings inline mode to parity with fullscreen by diffing buffers with relative cursor positioning. Runs when: `scrollbackOffset === 0`, buffer dimensions unchanged, visible window unchanged, cursor tracking initialized. Instance-scoped cursor state in `createOutputPhase()` closure.

## Symptom -> Check Cross-Reference

| Symptom | Check First |
|---------|-------------|
| Stale background color persists | `bgDirty` flag; `nodeState.inheritedBg`; is region being cleared? |
| Border artifacts after color change | `stylePropsDirty` vs `contentAreaAffected` distinction; border-only change should NOT cascade |
| Scroll glitch (content jumps/disappears) | Scroll tier selection; Tier 1 unsafe with sticky; Tier 3 needs `stickyForceRefresh` |
| Children blank after parent changes | `childrenNeedFreshRender` -> `childHasPrev=false`; viewport clear setting `childHasPrev` correctly? |
| Absolute child disappears | Two-pass rendering order; absolute children need `ancestorCleared=false` in second pass |
| Content correct initially, wrong after navigation | Incremental rendering bug; `SILVERY_STRICT=1` will catch it |
| Colors wrong but characters correct | Output phase: `diffBuffers` row pre-check skipping true-color Map diffs; check `rowExtrasEquals` |
| Text bg different from parent Box bg | `nodeState.inheritedBg`; ancestor Box `backgroundColor`; region clearing |
| Flickering on every render | `layoutChangedThisFrame` flag; verify `syncPrevLayout` runs at end of render phase |
| Stale overlay pixels after shrink | `clearExcessArea` not called; `contentRegionCleared` + `forceRepaint` interaction |
| CJK/wide char garble | `bufferToAnsi` cursor drift: wide char without continuation at col+1. Run `STRICT_TERMINAL=xterm` |
| Flag emoji garble at wide terminals | `bufferToAnsi`/`changesToAnsi` cursor re-sync; `wrapTextSizing` |
| Stale chars in ancestor border/padding after child shrinks | Descendant overflow: `hasDescendantOverflowChanged()` for recursive detection |

## Postmortems Summary

### The Big 4 Render-Phase Bugs

402 STRICT mismatches reduced to 47 (88%) by fixing:
1. **Dirty flag propagation** -- layout changes not propagating `subtreeDirty`. Added `markLayoutAncestorDirty()`.
2. **Incorrect region clearing** -- `clearNodeRegion` used wrong bounds on shrink. Must clip to colored ancestor's bounds.
3. **Absolute position rendering** -- wrong paint order. Fixed with two-pass (normal flow first, then absolute on top).
4. **Text background bleed** -- nested Text `backgroundColor` leaked across wrapped lines via ANSI codes. Replaced with `BgSegment` tracking.

### Sticky Children (2026-02-12)

10/10 fuzz failures. Three fixes: (1) Tier 2 clears to `scrollBg`, Tier 3 `stickyForceRefresh` clears to `null`; (2) `stickyForceRefresh` in Tier 3 re-renders all first-pass items; (3) sticky `ancestorCleared=false`.

### True Color Row Pre-Check (2026-02-24)

Progressive garble -- correct characters, stale colors. `diffBuffers` row pre-check only compared packed metadata + chars, missing true-color Maps. Fixed with `rowExtrasEquals()`.

### CJK Wide Char Cursor Drift (2026-02-25)

Wide chars cause `bufferToAnsi` to skip continuation incorrectly. Fixed with unconditional `x++` after wide char and explicit wide->narrow transitions in `diffBuffers`.

### Flag Emoji Cursor Drift (2026-03-12)

Flag emoji width disagreement between silvery and xterm.js. Fixed with unconditional OSC 66 wrapping for ALL `cell.wide` characters and CUP re-sync after every wide char in `bufferToAnsi`.

### Descendant Overflow Clearing (2026-03-12)

TextInput shrink from width=91 to width=2, overflow into grandparent's border. Made overflow detection recursive (`hasDescendantOverflowChanged` instead of `hasChildOverflowChanged`).

### Detail Pane "Stale Pixels" -- False Alarm (2026-04-08)

Hours debugging a non-existent rendering bug. TTY MCP text extraction (`mcp__tty__text`) produced garbled output due to Unicode width disagreements with xterm.js headless. Visual rendering (screenshots) was correct. Lesson: always verify TUI bugs with screenshots, not text extraction.

### replayAnsiWithStyles Pending Wrap (STRICT false positives)

11 test failures from missing pending-wrap semantics in internal VT100 parser. Parser wrapped immediately at last column instead of deferring. Production rendering was never affected -- only STRICT verification.

### Theme Cascade Cache Bug (2026-04-18)

`ThemeProvider` was using the `setActiveTheme()` global for `$token` resolution. Migration to `<Box theme={merged}>` + `pushContextTheme/popContextTheme` worked for fresh renders but NOT for incremental renders after a theme change.

Root cause: `collectTextWithBg` embeds `$token`-resolved ANSI codes (e.g., `$primary` → `\x1b[38;2;0;0;255m`) into the Level 1 collected text cache. The cache checked only node-local dirty bits (`COLLECTED_TEXT_DIRTY = CONTENT_BIT | CHILDREN_BIT | STYLE_PROPS_BIT | BG_BIT | SUBTREE_BIT`). A ThemeProvider Box theme change set these bits on the ThemeProvider Box (via `host-config.ts`), but NOT on descendant Text nodes — they had no prop changes. `markSubtreeDirty` only walks UP, not DOWN.

On incremental render: the ThemeProvider Box was rendered fresh (CONTENT_BIT set), pushed the new theme, but descendant Text nodes found their Level 1 cache valid (no dirty bits → cache hit). The cache returned text with old ANSI codes. `mergeAnsiStyle` applied the cached segment's fg (old theme color) OVER the `getTextStyle` result (new theme color). Wrong color written.

Key diagnostic path: `theme push trace shows #008000` + `parseColor trace shows resolved=#008000` + `write trap shows fg blue` → must be ANSI codes in the cached text overriding the fresh resolution. `SILVERY_STRICT=1` did NOT catch this because both incremental and fresh renders produced the same wrong color (fresh render also hit the cache since `doFreshRender()` advances the epoch, making dirty bits stale).

Fix in `prepared-text.ts`: `getCachedCollectedText` takes `contextTheme: Theme | null` as a third param. If `entry.collectedContextTheme !== contextTheme`, invalidate cache. `setCachedCollectedText` saves the theme ref. In `render-text.ts`, pass `getActiveTheme()` at the render-phase call site — by that point `pushContextTheme` has already fired, so the correct theme is on the stack.

Why `SILVERY_STRICT=1` missed it: STRICT runs a "fresh render" via `doFreshRender()` which calls `ag.render({ prevBuffer: null })`. This advances the render epoch, making ALL dirty bits stale (epoch mismatch). Cache checks fire as misses for nodes that were dirty... but the INNER Text node was NEVER dirty (not even in the initial render epoch that set dirty bits on the ThemeProvider Box). So `isDirty()` returns false for the Text node in BOTH incremental and fresh renders, and both get the same cached blue text. Only after the context-theme fix does the fresh render produce green.

## Effective Debugging Strategies (Priority Order)

1. `SILVERY_STRICT=1` -- always start here
2. Write a failing fuzz seed test or `withDiagnostics(createBoardDriver(...))` test
3. Read the mismatch error output (cell values, node path, dirty flags, fast-path analysis)
4. `SILVERY_INSTRUMENT=1` -- understand whether too many or too few nodes rendered
5. Check the five critical formulas in `renderNodeToBuffer`
6. Verify text bg inheritance (`nodeState.inheritedBg`) and region clearing bg color
7. Parallel hypothesis testing via sub-agents
