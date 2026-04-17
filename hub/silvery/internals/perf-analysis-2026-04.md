# Silvery Performance Analysis — 2026-04-09

Deep-dive analysis of silvery vs ink performance, conducted via parallel sub-agents and GPT 5.4 Pro architectural review. All bench data from `hub/silvery/benchmarks/silvery-vs-ink.bench.ts`.

> **UPDATE 2026-04-09 evening**: All numbers in the original analysis below were measured with a STRICT env bug (`isStrictOutput()` treated `"0"` as truthy). Silvery was paying full O(cells) STRICT verification overhead on every bench iteration. Post-fix, silvery wins ALL 16 scenarios (2.5-5.2x). The original analysis and optimization plan below is preserved for context but the "silvery loses" sections are now moot. See `hub/silvery/launch/positioning-2026.md` for current canonical numbers.

## Executive Summary

**Silvery's architecture is working.** Post Tier 1 fixes + STRICT env bug fix, silvery wins every scenario 2.5-5.2x. The memo'd useState pattern (4.6-5.2x) is silvery's best case, exactly as designed. The original "losses" were all artifacts of the STRICT bug inflating silvery's bench times.

## Bench results (mounted, both with incremental ON)

| Scenario                           | Silvery                | Ink (incrementalRendering) | Winner            | Gap (absolute) |
| ---------------------------------- | ---------------------- | -------------------------- | ----------------- | -------------- |
| Cursor move 100-item list          | 441 ops/s (2.27ms)     | 463 ops/s (2.16ms)         | Ink 1.05x         | 0.11ms         |
| **Kanban 5×20 single text change** | **960 ops/s (1.04ms)** | 257 ops/s (3.89ms)         | **Silvery 3.73x** | **2.85ms**     |

## Cold render results (renderToString)

| Scenario               | Silvery | Ink     | Winner        | Gap     |
| ---------------------- | ------- | ------- | ------------- | ------- |
| Flat list 10           | 0.336ms | 0.294ms | Ink 1.20x     | 0.042ms |
| Flat list 100 (200x60) | 3.18ms  | 4.77ms  | Silvery 1.50x | 1.59ms  |
| Styled list 100        | 3.18ms  | 4.11ms  | Silvery 1.29x | 0.93ms  |
| Kanban 5×10            | 1.37ms  | 1.59ms  | Silvery 1.16x | 0.22ms  |
| Kanban 5×20 (200x60)   | 3.10ms  | 4.47ms  | Silvery 1.44x | 1.37ms  |
| Deep tree 20 levels    | 0.30ms  | 0.18ms  | Ink 1.66x     | 0.12ms  |
| Deep tree 50 levels    | 0.91ms  | 0.38ms  | Ink 2.38x     | 0.53ms  |

## Why Silvery Wins (kanban 3.73x)

**Cell-level diffing beats line-level diffing for bordered/styled layouts.**

Ink's `incrementalRendering` (added in v7.0) is post-hoc line diffing via log-update:

- React rerender happens
- Yoga layout happens
- Output strings are regenerated for ALL rows
- Then `previousLines[i] === nextLines[i]` checks each line
- Skips identical lines, re-emits changed lines as full strings

For a kanban with bg fills and borders:

- One card text change → that line's bytes change
- ANSI escapes embedded in line strings amplify byte differences
- Ink re-emits the full line ANSI string

Silvery emits only the cells that changed within the line via cursor positioning. **The denser the styling, the bigger silvery's advantage.**

**Pro's insight:** Ink still pays string-generation cost every frame even when lines match. That's the ceiling on its incremental wins.

## Why Silvery Loses

### 1. Cold render small trees (1.15-1.20x) — FIXED COST

**Root cause**: Per-render init overhead, scales linearly so larger renders amortize.

**Silvery does per render() call** (`vendor/silvery/packages/ag-term/src/renderer.ts:296`):

