# Silvery Positioning Strategy — 2026

**Internal document. Do not publish.**

Tracks silvery's competitive position vs Ink, honest performance narrative, and messaging strategy per horizon. Updated as bench numbers change.

## Core positioning

**"Silvery: React for modern terminal apps."**

**Modern** = broader terminal feature support. Silvery leverages what modern terminals can do: scroll containers with sticky headers, cell-level incremental rendering, inline rects for text hit testing, multi-backend architecture (node, xterm.js, headless), Kitty keyboard protocol, true color themes with contrast checking, STRICT verification across terminal backends (vt100, xterm, ghostty). Ink targets the lowest common denominator (string-based output, line-level diffing).

**Apps** = composable architecture that real applications need. `pipe(createApp(), withReact(), withTerminal(), withFocus(), withDomEvents())` — each capability is a provider, not a monolithic `render()` option. Headless state machines (SelectList, Readline) testable without a terminal. Command registry with keymaps and when-predicates. Focus scopes for modals/dialogs. Theme system with semantic tokens. The architecture scales from a progress bar to a kanban board to an editor.

Ink is the established standard — largest community, most packages, well-known maintainers (Vadim Demedes, Sindre Sorhus). It defined how people think about React for terminals. Silvery is a fresh take on the same idea, built on a modern architecture. You don't switch because Ink broke — you switch because silvery is nicer to work with and faster out of the box.

99% Ink-compatible. 2.5-5.2x faster. Drop-in migration.

Don't diminish Ink. Acknowledge it as the category creator and position silvery as the natural next step. Lead with compatibility (99% Ink tests pass), follow with capabilities (what you gain), close with performance (the numbers).

## The architectural differentiator

Silvery's performance advantage isn't just optimization—it's architectural. While Ink treats the terminal as a string stream, Silvery maintains a **cell-level buffer** coupled with a **layout-first rendering pipeline**. This enables a capability neither Ink nor Claude Code's forked Ink had available out of the box:

**Four-step dependency chain:**

1. **Cell-level buffer** — 2D grid representation (char + fg/bg + attrs)
2. **Layout-first pipeline** — measure → layout runs BEFORE content render (not after), enabling components to know dimensions via `useBoxRect()` during render phase
3. **Cell-level diff** — compare previous vs current buffer at cell granularity, not line
4. **Relative cursor addressing** — emit only changed cells using CSI cursor positioning (NA/NB/CR/NC), not reprinting full lines

The result: **28-192x less output than full redraw** when updating inline scrollback, enabling interactive apps with actual scrollback history (not just frozen `<Static>` content).

**Why Ink doesn't have this out-of-the-box:** String-based output architecture doesn't naturally support cell-level diffing or relative cursor positioning. Ink's design trades flexibility for simplicity.

**Claude Code's proof:** The team forked Ink in October 2025, spent 6 months building this exact architecture (custom cell-level buffer + diff engine), shipped NO_FLICKER alt-screen mode in March 2026, and immediately hit regressions (#41965 — 1000+ upvotes) in April 2026 when trying to keep scrollback in inline mode. This validates that retrofitting incremental rendering into Ink-style architecture is **possible but non-trivial** (6 months, observable regressions).

## The honest numbers (2026-04-09 evening, post all fixes + STRICT env bug fix)

**Silvery wins ALL 16 benchmark scenarios vs Ink 7.0.**

Note: A critical bug was found and fixed — `isStrictOutput()` treated the string `"0"` as truthy, so `SILVERY_STRICT=0` didn't actually disable STRICT mode. All bench runs before the fix had silvery paying full O(cells) verification overhead on every iteration. The numbers below are post-fix.

### Canonical numbers — what users actually experience (mounted apps)

Both frameworks keep a mounted app and call `rerender()`. This is the fairest and most realistic comparison.

| Scenario                            | Silvery advantage |
| ----------------------------------- | ----------------- |
| Mounted cursor move 100-item        | **2.56x**         |
| Mounted kanban single text change   | **3.36x**         |
| Memo'd 100-item single toggle       | **4.59x**         |
| Memo'd 500-item single toggle       | **5.15x**         |
| Memo'd kanban 5x20 single card edit | **3.75x**         |

