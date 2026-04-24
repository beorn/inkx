# silvercode test system — design

**Bead**: `km-silvercode.test-system`
**Status**: design → implementation (2026-04-24)
**Author**: claude Opus 4.7 (1M)

## Problem statement (the real one)

User feedback over the past two weeks has landed in the same piecemeal rhythm:

- _"markdown paragraphs are wrapping into the side panel"_
- _"assistant block `●` doesn't align with the tool `⚙`"_
- _"queue editor is two lines tall when it should be one"_
- _"mode row icon `·` rendered but label missing after refactor"_
- _"resume hint regressed after closeAll refactor"_
- _"paragraph clips one char short when the paragraph wraps"_

Every one of these was user-visible **before** it was test-visible. The current `apps/silvercode/tests/` (9 files, 33 tests) catches state-machine regressions (queue batching, permission flow, useDispose) and one overflow invariant — but misses the entire **rendered surface**. The user is the canary, and that's the bug.

**The real problem is not "we need more tests."** It's: _we don't have a feedback loop where "does the frame look correct?" is answered by CI before the user sees it._

## What "proper" means (non-negotiable)

A proper test system for silvercode is one where **these specific regressions cannot slip through to the user**:

1. Wrap regressions — paragraph content rendering at columns ≥ (cols − sidePanelWidth)
2. Icon alignment — `●` / `>` / `◈` / `⚙` drifting to different columns
3. Mode glyph + label — typos, missing labels, wrong colors
4. Padding/margin drift — `paddingX` removed, paragraphs flush against border
5. Side-panel visibility — content pushing it off-screen
6. Queue-editor height — growing unexpectedly when queue has N entries
7. Resume hint — stderr output after alt-screen exit
8. Welcome panel — missing help rows, wrong glyphs
9. Activity indicator — verb rotation, elapsed format, token tail
10. Assistant-markdown regressions — headings, bullets, tight-list spacing

Any change to a component that breaks one of these must **fail in CI before merge**. That's the bar.

## /big reframe — 18 hypotheses

### H1. Golden text-frame snapshots per scenario
Render the whole app at fixed cols×rows through a `ScriptedFakeSession` script; snapshot the terminal frame; fail on drift.
**Cost**: medium setup, cheap per-test. **Coverage**: all visible surface changes.
**Risk**: noise — every legitimate change updates N snapshots.

### H2. Cell-level color assertions
For a few "load-bearing" cells (mode glyph at col X row Y with color $warning), assert exact cell style.
**Cost**: cheap. **Coverage**: glyph/color specifically. **Risk**: brittle on layout shift.

### H3. Layout invariants as universal checks
One assertion per scenario: "no content renders at columns ≥ LEFT_WIDTH". Catches wrap bugs without naming each one.
**Cost**: cheap. **Coverage**: entire class of overflow-at-root regressions.
**Winner** — this is the one that could have caught the "paragraph into side panel" bug.

### H4. Icon-alignment invariant
Before rendering, locate `●`, `>`, `◈`, `⚙`, `·`, `»`, `!` in the frame. Assert all icons that should align (the message-stream family) DO align at the same column.
**Cost**: cheap. **Coverage**: icon drift class. **Winner** — catches every icon-alignment regression at once.

### H5. Component-level matrix tests via createRenderer
Render `<AssistantBlock>`, `<SidePanel>`, `<Welcome>` in isolation at various widths and snapshot.
**Cost**: cheap. **Coverage**: component wrap/render. **Risk**: context-free — misses bugs from interaction with parent.

### H6. Termless scenarios = visual e2e
`createTermless({ cols, rows })` + `await run(<App/>)` + `ScriptedFakeSession` → full ANSI pipeline.
**Cost**: ~100-300ms per test. **Coverage**: everything a user sees.
**Winner** — this is the real e2e. Keep N small (5-8 canonical scenarios).

### H7. Multi-size resize tests
Same scenario at cols=80, cols=120, cols=200 narrow — check overflow guards.
**Cost**: 3x per scenario. **Coverage**: resize regressions.

### H8. "Must-contain-text" contracts
Each scenario asserts required substrings: `expect(text).toContain("Silver Code")`, `expect(text).toContain("ctrl-o")`.
**Cost**: cheap. **Coverage**: accidental deletions. Already partly covered by H1.

