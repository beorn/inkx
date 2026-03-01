---
description: Shared test-first protocol referenced by all skills
---

# Test-First Protocol

Every bug fix, feature, and refactor follows this protocol:

1. **Write a failing test FIRST** — before any fix/implementation code
2. **Verify it fails for the right reason** — the test must demonstrate the actual bug/missing feature
3. **Implement the minimal change** — fix only what's broken, no extras
4. **Verify the test passes** — run `bun run test:fast`
5. **Run full suite** — `bun run test:fast` must stay green (no regressions)

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
| Status bar | `status-bar.test.ts` | Bottom bar content |
| Indent/outdent | `indent-outdent.slow.test.ts` | Tab/Shift+Tab indentation |
| Alignment | `alignment.test.ts` | Column alignment, body alignment |

**If your bug doesn't fit any domain above**, check if it relates to an existing file's theme. If truly novel, create a new thematic file that can accumulate related tests over time.
