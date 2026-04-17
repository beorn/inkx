# Ink & Chalk Open Issues — Silvery Coverage Analysis

Research date: 2026-03-10. Sources: GitHub Issues API for `vadimdemedes/ink`, `vadimdemedes/ink-ui`, `chalk/chalk`, and chalk ecosystem repos. Issues ranked by reaction count (thumbs-up + other reactions).

## Summary

| Metric                                          | Count |
| ----------------------------------------------- | ----- |
| Ink open issues analyzed                        | 13    |
| Ink popular closed issues analyzed              | 30    |
| Ink-UI open issues analyzed                     | 13    |
| Chalk open issues analyzed                      | 4     |
| Ink open PRs analyzed                           | 8     |
| **Silvery already solves (documented)**         | 9     |
| **Silvery already solves (NOT yet documented)** | 6     |
| **Silvery doesn't solve yet**                   | 3     |
| **Not applicable to Silvery**                   | 8     |

The biggest takeaway: **Ink's top open issues are almost entirely solved by Silvery**, and most are already documented in `silvery-vs-ink.md`. The few undocumented wins represent good opportunities to strengthen the comparison narrative — particularly around IME/cursor positioning, useLayoutEffect timing, animation support, and i18n.

---

## Issues Silvery Solves (Not Yet Documented)

These represent gaps in `silvery-vs-ink.md` and related docs. Each could be added as a row in the compatibility table or a callout in the comparison.

### 1. Ink #773 — useLayoutEffect should execute immediately (4 reactions)

**Problem:** Ink renders a frame _before_ `useLayoutEffect` completes, causing a flash of incorrect content. This is critical for apps like Gemini CLI that measure sizes in `useLayoutEffect` — users see a flicker frame before the measurement-adjusted layout appears.

**Silvery's answer:** Silvery's two-phase rendering (layout first, then render) eliminates this class of bug entirely. Components know their size via `useBoxRect()` during render — no post-render measurement needed, no flicker frame.

**Doc opportunity:** Add to the "Responsive Layout" section or the "Real-World Impact" section of `silvery-vs-ink.md`. This is a strong concrete example of the architectural advantage.

### 2. Ink #870 — useCursor requires component to know its absolute position (0 reactions, but architecturally important)

**Problem:** Ink's new `useCursor` hook requires the component to specify absolute coordinates for cursor placement. This is painful for nested components — a `TextInput` inside a `Box` with borders needs to somehow calculate its absolute position, which may require `measureElement` on parent elements.

**Silvery's answer:** Silvery's cursor management is node-relative. Components set cursor position relative to their own content area; the pipeline translates to absolute screen coordinates automatically. No prop drilling of position, no manual measurement of parent boxes.

**Doc opportunity:** Mention in the "Interaction Model" section. Also relevant to the migration guide, since Ink users building text inputs will hit this.

### 3. Ink PR #872 — Declarative Cursor component (open PR)

**Problem:** Related to #870 — someone is trying to build a `<Cursor>` component for Ink, but the architecture makes it hard because components don't know where they're positioned.

**Silvery's answer:** Silvery already has cursor support built into TextInput/TextArea with automatic position tracking. The terminal cursor follows the focused input component without manual coordinate management.

**Doc opportunity:** Could be mentioned alongside #870 in the comparison.

### 4. Ink #142 — Built-in animation support (1 reaction, open since 2019)

**Problem:** Animation interval handling is easy to get wrong. Multiple components with independent timers create coordination problems. Vadim suggested `useAnimation()` hook or `<Animation>` component back in 2019, never implemented.

**Silvery's answer:** Silvery has `useAnimation()` hook with easing functions and `useAnimatedTransition()` for enter/exit animations. Already listed in the "Developer Experience" table of `silvery-vs-ink.md` but NOT in the compatibility coverage table at the bottom.

**Doc opportunity:** Add to the compatibility coverage table.

### 5. Ink #779 — i18n primitives (0 reactions but thoughtful proposal)

**Problem:** React i18n libraries like `react-i18next` fail in Ink because Ink's reconciler requires all text nodes to have `isInsideText: true` context. The `<Trans>` component generates text nodes that violate this constraint.