### H9. Diff snapshot for markdown
A canonical markdown doc (headings, bullets, code fences, links, tight lists, loose lists, inline bold/italic/code) rendered into a card — snapshot.
**Cost**: cheap. **Coverage**: every markdown-rendering regression.
**Winner** — addresses the "wrap broken" class directly.

### H10. Input simulation (scripted keystrokes)
Bind termless → feed Shift+Tab / Enter / typed text → snapshot each step.
**Cost**: medium. **Coverage**: interactive flows (queue editor, mode cycling).

### H11. Side-by-side matcher (before/after)
For every scenario, run with current code AND with a "last-known-good" snapshot file; fail if divergent beyond allowlist.
**Cost**: high (infra + baseline curation). **Coverage**: regression-ratchet. **Skip** for now — H1 + snapshot files already give this.

### H12. Fuzz over widths 
Parameterized test runs scenarios at 40 random widths; catches edge-case wraps.
**Cost**: slow. **Coverage**: wide; probabilistic. **Future**: Layer 5 slow test.

### H13. Opt-in visual diff tool
When snapshot fails, print a colored diff in CI. Use `compareBuffers()` from `@silvery/test`.
**Cost**: cheap (already built). **Coverage**: ergonomics (engineer experience when tests fail).

### H14. Per-component contract tests
Each public component declares `@renders` fixture + expected regions in docstring; a linter-style test verifies.
**Cost**: high (new DSL + enforcement). **Skip** — YAGNI vs H1 + H5.

### H15. The "user reports" regression file
Every user-reported visual bug becomes a `regressions/<date>-<slug>.test.tsx` that reproduces the bug. Never deleted. Builds a moat over time.
**Cost**: cheap per-test. **Coverage**: never-regress-what-was-fixed.
**Winner** — cultural mechanism, not infra. Add to the skill.

### H16. Screenshot-to-PNG via termless
Terminal → ANSI → render to PNG via `@termless/test`'s SVG snapshot. Compare pixel-diff.
**Cost**: high. **Coverage**: faithful visual. **Skip for v1** — text frames are sufficient and diff-friendly; revisit if text snapshots miss styling bugs.

### H17. Scenario catalog covers 90% surface
Minimum 7 canonical scenarios: Welcome, first-turn, long-paragraph, tool-call, permission-request, queued-3, narrow-width (60 cols). Extend with `markdown-rich` (all md constructs) and `mode-cycle` (4 modes).
**Cost**: medium. **Coverage**: exhaustive.
**Winner** — the scenario catalog is the product.

### H18. Automated "piecemeal feedback" detection
When user files a bug, the bug's fix PR is required to (a) include a regression test under H15 AND (b) extend a scenario in H17 if applicable.
**Cost**: process. **Winner** — closes the loop.

## Reframe: the synthesis

Five winners fold into one coherent system:

1. **Scenario catalog** (H17) — 8 scripts in `src/test/scripts/` drive the whole app through `ScriptedFakeSession`.
2. **Visual snapshot layer** (H1 + H6) — each scenario rendered through termless at fixed dimensions, snapshot to `tests/__snapshots__/`.
3. **Layout invariants** (H3 + H4) — automatic cross-scenario assertions: "no overflow past LEFT_WIDTH" and "icon family aligns."
4. **Markdown contract** (H9) — canonical markdown doc stressed through MarkdownView at widths {40, 60, 80, 120}.
5. **Regression file** (H15) — `tests/regressions/` directory, one file per user-reported bug, never deleted.

Component-level tests (H5) stay for speed, but they're no longer the primary guard — they're an optimization for change-locality. The primary guard is end-to-end visual snapshots because **that's what the user sees.**

The user's piecemeal feedback becomes a self-extinguishing problem:
- Each reported bug → one scenario + one regression test. Never regresses.
- New features → extend the scenario catalog before shipping.
- CI fails on visual drift, not just logic drift.

## Cost/benefit table