Lead with these publicly. They measure the hot path (user interactions → selective rerenders).

### Cold render (createRenderer reuse)

Silvery's `createRenderer` reuses the React fiber tree via `rerender()` on subsequent calls. Ink's `renderToString` creates a fresh tree each time. Not apples-to-apples, but reflects real test-author experience.

| Scenario               | Silvery advantage |
| ---------------------- | ----------------- |
| Flat list 10 (80x24)   | **3.37x**         |
| Flat list 100 (80x24)  | **3.53x**         |
| Flat list 100 (200x60) | **4.56x**         |
| Styled list 100        | **3.76x**         |
| Kanban 5x10            | **3.99x**         |
| Kanban 5x20 (200x60)   | **4.77x**         |
| Deep tree 20           | **2.59x**         |
| Deep tree 50           | **2.73x**         |

### Incremental re-render (silvery dirty tracking vs Ink renderToString)

| Scenario                  | Silvery advantage |
| ------------------------- | ----------------- |
| Cursor move 100-item      | **3.02x**         |
| Cursor move 1000-item     | **2.86x**         |
| Kanban single text change | **4.30x**         |

## Head-to-head: Silvery vs Ink 7.0

### Performance (mounted apps — what users experience)

| Scenario                  | Silvery | Ink 7.0 | Winner            |
| ------------------------- | ------- | ------- | ----------------- |
| Cursor move 100-item list | 0.9ms   | 2.3ms   | **Silvery 2.56x** |
| Kanban single text change | 1.0ms   | 3.4ms   | **Silvery 3.36x** |
| Memo'd 100-item toggle    | 1.2ms   | 5.5ms   | **Silvery 4.59x** |
| Memo'd 500-item toggle    | 12ms    | 61ms    | **Silvery 5.15x** |
| Memo'd kanban card edit   | 1.5ms   | 5.5ms   | **Silvery 3.75x** |

### Features — both have

| Feature                    | Silvery                | Ink 7.0             | Notes                                                   |
| -------------------------- | ---------------------- | ------------------- | ------------------------------------------------------- |
| React reconciler           | Yes                    | Yes                 | Same `react-reconciler`                                 |
| Flexbox layout             | Flexily (pure JS)      | Yoga (WASM)         | Both complete; flexily = no WASM init                   |
| useBoxMetrics              | Yes                    | Yes                 | Silvery also has useBoxRect/useScreenRect/usescreenRect |
| useFocus + useFocusManager | Yes                    | Yes                 | Silvery adds: focus scopes, focus origin, isActive      |
| useAnimation               | Yes                    | Yes                 | Silvery adds: pause/resume                              |
| useInput (keyboard)        | Yes                    | Yes                 |                                                         |
| useWindowSize              | Yes (useWindowSize)    | Yes (useStdout)     |                                                         |
| Alternate screen           | Yes                    | Yes                 |                                                         |
| Inline mode                | Yes (incremental)      | Yes (full redraw)   | See below                                               |
| Static/scrollback output   | ScrollbackView         | `<Static>`          |                                                         |
| Kitty keyboard protocol    | Yes                    | Yes (Ink 7.0)       |                                                         |
| incrementalRendering       | Always on (cell-level) | Opt-in (line-level) | Architectural difference                                |
| Ink compat layer           | Yes (99.0% pass rate)  | N/A                 | 871/931 Ink tests pass on silvery                       |

### Features — silvery only (Ink structurally can't)