- New RenderInstance object with 14 fields
- New EventEmitter
- New React container via `createContainer`
- New fiberRoot via `createFiberRoot`
- Render leak detection scan
- assertLayoutEngine() check
- 9 option destructuring branches

**The bench accidentally amplifies this**: createRenderer's wrapper calls `current.unmount()` then full new `render()` on every iteration. ~30μs of overhead = the 1.15x gap.

### 2. Deep linear trees (1.66-2.38x) — DEAD WORK BUG

**Root cause**: Flexily Phase 7a calls `measureNode` for cross-size estimation that's never consumed when there's only 1 line and no baseline alignment. Creates **O(depth²) wasted work**.

**Code**: `vendor/flexily/src/layout-zero.ts:883-949`

This isn't structural — Yoga isn't fundamentally faster per-node for linear chains. Flexily is doing wasted work that Yoga skips.

### 3. 1000-item list re-render passing new tree (1.23x) — IT'S NOT REACT

**Root cause**: Both frameworks use the same `react-reconciler`. The asymmetry is in:

**Silvery's commitUpdate (per fiber, even unchanged ones):**

- `propsEqual` — 3 passes over keys
- `layoutPropsChanged` — 42 Set lookups
- `contentPropsChanged` — iterates 2 content + 18 style props
- Re-walk to set bgDirty/scrollToChanged/scrollOffsetChanged
- markLayoutAncestorDirty + markSubtreeDirty bubbling

**Silvery's post-commit pipeline (7 phases vs Ink's 3):**

- silvery: measure/layout/scroll/sticky/screenRect/notify/render/output
- ink: layout / stringify / log-update diff

**Silvery's doRender feature-detection overhead:**

- ~10 branches even when env vars unset
- \_ansiTrace, \_noIncremental, **silvery_content_all reset, \_cellDebugVal, rootHasDirty probe, **silvery_bench_phases probe, wasIncremental check

**The real issue**: This benchmark is silvery's WORST case. Passing a fresh React tree forces all 1000 fibers to be visited. Real apps use `useState` which targets only the changed component — silvery's dirty tracking would likely win **5-10x** there.

## Optimization Plan (priority order)

### TIER 1: Low effort, high impact (DO NOW)

**A. Fix Phase 7a dead work in flexily** (~1 day, fixes 2.38x deep tree gap)

- Skip measureNode call when `numLines === 1 && alignItems !== BASELINE && hasOnlyOneRelativeChild`
- Eliminates O(depth²) wasted work
- Likely flips deep tree from "Ink wins 2.38x" to "Flexily wins"
- Code: `vendor/flexily/src/layout-zero.ts:883-949`

**B. Add useState benchmark scenarios** (~2 hours)

- Parent useState + memo'd children
- Local item state
- External store + selector
- Expected: silvery wins 5-10x on the workload it was designed for
- Code: `hub/silvery/benchmarks/silvery-vs-ink.bench.ts`

**C. Strip per-render feature-detection overhead** (~2 hours)

- Hoist all bench/STRICT/instrumentation flags into a single boolean at module load
- Constant-fold the branches in doRender
- Code: `vendor/silvery/packages/create/src/create-app.tsx:1304`

**D. Reusable RenderInstance for createRenderer** (~4 hours)

- createRenderer's wrapper currently does `unmount() + new render()` per iteration
- Should detect "same dimensions" and use rerender path
- Closes most of the 1.15x cold render gap
- Code: `vendor/silvery/packages/ag-term/src/renderer.ts:1127`

### TIER 2: Medium effort, high impact