**Silvery's answer:** Silvery's text rendering is more flexible — it handles mixed content (text + components) within `<Text>` more naturally through its ANSI-aware compositing layer. Needs verification that `react-i18next` specifically works, but the architecture is more permissive about text node placement.

**Doc opportunity:** If verified working, add as a compatibility note. If not, track as a potential feature.

### 6. Ink #634 — Backspace incorrectly detected as Delete on Linux (5 reactions)

**Problem:** On Linux, pressing Backspace is detected as Delete in Ink's `useInput`. This is a key parsing bug in how Ink interprets terminal escape sequences.

**Silvery's answer:** Silvery has comprehensive key parsing with platform-aware handling. The `@silvery/ag-term` input parser correctly distinguishes Backspace from Delete across platforms. This is implicitly covered by Silvery's Kitty keyboard protocol support and robust key parsing, but not called out explicitly.

**Doc opportunity:** Could be added to the compatibility coverage table (e.g., "Cross-platform key detection").

---

## Issues Silvery Solves (Already Documented)

These are already covered in `silvery-vs-ink.md` or related docs.

### 1. Ink #222 — Scrolling (9 reactions, open since 2019)

The #1 feature request, open for 7 years. Documented extensively in `silvery-vs-ink.md` under "Scrolling" with code comparison. Silvery: `overflow="scroll"` with `scrollTo`. Also referenced in `css-alignment.md`.

### 2. Ink #765 — Support scrolling primitives (9 reactions, 2025)

A more recent, more detailed scrolling request from the Gemini CLI team. Essentially a re-statement of #222 with a concrete proposal. Same Silvery answer: `overflow="scroll"`.

### 3. Ink #759 — CJK/IME input lag and cursor issues (11 reactions, highest-reaction open issue)

Characters drop, cursor position is wrong for CJK input. Already documented in the compatibility coverage table: `ime.test.tsx` tests CJK rendering and ZWJ sequences. Silvery's built-in wcwidth + grapheme splitting handles double-width characters correctly.

### 4. Ink #676 — Multi-line input element (4 reactions)

Feature request for a TextArea. Already documented: `silvery-vs-ink.md` lists TextArea in the Interaction Model table, referencing #676. Also discussed in `textarea-design.md`.

### 5. Ink #660 — Multiline simple text editor (5 reactions)

Same as #676 — requesting a textarea component. Already covered.

### 6. Ink #5 — Provide available terminal space (closed, COMPLETED, but architecturally foundational)

The issue that started it all — open since 2016. Components can't know their size during render. Documented in the opening paragraph of `silvery-vs-ink.md` and in `why-silvery.md`. Silvery's `useBoxRect()` is the direct answer.

### 7. Ink #584 — Text wrapping/truncation broken (closed)

ANSI-aware text truncation issues. Already in the compatibility coverage table.

### 8. Ink #840 — borderDimColor dims child Text components (closed)

ANSI compositing bug where dim color leaks into children. Already in the compatibility coverage table. Silvery's cell-level buffer with proper style stacking prevents this class of bug.

### 9. Ink #359 — Screen flicker when view exceeds terminal height (8 reactions, closed)

Already referenced in `silvery-vs-ink.md` "Real-World Impact" section. Silvery's cell-level dirty tracking + synchronized output (DEC 2026) prevent this.

---

## Issues Silvery Doesn't Solve Yet

### 1. Ink #779 — i18n primitives (0 reactions)

The `react-i18next` `<Trans>` component may or may not work in Silvery. The text node constraint exists in Silvery too (text must be inside `<Text>`). **Needs testing** to determine if Silvery's reconciler is more permissive or if this requires explicit support.

### 2. Ink #741 — word-break CSS property for Text (0 reactions)

Request for `word-break` control (break-all vs break-word vs keep-all). Silvery has `wrap` prop with modes (`wrap`, `truncate`, `truncate-start`, `truncate-middle`) but doesn't have fine-grained `word-break` control matching the CSS spec (`break-all`, `keep-all`, `break-word`). Could be a minor enhancement.

### 3. Ink #251 / Ink-UI #7 — Blinking cursor / cursor visibility control (0 reactions)

