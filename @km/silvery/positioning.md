---
mentions:
  - km
  - Bjørn
id: "@km/silvery/positioning"
aliases:
  - km-silvery.positioning
  - km-silvery-positioning
created_by: Bjørn Stabell
created_at: 2026-04-09T14:37:22Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
closeReason: "Grooming 2026-04-30: WIP 20d, deliverable shipped:
  docs/silvery-positioning-brief.md (referenced in km CLAUDE.md as canonical
  positioning doc). The 'Ink 7.0 honest narrative' framing is captured. Close."
---

# [x] Silvery positioning — post Ink 7.0 honest narrative @km/silvery #task #P0 @Bjørn Stabell

Strategic positioning for silvery given current bench data and Ink 7.0's feature parity gains.

## Core message

**"Ink for CLIs, silvery for apps."**

Silvery isn't "Ink but faster." It's a different product targeting full-screen interactive applications while Ink targets CLI tools.

## The honest numbers (2026-04-09)

### Silvery wins (mounted, both with incremental ON)

- **Kanban 5×20 single text change: 3.73x** (cell-level diffing on dense chrome)
- Flat list 100 @ 200x60: 1.50x (scaling advantage)
- Kanban 5×20 cold: 1.44x
- Styled list 100: 1.29x
- Kanban 5×10: 1.16x

### Silvery loses

- Deep tree 50 levels: Ink 2.38x (fixable — flexily Phase 7a dead-work bug)
- Deep tree 20 levels: Ink 1.66x (same fix)
- Flat list 10 cold: Ink 1.20x (~40μs, fixable via createRenderer reuse)
- 1000-item re-render (new tree): Ink 1.23x (benchmark artifact — useState would flip 5-10x)

## Old claims to retire

### "100x faster updates"

**RETIRE.** Methodology was Ink render()+unmount() per iteration vs silvery rerender() on warm app. Comparing cold-init vs warm-update. Real apples-to-apples: 1.05-3.73x depending on scenario.

### "No Yoga WASM memory leak"

**WEAKEN.** Anthropic fixed this in Ink 7.0 (likely contributed incrementalRendering too — they hit the Yoga issue with Claude Code). Still technically true that silvery has no WASM init/bridge overhead, but no longer a dramatic differentiator.

### "Better responsive layout"

**RETIRE.** Ink 7.0 has useBoxMetrics + useWindowSize + measureElement. Parity.

### "Better focus management"

**RETIRE.** Ink has useFocus + useFocusManager. Parity.

## Real differentiators (still hold)

### 1. Scroll containers with sticky children (STRUCTURAL)

Ink's `overflow` is only `visible | hidden`. No `scroll` option. No sticky children. No virtual scrolling. This is a capability Ink can't easily add — their string-based output model isn't designed for it.

### 2. Cell-level incremental rendering (STRUCTURAL)

Ink's incrementalRendering is post-hoc line-level diffing via log-update. Silvery diffs at the cell level through the full pipeline. Silvery's approach wins on:

- Dense chrome (borders, bg fills) — 3.73x kanban
- Styled rows (ANSI escapes amplify byte diffs)
- Wide rows with localized changes
- Editors, diff viewers, dashboards

Ink's line-level can't catch up without rewriting output to a buffer model.

### 3. Composition model (API)

- Silvery: `pipe(createApp(), withReact(<App/>), withTerminal(), withFocus(), withDomEvents())` — explicit providers
- Ink: `render(<App/>, options)` — monolithic

### 4. State machines (@silvery/headless)

SelectList, Readline as pure TEA machines. Portable, testable, composable. Ink has nothing equivalent.

### 5. Command registry (@silvery/commands)

Unified command system with keymaps, invocation, when-predicates. Ink has nothing equivalent.

### 6. Theme system

Semantic tokens ($primary, $muted, $accent). ThemeProvider, palettes, contrast checking. Ink has basic color strings.

### 7. Pure JS layout

- Smaller bundle (no Yoga WASM)
- No WASM init cost
- No WASM bridge overhead per layout call
- Better for cold-start CLIs and serverless (smaller diff, not structural)

### 8. Debugging infrastructure

- SILVERY_STRICT mode (incremental vs fresh verification)
- SILVERY_INSTRUMENT stats
- Multiple strict terminal backends (vt100, xterm, ghostty)
- Cell-level debugging with SILVERY_CELL_DEBUG
- Ink has DEBUG=ink:*

## What Ink is NOT gaining

Based on Ink 7.0 analysis:

- Scroll containers (requires architectural change)
- Sticky children
- Cell-level diffing (string-based output can't)
- Virtual scrolling
- Silvery's composition model (by design — they value simplicity)

## New elevator pitch

**One-liner:** "Silvery is the React TUI framework for full-screen interactive apps. Ink is for CLIs."

**30-second pitch:**
"Ink is great for command-line tools with linear output. Silvery is built for full-screen interactive apps — kanban boards, dashboards, editors, dev tools. You get scroll containers with sticky children, cell-level incremental rendering that's 3.7x faster on dense layouts, state machines you can test without a terminal, and a composable provider model. Pure JS, no Yoga WASM. If your app has more than a few screens of output, use silvery."

**Tagline options:**

- "React for terminal apps, not just CLIs"
- "Silvery: when grep isn't enough"
- "Built for dashboards, not scripts"
- "Scroll, sticky, fast — silvery"

## Doc updates needed

1. **vendor/silvery/docs/guide/silvery-vs-ink.md** — complete rewrite
- Remove "100x" claim everywhere
- Show honest bench numbers with methodology
- Lead with use-case differentiation (CLI vs app)
- Acknowledge where Ink is better (smaller, simpler, more mature)
- Link to reproducible bench
14. **vendor/silvery/docs/index.md** — homepage hero
- New tagline
- Real numbers instead of inflated claims
21. **vendor/silvery/README.md** — npm page
- Same hero + new feature bullets
26. **vendor/silvery/docs/guide/why-silvery.md** — refocus on use case, not speed
27. **vendor/internal/silvery/launch/positioning-2026.md** — internal strategy doc (create new)
28. **vendor/silvery/docs/getting-started/migrate-from-ink.md** — add "when to migrate" section (when your CLI grows into an app)

## When to rewrite

Wait for:

- Tier 1 perf fixes to land (Phase 7a, renderer reuse, doRender overhead)
- Fresh bench numbers on a clean machine
- 5 AM nightly bench establishes baseline

Then update all docs in one coordinated pass.