**E. Hybrid output emission** (Pro's #1 recommendation, ~3-5 days)

- Keep cell-level dirty tracking
- But emit dirty spans (contiguous runs) instead of per-cell
- Emit whole rows when dirty density is high
- Emit full sequential rows on initial render
- Helps cold renders, simple updates, AND preserves kanban win
- Code: `vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts`

**F. Specialize renderToString** (~2-3 days)

- Skip cursor diffing, live-terminal logic, dirty tracking
- Direct buffer → styled string serialization
- For renderToString, none of the incremental machinery is needed
- Closes small cold-render losses

**G. Skip pipeline phases globally** (~2 days)

- If tree has no sticky nodes: skip sticky phase
- No scroll containers: skip scroll phase
- No styling: simpler content/output path
- Detect at first render, set "feature flags" on the renderer

**H. Collapse propsEqual into single pass** (~1 day)

- Currently 3 passes over keys (propsEqual + layoutPropsChanged + contentPropsChanged)
- Identity check `oldProps === newProps` first
- Single loop with all 3 checks inline
- Code: `vendor/silvery/packages/ag-react/src/reconciler/helpers.ts:66`

### TIER 3: Maybe later

**I. Single-child chain fast path in flexily** (Pro: medium priority)

- More general than the Phase 7a fix
- Detect linear chains (1 child, nowrap, no baseline, no auto margins)
- Iterative forward+backward pass instead of recursive
- Only after Phase 7a fix and if profiles still show layout recursion as a cost

**J. Long-lived Ag instance**

- createAg() runs fresh per render
- Cache it on the renderer
- Memoizable internal work would actually be memoized

### SKIP

- Trying to win flat list 10 cold by 5-10% (~0.04ms gap, not worth complexity)
- Renderer-level hacks to bypass React reconciliation
- Broad Flexbox special-casing
- Optimizing root rerender benchmarks as if they were the main use case
- Complicating the main mounted path to save microseconds on static snapshots

## Strategic Implications

### Marketing/positioning

**OLD (false)**: "Silvery is 100x faster than Ink"

**HONEST (current data)**:

- Silvery wins 3.73x on bordered/styled real-world layouts (kanban, dashboards, tables, editors)
- Comparable speed on simple lists
- Ink slightly faster on tiny cold renders (negligible absolute gap)
- Flexily fast-path can flip the deep tree story

**The real differentiators:**

1. **Cell-level incremental rendering** wins big on dense styled UIs (3.73x)
2. **Pure JS layout** (no Yoga WASM init, no memory growth — though Anthropic fixed Ink's leak)
3. **Better composition** (pipe + providers)
4. **Better testing** (createRenderer, termless integration)
5. **Better debugging** (STRICT modes, instrumentation)

### Where silvery should double down

Pro's analysis: silvery should target workloads with:

- Dense chrome (borders, bg fills)
- Grids/tables/kanban
- Style-heavy UI
- Wide rows with localized changes
- Dashboards
- Editors / diff viewers
- Scrolling viewports with static chrome

These are exactly what TUIs are FOR. Ink's design optimizes for simple CLIs with linear output (the original use case). Silvery's design optimizes for full-screen interactive apps.

### What Anthropic doing makes us think about

Anthropic likely contributed `incrementalRendering` to Ink 7.0 (they hit the Yoga WASM memory issue with Claude Code). This means:

- Our "no WASM memory leak" angle is partially neutralized
- But silvery's cell-level diffing is structurally better than line-level
- Anthropic's fix improves Ink for simple cases but doesn't address the dense-chrome case
- We can position as "Ink works for CLIs, silvery works for apps"

## What I'd ship in the next sprint

Tier 1 in priority order:

1. **A** (Phase 7a fix) — biggest "free" win, closes the deep tree gap
2. **C** (strip doRender feature flags) — instant, low risk
3. **B** (useState benchmarks) — proves the real differentiator
4. **D** (rerender path in createRenderer) — closes cold gap

Then consider **E** (hybrid emitter) as the most strategically important Tier 2 win.

Total estimated effort for Tier 1: ~2-3 days. Expected outcome: silvery either wins or ties on every bench scenario (modulo the synthetic deep tree case if A's narrower fix doesn't fully address it).