While Silvery supports cursor positioning and styles (block/underline/bar via DECSCUSR), explicit control over cursor blink rate or a high-level `<Cursor>` component that auto-positions isn't exposed as a standalone feature. TextInput/TextArea handle this internally, but standalone cursor control for custom components could be more ergonomic.

---

## Not Applicable to Silvery

### Ink #834 — Remove create-ink-app from README (9 reactions)

Ink-specific tooling issue. `create-ink-app` is broken on recent Node.js. Not relevant to Silvery.

### Ink #688 — React 19 support (46 reactions, closed)

Ink needed to update its reconciler for React 19. Silvery was built on React 19 from the start.

### Ink #250 — Deno support (19 reactions, closed NOT_PLANNED)

Ink won't support Deno. Silvery targets Bun and Node.js. Deno support is not currently a priority but is architecturally feasible (pure TypeScript, no native deps).

### Ink #263 — Full-screen applications (24 reactions, closed)

Ink added alternate screen support. Silvery has had this from the start.

### Ink #809 — Screen scroll and flicker (13 reactions, closed)

Fixed in Ink v6.5+. Silvery's architecture prevents this by design.

### Ink #650 — "react-devtools-core" is not found (6 reactions, closed NOT_PLANNED)

Ink bundles react-devtools-core as optional dependency, causing confusion with Bun. Not applicable to Silvery.

### Ink #159 — HMR (4 reactions, closed NOT_PLANNED)

Hot module reloading. Both frameworks can use watch mode from bundlers. Not an Ink/Silvery core concern.

### Ink #21 — Subtree rendering (4 reactions, closed NOT_PLANNED)

Ink chose not to implement dirty subtree rendering. Silvery has per-node dirty tracking — this is already documented as a core architectural advantage.

---

## Ink-UI Issues (Silvery Coverage)

`ink-ui` is Vadim's official component library for Ink. Its issues reveal pain points that Silvery's built-in `@silvery/ag-react/ui` already addresses.

| #   | Title                                     | Reactions | Silvery Status                                                                          |
| --- | ----------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| #10 | `onNavigate` prop for Select keyboard nav | 2         | **Solved**: `SelectList` has `onChange` + full keyboard nav (j/k/arrows)                |
| #9  | Multiline TextInput support               | 2         | **Solved**: `TextArea` component                                                        |
| #18 | Japanese IME cursor position in TextInput | 1         | **Partially solved**: Better IME handling, but needs verification for all IME scenarios |
| #14 | Support for Ink v6 / React v19            | 1         | **N/A**: Silvery built on React 19                                                      |
| #21 | Visual regression testing                 | 0         | **Solved**: `@silvery/test` with `bufferToHTML()` + Playwright screenshots              |
| #20 | TextInput missing `value` prop            | 0         | **Solved**: Silvery TextInput has controlled mode with `value` prop                     |
| #19 | Box doesn't support backgroundColor       | 0         | **Solved**: Silvery Box supports `backgroundColor`                                      |
| #17 | Select/MultiSelect options not reactive   | 0         | **Solved**: SelectList is fully reactive                                                |
| #13 | Vim keybindings (hjkl) for navigation     | 0         | **Solved**: `SelectList` supports j/k by default                                        |
| #8  | Select search/filter                      | 0         | **Solved**: `SelectList` supports filtering                                             |
| #7  | Blinking cursor for TextInput             | 0         | **Partially solved**: Real terminal cursor when focused                                 |

---

## Chalk Issues