| Feature                                 | Silvery                                                                                    | Ink                                         | Why Ink can't                                   | Moat   |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------- | ------ |
| **Scroll containers** (overflow:scroll) | Yes — viewport clipping, scroll offset, virtual scrolling                                  | No (visible/hidden only)                    | String-based output has no viewport model       | HIGH   |
| **Sticky children** (position:sticky)   | Yes — sticky headers in scroll containers + non-scroll parents                             | No                                          | Requires scroll container model                 | HIGH   |
| **Cell-level incremental rendering**    | Yes — per-cell dirty tracking, cursor-positioned output                                    | Line-level (log-update)                     | String output can't address individual cells    | HIGH   |
| **Inline incremental rendering**        | Yes — 28-192x less output than full redraw                                                 | No — full redraw every frame in inline mode | Requires buffer model for inline diffing        | HIGH   |
| **Inline rects (text hit testing)**     | Yes — nested `<Text>` children mapped to screen coordinates                                | No                                          | Position info lost after string render          | HIGH   |
| **useScreenRect / usescreenRect**       | Yes — scroll-aware + sticky-aware layout rects                                             | No                                          | No scroll/sticky model to derive from           | HIGH   |
| **Composable pipe() providers**         | `pipe(createApp(), withReact(), withTerminal(), withFocus())`                              | Monolithic `render(el, options)`            | Design philosophy — simplicity over composition | HIGH   |
| **Multi-backend architecture**          | Node.js, xterm.js, headless, termless                                                      | Node.js only                                | Would need to abstract output layer             | MEDIUM |
| **STRICT verification system**          | Cell-by-cell incremental vs fresh diff, ANSI verification via vt100/xterm/ghostty backends | `DEBUG=ink:*` logging only                  | Requires buffer model for cell comparison       | MEDIUM |
| **Cell-level debugging**                | `SILVERY_CELL_DEBUG=col,row` traces one cell through pipeline                              | Nothing equivalent                          | Requires buffer model                           | MEDIUM |
| **Pure JS layout (flexily)**            | No WASM, no native deps, ~2KB                                                              | Yoga WASM (~45KB)                           | Yoga is WASM by design                          | MEDIUM |
| **Headless state machines**             | SelectList, Readline as pure TEA machines, testable without terminal                       | Nothing                                     | Could build; hasn't                             | MEDIUM |
| **Theme system**                        | Semantic tokens ($primary, $muted), 84 color schemes, contrast checking                         | Basic chalk colors                          | Could build; hasn't                             | LOW    |
| **Command registry**                    | Unified keymaps, when-predicates, discoverable actions                                     | Nothing                                     | Could add as package                            | LOW    |
| **Focus scopes**                        | Nested focus scopes for modals/dialogs via withFocus()                                     | Flat focus list                             | Could add; non-trivial                          | MEDIUM |
| **Focus origin tracking**               | Know if focus came from keyboard/mouse/programmatic                                        | No                                          | Could add; hasn't                               | LOW    |
| **Mouse drag + DnD**                    | DragFeature in withDomEvents()                                                             | Click only                                  | Could add; hasn't                               | LOW    |

### Features — Ink only

| Feature                | Ink                                                                                | Silvery                           | Notes                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Larger ecosystem       | Established community (Vadim Demedes, Sindre Sorhus), more packages, more examples | Newer, smaller community          | Silvery's 99% Ink compat layer mitigates this               |
| Simpler API            | `render(<App />)` — one function                                                   | `pipe()` composition — more setup | Silvery trades simplicity for extensibility                 |
| More documentation     | Extensive README, many examples                                                    | Growing docs site                 |                                                             |
| React Concurrent Mode  | Supported                                                                          | Not yet                           | Low priority — terminal apps don't need Suspense boundaries |
| `waitUntilRenderFlush` | Yes                                                                                | No                                | Could add                                                   |

### Roadmap — will widen the gap

| Feature                     | Horizon | Moat        | Why Ink can't follow                                       |
| --------------------------- | ------- | ----------- | ---------------------------------------------------------- |
| Canvas rendering            | v2.0    | VERY HIGH   | Same React tree → terminal + Canvas2D. Ink is stdout-only. |
| Signals → ag bridge         | v1.5    | HIGH        | Framework-agnostic ag engine. Ink = React-only forever.    |
| Proportional text (Pretext) | v2.0    | VERY HIGH   | Real typography on canvas. Ink = monospace-only.           |
| WebGL/SVG/PDF targets       | v3.0    | VERY HIGH   | Display list → any surface. Ink = stdout forever.          |
| A11y via DOM mirror         | v3.0    | HIGH        | Enterprise requirement. Terminal-only frameworks can't.    |
| AI agent mode               | v3.0    | MEDIUM-HIGH | Commands + headless machines = agent-drivable apps.        |

