---
description: Shared test-first protocol referenced by all skills
---

# Test-First Protocol

Every bug fix, feature, and refactor follows this protocol:

1. **Value check** — does this test belong at this layer? Does it test what this layer adds? See [test-layers.md](test-layers.md) for the layering philosophy and anti-patterns.
2. **Write a failing test FIRST** — before any fix/implementation code
3. **Verify it fails for the right reason** — the test must demonstrate the actual bug/missing feature
4. **Implement the minimal change** — fix only what's broken, no extras
5. **Verify the test passes** — run `bun run test:fast`
6. **Run full suite** — `bun run test:fast` must stay green (no regressions)

For rendering bugs, use **buffer assertions** (not just state assertions):
- `board.expectNodeColor()`, `board.expectRow()`, `board.screen.cell()` — see [tui.md](tui.md#buffer-assertions)

**Never**: theorize without a test, skip the failing-test step, guess at fixes, or close a bead without a test that specifically targets the issue.

## Where to Put Regression Tests

**Always add to an existing thematic test file first.** Only create a new file if no domain match exists AND the test would seed 5+ related cases.

### Domain → File Mapping (km-tui)

| Domain | File | What goes here |
|--------|------|----------------|
| Body navigation | `body-nav.slow.test.ts` | j/k in body blocks, column-nav with body, body content rendering |
| Fold/collapse | `fold.slow.test.ts` | Fold toggle, fold counts, fold border, fold corruption |
| HR rendering | `hr.test.ts` | HR display, HR editing, HR detection, borderless HR |
| Sticky cursor | `sticky-cursor.test.ts` | StickyX, stickyY, sticky reset, cursor memory |
| Dates | `date.slow.test.ts` | Date badges, priority ordering, due date logic |
| Zoom | `board-zoom.slow.spec.ts` | Zoom in/out, zoom-exit-j, zoom view diff, body-only zoom |
| Board navigation | `board-nav.slow.spec.ts` | h/l column nav, board-level keyboard nav |
| Collapse columns | `collapse.slow.test.ts` | Column collapse, width, multi-column |
| Embeds | `embed.test.ts` | Embed create, display, task status |
| Layout bugs | `layout-bugs.slow.test.ts` | Edge-case layout regressions |
| Card rendering | `card-rendering.slow.test.ts` | Borders, overflow dots, line truncation |
| Cursor colors | `cursor-colors.test.ts` | Selected/cursor color, color overrides |
| Cursor stability | `cursor-stability.slow.spec.ts` | Cursor position after edits, border overflow, lost cursor |
| Inline edit | `inline-edit.slow.spec.ts` | Enter during edit, focus ring, edit mode |
| Scroll | `scroll.test.ts` | Scroll follow, indicators, height equalization, shift-body |
| Search | `search-dialog.slow.test.ts` | Search open/close, scope, results |
| Shift cursor | `shift-cursor.slow.test.ts` | Shift+J/K, boundary, range |
| Undo/redo | `undo-system.test.ts` | Undo cursor restore, duplicate, redo |
| Crash regressions | `crash-regressions.test.ts` | Any crash-type bug (OOB, null ref, etc.) |
| Board structure | `board.test.ts` | Board state, app mount |
| Status bar | `views/board-bottom-bar.test.tsx` | Bottom bar content, view indicators, bell messages, elapsed time |
| Indent/outdent | `indent-outdent.slow.test.ts` | Tab/Shift+Tab indentation |
| Alignment | `alignment.test.ts` | Column alignment, body alignment |
| Breadcrumbs | `breadcrumb.test.ts` | ANSI replay, ghost prefix, zoom breadcrumbs, text bleed |
| Card layout | `card-layout.test.tsx` | Card borders, text overflow, body indicator (···), width sweep, title wrapping, truncation, display bugs (raw IDs, trailing #, query DSL), inline ^refs |
| Column rendering | `column-rendering.test.ts` | Scroll indicators, selected style, title truncation, WIP counts, section card rendering, body block spacing |
| Overflow indicators | `overflow.test.tsx` | Overflow ▲/▼, child counts, indicator positioning |
| Visual rendering | `visual.test.ts` | Visual toolbelt, screen assertions, node colors, card position |
| Edit mode | `input-mode.test.ts` | Input mode derivation, edit mode logic |
| Emoji rendering | `driver.test.tsx` | Emoji navigation, mixed emoji/ASCII, driver-level tests |
| Hide parent sigil | `embed.test.ts` | Redundant parent sigil hiding on embedded links |

**If your bug doesn't fit any domain above**, check if it relates to an existing file's theme. If truly novel, create a new thematic file that can accumulate related tests over time.

## Test Layer Taxonomy

Tests have different import costs depending on what they use. Prefer lower layers — a test for pure cursor logic belongs in Layer 0, not Layer 2.

| Layer | Type | Import Cost | What it tests | Example files |
|---|---|---|---|---|
| 0 | Pure Logic | ~20-50ms | Algorithms, data structures, pure functions | `layout/constrain.test.ts`, `text/inline-parser.test.ts` |
| 0+ | Module imports | ~500-700ms | Functions with framework imports (zustand, etc.) but no inkx | `input-mode.test.ts` |
| 1 | Component Unit | ~200ms | React components with `createRenderer` | `views/node-view.test.tsx` |
| 2 | Integration (testEnv) | ~1.8s | Full board via `testEnv`/`createTestBoard` | `hr.test.ts`, `alignment.test.ts`, `breadcrumb.test.ts` |
| 3 | Acceptance (multi-step) | ~1.8s | Multi-step user journeys, `.slow.` files | `fold.slow.test.ts`, `detail-pane.slow.test.ts` |
| 4 | TTY/Snapshot | ~1.8s | Real terminal emulator, screenshots | `pty-integration.slow.spec.ts` |

**Guidelines:**
- Layer 2+ files share the same ~1.8s import cost (React + inkx + layout engine WASM init)
- Consolidating Layer 2+ files saves ~1.8s per eliminated file (spread across vitest workers)
- Don't merge a Layer 0 test into a Layer 2 file — it makes the light test pay 1.8s overhead
- Larger consolidated test files are expected and desirable for Layer 2+ (see `/code clean` exceptions)