| Layer                     | Cost (per-test) | Coverage        | Setup effort | Status   |
| ------------------------- | --------------- | --------------- | ------------ | -------- |
| Layout invariants (H3+H4) | ~20ms           | Entire overflow/alignment classes | 1 helper | **Ship** |
| Visual snapshots (H1+H6)  | ~100-300ms      | Every visible surface change      | 8 scenarios | **Ship** |
| Markdown contract (H9)    | ~100ms × 4      | Wrap regressions in prose          | 1 doc + 1 test | **Ship** |
| Regression file (H15)     | ~50-100ms each  | Never re-regress known bugs       | 1 README + culture | **Ship** |
| Component renderer (H5)   | ~10-50ms        | Isolated component bugs           | Per-component | Already partial |
| Resize matrix (H7)        | ~300ms × 3      | Narrow-terminal bugs              | Param scenarios | v2 |
| Keystroke simulation (H10)| ~200ms          | Interactive flows                 | Scripted keys | v2 |
| Screenshot SVG/PNG (H16)  | ~1s             | Pixel-perfect                     | New infra | Skip v1 |

## Architecture

```
apps/silvercode/tests/
├── visual/                          ← NEW: end-to-end visual snapshots
│   ├── scenarios.test.tsx           ← runs every scenario, snapshots frame
│   ├── layout-invariants.test.tsx   ← no-overflow + icon-align across all scenarios
│   ├── markdown.test.tsx            ← MarkdownView at 4 widths
│   ├── side-panel.test.tsx          ← mode glyph, version block, quota row
│   └── __snapshots__/               ← golden files
├── regressions/                     ← NEW: one file per user-reported bug
│   ├── README.md
│   └── 2026-04-24-mode-row-icon-margin.test.tsx   (seed)
├── queue-batching.test.tsx          (existing — Layer 3)
├── permission-flow.test.tsx         (existing — Layer 3)
├── side-panel-stays-visible.test.tsx (existing — layout)
├── use-dispose-no-kill.test.tsx     (existing — useDispose bug)
├── lint-invariants.test.ts          (existing — code-shape lint)
├── accounts.test.ts                 (existing — unit)
├── detection.test.ts                (existing — unit)
├── diff-renderer.test.ts            (existing — unit)
└── harness.test.ts                  (existing — stream-json parser)

src/test/
├── fake-session.ts                  (existing)
├── scripts/                         (existing — 5 scripts)
│   ├── welcome.ts                   ← NEW: empty state
│   ├── helloWorld.ts
│   ├── multiTurn.ts
│   ├── bashTool.ts
│   ├── longToolResult.ts
│   ├── permissionRequest.ts
│   ├── markdownRich.ts              ← NEW: heading/bullet/code/bold
│   └── queuedThree.ts               ← NEW: 3 queued entries
└── render-harness.ts                ← NEW: driveScenarioThroughApp helper
```

## Test harness API (new)

```tsx
// apps/silvercode/src/test/render-harness.ts
export async function renderScenario(opts: {
  script: ReadonlyArray<AgentEvent>  // drives session state
  cols: number
  rows: number
  layout?: "single" | "grid-2" | "grid-4"
  bare?: boolean
}): Promise<{
  term: TermlessTerm
  handle: AppHandle
  fakeSession: ScriptedFakeSession
  text: string        // normalized frame text
  lines: string[]
  dispose(): void
}>
```

The harness wires `ScriptedFakeSession` through `controller.spawnFactory`, mounts the real `<App>` via `run()` into a termless backend, synchronously emits all scripted events, and waits for React to flush. Returns the final frame plus the term for interactive follow-up steps.

## Layout-invariant rules (shared across all scenarios)

```tsx
// apps/silvercode/tests/visual/_invariants.ts
export function assertNoOverflowIntoSidePanel(frame: TextFrame, leftWidth: number): void
export function assertIconFamilyAligned(frame: TextFrame, family: ReadonlyArray<string>): void
export function assertModeRowWellFormed(frame: TextFrame, mode: ModeName): void
```

- `assertNoOverflowIntoSidePanel` — for every non-empty line, the rightmost occupied cell within `[0, leftWidth)` must not contain text that continues past that boundary. (Pragmatic version: extract columns `[0, leftWidth)` → that substring of the card region should not equal the next column, i.e., wrapping correctly terminated.)
- `assertIconFamilyAligned` — find all `●`, `>`, `◈`, `⚙` occurrences in the card region; assert they all appear at the same column (±1 for spinner vs glyph).
- `assertModeRowWellFormed` — side panel contains `<MODE_ICON> <MODE_LABEL>` on one row at a specific column; icon and label render with the mode's color.

