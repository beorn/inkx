---
id: "@km/vendor/deep-dive"
aliases:
  - km-vendor.deep-dive
  - km-vendor-deep-dive
created_at: 2026-03-04T08:30:00Z
closed_at: 2026-03-04T12:44:42Z
---

# [x] Vendor packages deep dive: improvement recommendations @km/vendor #epic #P3

Comprehensive analysis of all vendor packages with concrete improvement suggestions, ranked by impact.

## chalkx — Terminal Primitives

### HIGH
1. **Duplicate stripAnsi** — term.ts has local copy identical to utils.ts. Import instead.
2. **detectTerminalCaps() ignores custom streams** — uses process.stdout directly, can't test with mocks.
3. **Color detection redundancy** — detectColor() and detectTerminalCaps() detect color level independently with different null representations.
4. **Ghostty casing mismatch** — checks "ghostty" (lowercase) in one place, "Ghostty" (capitalized) in others.
5. **Zero test coverage** for detectColor(), detectTerminalCaps(), patchConsole().

### LOW
6. Stale StyleOptions type references removed .style() method.
7. Roadmap features (images, clipboard, notifications) overlap with inkx.

---

## inkx — Core Framework

### HIGH
1. **200+ exports from index.ts** — canvas/DOM adapters, image encoders, device queries all in one barrel. Needs sub-path exports.
2. **Border text overflow bug** — text bleeds into right border of Box. Worked around with paddingRight={1}.
3. **Sixel encoder is placeholder** — TODO: "Full Sixel encoding with proper color quantization, dithering."

### MEDIUM
4. Synchronized output disabled due to Ghostty bug — no auto-detection of fix version.
5. useInput exported from both inkx and inkx/runtime — confusing canonical path.
6. Missing CHANGELOG.md.
7. React 18 support claimed but only React 19 tested in CI.

---

## inkx-ui — Component Library

### CRITICAL
1. **React components render <span>/<div> HTML, NOT <Box>/<Text>** — cannot work in terminal. No dependency on inkx at all.

### RECOMMENDED ACTION
Merge CLI/wrapper functionality (withSpinner, steps(), multi-progress) into inkx/cli entry point. Deprecate React components (inkx already has proper terminal versions). Make CLI components use chalkx Term instead of raw chalk.

### OTHER
2. ANSI utilities duplicate chalkx functionality.
3. task()/tasks() deprecated but prominently exported.
4. CLAUDE.md documents wrong withCursor API signature.
5. Package still called "progressx" in data attributes.

---

## themex — Theming System

### HIGH
1. **ALL docs reference old ThemePalette (14 colors, 19 tokens)** — code has ColorPalette (22 colors, 33 tokens). Every doc page is wrong.
2. **Three isDarkColor() implementations** — generators.ts, builder.ts (simple average), detect.ts (WCAG). Consolidate to single WCAG impl in color.ts.
3. **generateTheme() puts ANSI names in hex-typed fields** — Theme fields document #RRGGBB but contain "yellow", "blueBright", "". Type-level lie.
4. **deriveTheme() hardcodes primary=yellow/blue** — no override. Old API had accent option.

### MEDIUM
5. Zero test coverage for state.ts, detect.ts, generate.ts, validate.ts edge cases.
6. Theme interface lacks dark boolean — consumers keep separate isDark flag.
7. getThemeByName() silently falls back to ansi16DarkTheme for unknown names.
8. Docs claim OKLCH but code uses HSL and linear RGB.
9. screenshot.ts hardcodes /Users/beorn/Code/pim/km.
10. Dead migration helper themePaletteToColorPalette().

---

## flexx — Layout Engine

### HIGH
1. **Leaf-node fingerprint never updated** — Phase 4 early-returns skip fingerprint update, leaves never get cache hits. Potentially large incremental perf win.
2. **API docs list methods that don't exist** — getComputedRight(), getComputedBottom(), getComputedPadding(edge), freeRecursive(). Trivial to implement, completes Yoga parity.
3. **testing and trace not in package.json exports** — @beorn/flexx/testing may fail to import.
4. **markDirty() defeats zero-allocation** — sets cache entries to undefined creating garbage. Should invalidate in-place.
5. **resetLayoutCache() walks entire tree** at start of every layout pass O(n). Generation counter would eliminate this.

### MEDIUM
6. setEdgeValue allocates new Value object on every call. Should mutate existing.
7. Top-level await in logger.ts makes import async.
8. Date.now() called unconditionally in calculateLayout() even when logging disabled.
9. Fuzz tests excluded from vitest config (include pattern misses .fuzz.ts).
10. Missing CSS order property — documented gap, small implementation.

---

## logger — Structured Logging

### HIGH
1. **Span collection is dead code** — startCollecting()/stopCollecting()/getCollectedSpans() exported but writeSpan() never pushes to collectedSpans. Always returns empty.
2. **ConditionalLogger.logger() returns Logger not ConditionalLogger** — children lose zero-overhead ?.  typing.
3. **No built-in file logging** — DEBUG_LOG pattern reimplemented in 248-line @km/_orphan/cli/debug-log.ts. Add enableFileLog(path).

### MEDIUM
4. createConditionalLogger referenced in docs/changelog but doesn't exist.
5. Proxy only wraps top-level, not children — .logger("child") has no Proxy.
6. debug npm package still used in parallel — complete migration.
7. No isEnabled(level) method.
8. Output mode inconsistency — writers-only doesn't suppress spans.
9. No tests for addWriter/writer system.
10. Span timing uses Date.now() (integer ms) — sub-ms shows (0ms). Use performance.now().
11. Three vendor packages maintain separate beorn-logger.d.ts shims.
12. .child() deprecated but still exported — no callers.

---

## termless — Headless Terminal Testing

### HIGH
1. **Duplicated key-mapping.ts and key-encoding.ts** — same ANSI tables twice. Consolidate.
2. **ANSI 256-color palette duplicated** in xtermjs and vt100 backends. Extract shared palette.ts.
3. **xterm.js uses private API** (_core._writeBuffer.writeSync) — fragile.
4. **Cursor visibility/style hardcoded** in all backends — matchers unreliable.
5. **Ghostty backend no title tracking** — getTitle() always "".

### MEDIUM
6. @termless/core is confusing indirection — just re-exports from root.
7. waitFor() only supports exact string — needs regex and predicate.
8. Snapshot matchers broken — never invoke vitest's snapshot comparison.
9. Ghostty backend calls t.update() on every read method — redundant.
10. Alacritty/WezTerm are stubs — README claims 6 backends, only 4 work.
11. No MCP server tests.
12. Peekaboo macOS-only — not documented.

---

## Cross-Ecosystem Themes

| Pattern | Where | Action |
|---------|-------|--------|
| Duplicate stripAnsi | chalkx (2x), inkx | Single canonical impl |
| Duplicate color palettes | termless xtermjs + vt100 | Shared module |
| Duplicate key encoding | termless (2 files) | Consolidate |
| Duplicate isDarkColor | themex (3x) | Single WCAG impl |
| Stale docs post-migration | themex (all docs), logger | Rewrite |
| Dead/stub code | logger spans, flexx methods, termless backends | Implement or remove |
| Zero test coverage for detection | chalkx, themex | Add tests |
| inkx-ui identity | Broken React, useful CLI | Merge CLI into inkx |