Chalk has very few open issues (4 total) and they are mostly minor. The biggest chalk event was the npm compromise (#656, 80 reactions) which is resolved.

### Open Issues

| #    | Title                                            | Reactions | Silvery Status                                                                                                                                                                                |
| ---- | ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #604 | Squiggly/curly underline support                 | 1         | **Solved**: Silvery's `@silvery/ag-term` supports extended underlines (curly, dotted, dashed) via ISO 8613-6 SGR 58/59. Already documented in terminal protocol table in `silvery-vs-ink.md`. |
| #619 | v4 property override error (prototype pollution) | 0         | **N/A**: Silvery uses its own styling system, not chalk internally                                                                                                                            |
| #669 | 2.7x perf speedup for 2-arg calls                | 0         | **N/A**: Silvery uses interned styles + cached SGR transitions, different perf characteristics                                                                                                |
| #624 | FORCE_COLOR works only as 0 or 3                 | 0         | **Partially solved**: Silvery has its own color level detection. Supports `FORCE_COLOR` but behavior should be verified for levels 1/2                                                        |

### Chalk Ecosystem Open Issues

| Repo            | #   | Title                                                   | Silvery Status                                                                       |
| --------------- | --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| chalk/wrap-ansi | #55 | Replace strip-ansi with `util.stripVTControlCharacters` | **N/A**: Silvery has built-in ANSI-aware text utilities, doesn't depend on wrap-ansi |

### Notable Closed Chalk Issues

| #    | Title                            | Reactions | Relevance                                                                                                               |
| ---- | -------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| #656 | npm compromise (v5.6.1 malware)  | 80        | Silvery has no dependency on chalk packages — pure TypeScript styling eliminates supply chain risk from chalk ecosystem |
| #300 | Roadmap ideas                    | 33        | Historical — chalk's roadmap included many features Silvery built natively (extended underlines, hyperlinks)            |
| #497 | Detect terminal light/dark theme | 2         | **Solved**: Silvery detects terminal background via OSC 4 palette query and adapts theme automatically                  |

---

## Open Ink PRs (Feature Gaps in Progress)

These PRs show what Ink is actively trying to add — features Silvery already has.

| PR # | Title                                             | Reactions | Silvery Status                                                               |
| ---- | ------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| #889 | Fix useLayoutEffect frame flicker                 | 2         | **Solved by architecture**: Two-phase render eliminates the problem entirely |
| #778 | Border background colors for Box                  | 1         | **Solved**: Silvery Box supports `borderBg` / border styling                 |
| #894 | Fix fullscreen flicker with incremental rendering | 0         | **Solved**: Cell-level dirty tracking + synchronized output                  |
| #872 | Declarative Cursor component                      | 0         | **Solved**: TextInput/TextArea have built-in cursor management               |
| #876 | Enhance cursor-IME example                        | 0         | **Solved**: Built-in IME support in TextInput                                |
| #825 | Reuse lastOutput to reduce memory pressure        | 0         | **Solved**: Packed Uint32Array double buffering with constant memory         |

---

## Recommendations

### Add to silvery-vs-ink.md Compatibility Coverage Table

These Ink issues are actively painful for users and Silvery solves them, but they're not in the compatibility table:

1. **useLayoutEffect flicker** — Ink #773, PR #889. Map to: "Layout measurement timing" → Silvery's two-phase pipeline
2. **Cursor position in nested components** — Ink #870, PR #872. Map to: "Nested cursor positioning" → Silvery's node-relative cursor
3. **Animation support** — Ink #142. Map to: "Animation" → `useAnimation()` hook
4. **Cross-platform key detection (Backspace/Delete)** — Ink #634. Map to: "Backspace vs Delete on Linux" → Silvery's platform-aware key parser

### Add to silvery-vs-ink.md Real-World Impact Section

- **Gemini CLI** is now a major Ink consumer experiencing multiple of these pain points (scrolling #765, useLayoutEffect flicker #773, IME #759). This is a high-profile real-world example to reference.

### Potential silvery.dev Marketing Points

1. "Silvery solves the top 5 most-upvoted open Ink issues out of the box"
2. The supply chain story: Silvery is pure TypeScript with zero native dependencies — no chalk/yoga/wrap-ansi supply chain exposure (relevant after chalk #656 compromise)
3. Ink-UI's issues are almost entirely solved by `@silvery/ag-react/ui` — users get a better component library included

### Future Work (Low Priority)

1. Verify `react-i18next` `<Trans>` component works in Silvery
2. Consider adding `word-break` control to Text component
3. Verify `FORCE_COLOR` level 1/2 behavior in Silvery's color detection

---

## Why Switch to Silvery — For Teams Already Using Ink

You're already using React for your terminal UI — that's the hard part. Silvery keeps everything you like about Ink (Box, Text, useInput, hooks, JSX) and fixes the things you've been working around. Here's what changes for the teams hitting real limits.

---

### For Claude Code

Claude Code is one of the most demanding Ink applications in production — a full interactive coding assistant running in the terminal, handling long sessions with large output streams.

**What Silvery fixes:**

1. **Memory growth from Yoga WASM** ([claude-code#4953](https://github.com/anthropics/claude-code/issues/4953)). Yoga's linear memory heap grows but never shrinks. In long sessions, the process balloons. Silvery's default layout engine (Flexily) is pure JavaScript with normal garbage collection — memory stays constant. No WASM heap, no linear memory growth, no mysterious OOM in hour-long sessions.

2. **Scrollback without keeping everything in the React tree.** Claude Code needs completed items (tool results, assistant messages) to scroll into terminal history while the interactive area stays small. Ink requires keeping all items in the render tree. Silvery's `useScrollback` lets items graduate from the interactive area into native terminal scrollback — the render tree stays lean regardless of conversation length.

3. **Flicker-free rendering in tmux/Zellij.** DEC synchronized output (mode 2026) ensures atomic frame updates. No torn frames when the terminal multiplexer is slow to composite.

4. **Per-node dirty tracking for interactive updates.** When the user types a character or moves a cursor, only the changed node re-renders — 169µs vs Ink's 20.7ms full-tree reconciliation. For a tool that's being typed into constantly, that's 100x less work per keystroke.

**Migration effort:** Replace `import { ... } from 'ink'` with `import { ... } from 'silvery'`. Add `await` before `render()`. Add `flexDirection="column"` to any Box that relies on Ink's vertical-stacking default. Most of the app works unchanged.

---

### For Gemini CLI

Gemini CLI is actively hitting multiple Ink limitations that are open issues — scrolling, measurement timing, and CJK input. The team has even contributed patches upstream.

**What Silvery fixes:**

1. **Scrolling** ([ink#765](https://github.com/vadimdemedes/ink/issues/765), [ink#222](https://github.com/vadimdemedes/ink/issues/222)). Ink's most-requested feature, open since 2019. Silvery: `overflow="scroll"` with `scrollTo`. No manual virtualization, no height estimation, no custom scroll logic. The framework handles measurement and clipping.

2. **useLayoutEffect flicker** ([ink#773](https://github.com/vadimdemedes/ink/issues/773), [ink#889](https://github.com/vadimdemedes/ink/pull/889)). Ink renders a frame before `useLayoutEffect` completes, causing a flash of incorrect content. This is architectural — Ink renders first, then measures. Silvery measures first, then renders. Components know their size via `useBoxRect()` during the render pass. No flicker frame, no hasMeasured guard, no two-pass workaround.

3. **CJK/IME input** ([ink#759](https://github.com/vadimdemedes/ink/issues/759), 11 reactions — the highest-reaction open Ink issue). Characters drop, cursor position drifts for CJK input. Silvery has built-in grapheme-aware width calculation, proper IME cursor tracking, and tested CJK rendering paths.

4. **Cursor positioning in nested components** ([ink#870](https://github.com/vadimdemedes/ink/issues/870)). Ink's `useCursor` requires components to know their absolute position — painful for a TextInput inside a bordered Box inside a scroll container. Silvery's cursor is node-relative. Set cursor position within your component's content area; the pipeline translates to screen coordinates automatically.

5. **Memory pressure from output buffering** ([ink#825](https://github.com/vadimdemedes/ink/pull/825)). Silvery uses packed Uint32Array double buffering with constant memory. Cell-level diff means only changed cells generate output bytes.

**Migration effort:** Same as Claude Code — import swap plus `flexDirection` audit. The Gemini CLI team has already been exploring Ink's internals (jacob314's ResizeObserver proposal in #765), so the codebase is well-understood for migration.

---

### For Shopify CLI

Shopify CLI uses Ink for interactive prompts, project scaffolding, and dev server dashboards — a mix of simple prompts and more complex interactive views.

**What Silvery fixes:**

1. **Built-in component library.** Shopify currently assembles UI from `ink-select-input`, `ink-text-input`, `ink-spinner`, `ink-table`, and other third-party packages — each with its own maintainer, release cycle, and React version compatibility. Silvery ships 30+ components (`SelectList`, `TextInput`, `TextArea`, `Spinner`, `Table`, `ProgressBar`, `Tabs`, `ModalDialog`, etc.) in a single coherent package with consistent theming.

2. **Input isolation for complex flows.** Multi-step wizards where a confirmation dialog shouldn't leak keystrokes to the form behind it. Ink's `useInput` is flat — every handler sees every key. Silvery's `InputLayerProvider` isolates input automatically. Open a dialog, and the parent form stops receiving keys. No manual `if (dialogOpen) return` guards.

3. **Theme support.** Shopify has a strong design system. Silvery's `@silvery/theme` provides semantic color tokens (`$primary`, `$success`, `$danger`) with 38 built-in palettes and auto-detection of terminal light/dark mode. Consistent branding across terminal environments without manual chalk color management.

4. **No WASM dependency.** Simpler CI, faster cold starts, no platform-specific binary issues. Pure TypeScript all the way down.

**Migration effort:** Low. Shopify CLI's Ink usage is mostly prompts and simple layouts. The main work is replacing third-party Ink component imports with Silvery equivalents — which are API-similar by design.

---

### For Prisma CLI

Prisma uses Ink for `prisma studio`, migration status, and interactive database operations — situations where layout feedback and scrolling matter.

**What Silvery fixes:**

1. **Components that know their size.** Prisma Studio displays database tables that need to adapt column widths to terminal size. In Ink, this requires measuring after render and re-rendering — a two-pass dance. In Silvery, `useBoxRect()` provides dimensions during render. The table knows its available width immediately and can calculate column proportions in one pass.

2. **Scrollable data views.** Database query results can be hundreds of rows. Ink requires manual virtualization with height estimation. Silvery: `<Box overflow="scroll">` and render everything. Or use `VirtualList` for thousands of rows with zero-cost windowing.

3. **Automatic text truncation.** Long values in database columns need to truncate cleanly at cell boundaries without breaking ANSI styling. Silvery handles this automatically — text clips at Box boundaries with ANSI-aware truncation. No `cli-truncate` dependency, no manual width calculation.

**Migration effort:** Moderate. Prisma's table rendering logic is the main area that benefits, and it can be migrated incrementally — the compat layer lets both frameworks coexist during transition.

---

### For Terraform CDK

Terraform CDK uses Ink for deployment progress, diff views, and resource status — long-running operations with streaming output.

**What Silvery fixes:**

1. **Scrollback for streaming output.** Terraform deployments produce long streams of resource status updates. Keeping all items in the React tree grows memory and slows rendering. Silvery's `useScrollback` lets completed items graduate to native terminal scrollback while the interactive area shows only active resources.

2. **Synchronized output for multiplexer users.** Infrastructure engineers often run Terraform in tmux sessions. Silvery's DEC synchronized output prevents torn frames during rapid status updates.

3. **Per-node dirty tracking.** When one resource's status changes in a list of 200, only that node re-renders. Ink reconciles the entire tree. At 169µs vs 20.7ms, the difference is noticeable during rapid deploy sequences.

**Migration effort:** Low. Terraform CDK's Ink usage is mostly status displays and progress indicators — straightforward layouts that migrate cleanly.

---

### The Migration Story

For all of these teams, the migration path is the same:

```bash
# Step 1: Swap the import
bun remove ink ink-testing-library
bun add silvery

# Step 2: Update imports
# - import { Box, Text, render } from 'ink'
# + import { Box, Text, render } from 'silvery'

# Step 3: Add await to render()
# - const app = render(<App />)
# + const app = await render(<App />)

# Step 4: Audit flexDirection
# Silvery defaults to row (CSS spec), Ink defaults to column.
# Add flexDirection="column" where needed.

# Step 5: Run tests
bun test
```

Most apps work after steps 1-3. Step 4 is the only semantic change. Everything else — `Box`, `Text`, `useInput`, `useApp`, hooks, borders, flexbox — works the same.

After migration, you can incrementally adopt Silvery-only features: `useBoxRect()` to remove width prop drilling, `overflow="scroll"` to remove virtualization code, `InputLayerProvider` to remove manual input guards, `@silvery/theme` for consistent styling. Each improvement is independent — adopt them at your own pace.