## Proof point: Claude Code (Oct 2025 – Apr 2026)

Claude Code's rendering journey validates Silvery's architectural choices:

| Phase        | What                                                                                                 | Duration | Outcome                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| **Oct 2025** | Forked Ink to build custom cell-level buffer + diff renderer                                         | —        | Recognized string-based architecture limits                                         |
| **Mar 2026** | Shipped NO_FLICKER mode (alternate screen buffer)                                                    | 6 months | Eliminated flicker by abandoning inline mode                                        |
| **Mar 2026** | Had to reimplement: Cmd+F, text selection, scrollback, clipboard, URL clicking, paste buffer support | Measured | Realized alt-screen has its own costs                                               |
| **Apr 2026** | Released v2.1.89 with inline scrollback attempt                                                      | 1 month  | Hit regressions (#41965 — 1000+ votes). Screen fills with blanks. Flicker persists. |

**Lesson:** Retrofitting incremental rendering + scrollback support into Ink's string-based architecture is **possible but expensive**. Claude Code's fork proves the idea works; the 6-month timeline and visible regressions in v2.1.89 prove it's non-trivial.

**Silvery's advantage:** This architecture existed from day 1 (via Flexily's layout-first pipeline + ag-term's cell buffer). No fork, no 6-month retrofit, no flicker regressions.

## Claims to RETIRE

| Old claim                  | Why retire                                | Replacement                                                             |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| "100x faster updates"      | Methodology was cold-init vs warm-update  | "2.5-5.2x faster on real-world interactive workloads"                   |
| "No Yoga WASM memory leak" | Anthropic fixed in Ink 7.0                | "No WASM init cost, no bridge overhead, 2.5x smaller"                   |
| "Better responsive layout" | Ink 7.0 has useBoxMetrics + useWindowSize | "Richer: useScreenRect (scroll-aware), usescreenRect (sticky-aware)"    |
| "Better focus management"  | Ink 7.0 has useFocus + useFocusManager    | "Focus scopes, focus origin tracking, isActive — superset of Ink's API" |

## Messaging per horizon

### v1.0 (shipping now)

> React TUI for full-screen interactive apps. Scroll containers, cell-level incremental rendering, composable providers. Pure JS, no Yoga WASM.

### v1.5 (tea)

> The TUI framework that's also an app architecture. Commands, state machines, signals — portable to web.

### v2.0 (canvas)

> The React rendering engine. One component tree, many surfaces: terminal, canvas, SVG.

### v3.0 (graphics)

> Build Google Docs-class apps with React. Terminal, canvas, PDF, a11y mirror — all from one codebase.

## What to lead with (by audience)

| Audience                          | Lead with                                                             | Follow with                             |
| --------------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| Ink user considering migration    | "When your CLI grows into an app" + `useFocus`/`useBoxMetrics` compat | 3.7x kanban, scroll containers          |
| Claude Code user (forked Ink)     | "We have the architecture you built in 6 months, ready day 1"         | Scroll containers, inline incremental   |
| New TUI developer                 | "React for terminal apps" + pipe() simplicity                         | Theme system, focus management          |
| React developer curious about TUI | "It's React — same hooks, same patterns"                              | createRenderer for testing, STRICT mode |
| Framework author                  | ag engine + flexily standalone                                        | Multi-surface roadmap                   |

## Honest narrative principles

1. Lead with absolute gaps (ms), not ratios (%)
2. Show where Ink wins too (simpler API, more docs, larger ecosystem)
3. Never claim 100x without methodology caveat
4. Use real-world scenarios (kanban, dashboard) not synthetic ones (deep trees)
5. Differentiate by use case, not speed
6. Acknowledge Ink's maturity advantage (more users, more examples, established maintainers)

## Doc update coordination

Public docs will be updated in a coordinated pass AFTER:

1. ~~Tier 1 perf fixes verified on clean machine~~ ✅ (done 2026-04-09)
2. ~~Fresh bench run with useState scenarios~~ ✅ (done — silvery 4.6-5.2x on memo'd patterns)
3. ~~STRICT env bug fix~~ ✅ (isStrictOutput treated "0" as truthy — all previous numbers wrong)
4. ~~Bench methodology verified~~ ✅ (cold renders use createRenderer reuse = warm path; mounted section is fair and canonical)
5. User reviews and approves narrative → **READY for user review**

Files to update:

- `vendor/silvery/docs/guide/silvery-vs-ink.md` — complete rewrite
- `vendor/silvery/docs/index.md` — homepage hero
- `vendor/silvery/README.md` — npm page
- `vendor/silvery/docs/guide/why-silvery.md` — refocus on use case
- `vendor/silvery/docs/getting-started/migrate-from-ink.md` — "when to migrate" section

## Performance optimization roadmap (prioritized by estimated impact)

Current: silvery wins 2.5-5.2x across all 16 scenarios. Architecture is O(tree) per frame — room to reach O(changed).

### Completed (Tier 1) — landed 2026-04-09

| Fix                        | Impact (measured)                          | Effort  | Bead                                   |
| -------------------------- | ------------------------------------------ | ------- | -------------------------------------- |
| flexily Phase 7a dead work | Deep tree 50: 2.82x gap → 1.61x            | 1 day   | km-flexily.phase7a-dead-work ✅        |
| doRender flag hoisting     | ~10μs/frame saved                          | 2 hours | km-silvery.dorender-overhead ✅        |
| createRenderer reuse       | Cold renders: Ink 1.18x → **Silvery 3.5x** | 4 hours | km-silvery.renderer-reuse ✅           |
| STRICT env bug fix         | ALL bench numbers: 24-32x correction       | 2 hours | km-silvery.memo-pipeline-regression ✅ |

### Priority 1 — high impact, moderate effort

| #   | Optimization                       | Expected impact                                                                            | Effort    | Bead                                                 | Rationale                                                                            |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | **Dirty node SET + long-lived Ag** | Mounted: 2.56x → 5-15x on large trees. Content phase visits N dirty nodes not N total.     | ~3-4 days | km-silvery.dirty-node-set + km-silvery.long-lived-ag | Cheapest architectural win. Prerequisite for everything below. No API change.        |
| 2   | **Hybrid output emission**         | Cold dense rows: +15-30%. Whole-row emit when >50% dirty, run-length for contiguous spans. | ~3-5 days | km-silvery.hybrid-output                             | Design + scaffold done. Closes remaining output-phase inefficiency on dense updates. |
| 3   | **Collapse propsEqual**            | commitUpdate: 3 passes → 1 pass. ~5μs/node saved.                                          | ~1 day    | (create bead)                                        | Small per-node savings compound on 500+ node trees.                                  |

### Priority 2 — high impact, larger effort

| #   | Optimization                    | Expected impact                                                                                   | Effort  | Bead                       | Rationale                                                                                                              |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------- | ------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 4   | **Style-only fast path**        | Cursor move: 2.56x → 10-50x. Bypasses React reconciler + layout for style-only changes.           | ~3 days | km-silvery.style-fast-path | 90% of user interactions are style-only (cursor, selection, hover). Dramatic improvement on the most common operation. |
| 5   | **Skip unused pipeline phases** | ~10-20% for apps without sticky/scroll. Detect feature usage at first render, skip unused phases. | ~2 days | (create bead)              | Most apps don't use all 7 phases. Free speedup for simple apps.                                                        |

### Priority 3 — strategic, longer-term (no new APIs except one React hook)

| #   | Optimization                                  | Expected impact                                                                                     | Effort            | Bead                         | Rationale                                                                                                                                                                                |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | **useSignalProps (React hot-path bypass)**    | Hot-path updates: 5x → 20-50x. Alien-signals bypass React for prop updates within React components. | ~1-2 weeks        | km-silvery.signals-ag-bridge | One new React hook. Preact Signals precedent. Keeps React for structure, signals for hot-path state.                                                                                     |
| 7   | **@silvery/solid (SolidJS rendering target)** | Everything: 5x → 50-100x. No React overhead at all. Standard Solid JSX — no new API.                | ~1-2 weeks        | km-silvery.signals-ag-bridge | THE framework-agnostic differentiator vs Ink. Users write standard SolidJS, we provide the ag rendering target. Solid's compiler handles reactivity. Enables canvas v2.0, AI agent mode. |
| 8   | **Reactive pipeline phases**                  | Auto-skip unused phases + partial phase execution. Subsumes #5 (boolean flags).                     | included in #6/#7 | km-silvery.signals-ag-bridge | Pipeline phases become computed signals — no manual feature detection needed. Signal graph IS the optimization.                                                                          |
| 9   | **Specialize renderToString**                 | One-shot renders: ~20-30% faster. Skip cursor diffing, live-terminal logic.                         | ~2-3 days         | (create bead)                | Only matters for testing/SSR, not interactive apps. Low priority.                                                                                                                        |

**CAVEAT on #6 and #7**: These use existing APIs (Preact Signals pattern for #6, standard SolidJS for #7). We do NOT build a custom silvery reactive framework. The only silvery-specific surface is: one React hook (useSignalProps) and one Solid rendering target package (@silvery/solid ~500-1000 lines). @silvery/svelte, @silvery/vue follow the same pattern later.

### Priority 4 — diminishing returns

| #   | Optimization                         | Expected impact                                               | Effort     | Bead          | Rationale                                                                      |
| --- | ------------------------------------ | ------------------------------------------------------------- | ---------- | ------------- | ------------------------------------------------------------------------------ |
| 9   | flexily single-child chain fast path | Deep tree: 1.61x gap → ~1.2x. Iterative instead of recursive. | ~2-3 days  | (create bead) | Phase 7a already closed the worst case. Real apps rarely have 50-level chains. |
| 10  | WASM content render                  | Raw cell iteration: 2-3x.                                     | ~1-2 weeks | —             | Contradicts "no WASM" positioning. Not recommended.                            |

### Impact projection

If we shipped P1+P2 (items 1-5), estimated canonical numbers:

| Scenario                     | Current | After P1+P2                                  | Improvement |
| ---------------------------- | ------- | -------------------------------------------- | ----------- |
| Mounted cursor move 100      | 2.56x   | **10-25x** (dirty set + style fast path)     | 4-10x       |
| Mounted kanban single change | 3.36x   | **8-15x** (dirty set + hybrid output)        | 2.5-4.5x    |
| Memo'd 100-item toggle       | 4.59x   | **15-30x** (dirty set + style fast path)     | 3-7x        |
| Memo'd 500-item toggle       | 5.15x   | **25-50x** (dirty set scales with tree size) | 5-10x       |

These are estimates based on the O(tree) → O(changed) architectural shift. The bigger the tree and the smaller the change, the larger the improvement. Real numbers will vary.

### Why this matters for positioning

- P1 items keep React users happy (faster without changing their code)
- P2 items make the most common interaction (cursor move) near-instantaneous
- P3 #6 (useSignalProps) keeps React users happy AND gives 20-50x hot-path improvement — one hook, no migration
- P3 #7 (@silvery/solid) is the framework-agnostic moat — Ink is React-only forever, silvery supports React + Solid (+ Svelte/Vue later)
- P3 #7 enables v2.0 canvas target (canvas apps shouldn't pay React overhead)
- P3 #7 enables AI agent control (Solid's signals are more natural for programmatic driving than React state)
- P3 #8 (reactive pipeline) is free once #6/#7 land — the signal graph auto-skips unused pipeline phases