Every scenario test body ends with:

```tsx
expectLayoutInvariants(s.term.screen, { leftWidth: LEFT_WIDTH })
```

## Snapshot strategy

Vitest's `toMatchSnapshot()` stores snapshots next to the test under `__snapshots__/`. Normalize before hashing:

- Strip trailing spaces on each line
- Collapse runs of blank lines
- Replace volatile text: `v0.1.0` version glyph, elapsed times (`1s` → `Ns`), timestamps

## Regression-test culture (H15)

New mini-skill: `.claude/skills/silvercode/regression-from-bug.md` (future work). Rule:

> When silvercode rendering bug is reported, before fixing:
> 1. Read the bug + reproduce interactively.
> 2. Add a scenario OR a `tests/regressions/<date>-<slug>.test.tsx` that FAILS.
> 3. Fix code.
> 4. Test now passes; never delete the test.

A single bead tag `silvercode-visual-regression` groups all such beads for pattern inventory.

## Scope boundary — what this does NOT solve

- **Mouse/hover visual bugs** — mouse-based hover styles aren't in the snapshot-diff surface. Future: termless mouse events (H10) + hover-state snapshots.
- **Live-LLM bugs** — real Anthropic API behavior (rate-limit, contextOverflow, abrupt session-end). Live smoke tests (Layer 5) still manual.
- **Animation rendering** — ActivityIndicator's 3s verb rotation and 1s pulse. Snapshot one frame at t=0; pulse itself tested separately.
- **Terminal-specific quirks** — Kitty vs iTerm vs Ghostty. Termless uses xterm.js; idiosyncrasies outside xterm.js don't surface here. Layer 5 manual sweep.

## Success criteria

After shipping this system, reintroducing any of the following bugs must cause test failure:

- [ ] Remove `paddingX={1}` from `AssistantBlock` → visual snapshot + icon-align invariant catch it.
- [ ] Change `MODE_ICONS.plan` from `·` to `.` typo → mode-row invariant catches it.
- [ ] Remove `overflow="hidden"` from SessionCard outer Box → side-panel invariant catches it.
- [ ] Break `MarkdownView` flexWrap so paragraph wraps overflow → markdown contract catches it at 60 cols.
- [ ] Break `printResumeHints()` to print while alt-screen open → Layer 5 manual (this system does NOT catch; left to followup bead).
- [ ] Remove `◈` glyph from Silver Code line → snapshot catches it.

When the user reports a NEW class of visual bug, the fix PR extends one of the test layers so THAT class can't slip through again.

## Rollout plan (implemented in this session)

**Phase A** — harness + 5 scenarios (≥2 existing) + 1 layout-invariant test (welcome+longToolResult).
**Phase B** — markdown-rich scenario + markdown contract (4 widths).
**Phase C** — icon-family invariant across all scenarios.
**Phase D** — 1 regression test seed (mode row icon margin — the most recent fix).
**Phase E** — README under `tests/regressions/` + one line in `apps/silvercode/CLAUDE.md`.

Followups (new beads):
- `km-silvercode.test-interactive` — keystroke-simulation scenarios (H10).
- `km-silvercode.test-resize-matrix` — width-parameterized tests (H7).
- `km-silvercode.test-mouse-hover` — hover-state visual snapshots.
- `km-silvercode.test-screenshot-svg` — termless SVG/PNG snapshots for pixel-perfect diffs.

## References

- `apps/silvercode/src/test/fake-session.ts` — Layer 3 foundation
- `vendor/silvery/packages/test/src/index.tsx` — `createTermless`, `createRenderer`, `TextFrame`
- `apps/km-tui/tests/showcase.spec.ts` — canonical km-tui test style (snapshots, matchers, typed handles)
- `apps/km-tui/tests/CLAUDE.md` — test philosophy (domain-based, MECE, journey tests)
- `docs/silvery-positioning-brief.md` — silvery is multi-target; snapshots must be platform-portable
