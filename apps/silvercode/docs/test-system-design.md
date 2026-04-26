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

| Layer                      | Cost (per-test) | Coverage                          | Setup effort       | Status          |
| -------------------------- | --------------- | --------------------------------- | ------------------ | --------------- |
| Layout invariants (H3+H4)  | ~20ms           | Entire overflow/alignment classes | 1 helper           | **Ship**        |
| Visual snapshots (H1+H6)   | ~100-300ms      | Every visible surface change      | 8 scenarios        | **Ship**        |
| Markdown contract (H9)     | ~100ms × 4      | Wrap regressions in prose         | 1 doc + 1 test     | **Ship**        |
| Regression file (H15)      | ~50-100ms each  | Never re-regress known bugs       | 1 README + culture | **Ship**        |
| Component renderer (H5)    | ~10-50ms        | Isolated component bugs           | Per-component      | Already partial |
| Resize matrix (H7)         | ~300ms × 3      | Narrow-terminal bugs              | Param scenarios    | v2              |
| Keystroke simulation (H10) | ~200ms          | Interactive flows                 | Scripted keys      | v2              |
| Screenshot SVG/PNG (H16)   | ~1s             | Pixel-perfect                     | New infra          | Skip v1         |

## /pro review — incorporated revisions (2026-04-24)

Ran `/pro review` (GPT-5.4 Pro + Kimi K2.6, dual-pro, $1.90) against the design doc above + the silvery-positioning brief. Both reviewers converged on the same critiques. Incorporating P0 blockers and top P1 concerns below.

### P0 blockers acknowledged

**P0.1 — Overclaim removed.** The original "cannot regress" list included resume hint, queue editor height, and activity indicator timing. This v1 does NOT catch those:

- **Resume hint** — requires process-level stdout/stderr capture after alt-screen exit. Separate harness needed. Now a named gap, not a guarantee.
- **Queue editor height** — requires keystroke simulation (focus the queue editor, assert row count). v2 work.
- **Activity indicator rotation/elapsed/tokens** — requires fake clock. v2 work.
- **Hover popovers / scroll position / focus ring** — session-event harness can't drive these. v2.

The v1 contract is narrower: **static final-frame composition + layout regressions** in the card stream and side panel. Everything else is an explicit v2 bead.

**P0.2 — Kill destructive normalization.** In a TUI, blank lines ARE vertical rhythm and trailing whitespace IS padding. Normalization now strips ONLY content-volatile text (elapsed `Ns`, `Nm Ns`, specific timestamps via marker regex). Row structure, blank lines, and column occupancy are preserved verbatim. If a blank line disappears between "before" and "after", the diff shows it.

**P0.3 — ScriptedFakeSession isn't a UI driver.** Noted. v1 accepts this limitation and covers the session-driven surface only. A follow-up bead (`km-silvercode.test-ui-driver`) adds keystroke simulation + fake clock. Until then, the v1 guarantee explicitly excludes interactive flows.

### P1 concerns incorporated

**Reviewable `.frame.txt` fixtures, not vitest `.snap` files.** Vitest snapshots escape to single-line strings; a 30-line frame becomes a 200-char string nobody reviews in the PR diff. We store expected output as literal multi-line `.frame.txt` files next to the test. Git diff shows exactly which rows changed. No `--update-snapshot` escape hatch — updating means editing the fixture by hand, which forces review.

**Semantic FrameParser for structural assertions.** Absolute `(col, row)` coordinates break under any layout shift. A `parseFrame(text, { cols })` helper extracts semantic regions: `cardStream[]`, `sidePanel.modeRow`, `inputBox`, `welcome.rows[]`. Tests assert `layout.cardStream[0].textWidth === leftWidth - padding` — surviving refactors that shift the whole panel.

**Region snapshots, not whole-frame.** Whole-frame snapshots only for the smoke-test scenarios (2-3 canonical). The bulk of assertions are region-level (welcome panel, side panel, first assistant block) so a copy tweak in the welcome panel doesn't churn the side-panel snapshots.

**Coverage matrix — the missing core.** Below.

### Coverage matrix (falsifiable)

| Bug class                                  | Test type         | Where                                    | Assertion                                             | v1? |
| ------------------------------------------ | ----------------- | ---------------------------------------- | ----------------------------------------------------- | --- |
| paragraph overflows into side panel        | e2e               | `visual/scenarios.test.tsx`              | `assertNoOverflowIntoSidePanel`                       | ✓   |
| paragraph clips one char short             | component         | `visual/markdown.test.tsx`               | `parseFrame().wrapShape` deep-equal to golden         | ✓   |
| message-stream icon drift                  | e2e invariant     | `visual/scenarios.test.tsx`              | `assertIconFamilyAligned`                             | ✓   |
| mode glyph typo / wrong label              | side-panel region | `visual/side-panel.test.tsx`             | `parseFrame().modeRow === { icon, label, color }`     | ✓   |
| welcome panel missing row                  | region snapshot   | `visual/welcome.test.tsx`                | `.frame.txt` fixture diff                             | ✓   |
| `paddingX` regression on AssistantBlock    | region snapshot   | `visual/scenarios.test.tsx helloWorld`   | fixture diff — icon column shifts                     | ✓   |
| side panel pushed off-screen               | layout invariant  | `visual/scenarios.test.tsx longTool`     | `assertSidePanelVisible`                              | ✓   |
| markdown wrap broken at narrow width       | region at width   | `visual/markdown.test.tsx`               | rendered at {40, 60, 80, 120}; fixture diff per width | ✓   |
| queue editor height grows on 3 queued msgs | interactive       | **v2** — needs keystroke simulation      | —                                                     | —   |
| resume hint stderr after alt-screen        | process harness   | **v2** — needs process-level capture     | —                                                     | —   |
| activity verb rotation / elapsed tail      | fake clock        | **v2** — needs `vi.useFakeTimers()` wire | —                                                     | —   |
| hover popovers (Sessions/Todos/Mode)       | UI driver         | **v2**                                   | —                                                     | —   |
| scroll position / focus ring               | UI driver         | **v2**                                   | —                                                     | —   |

### Mutation proof

Every "we catch this" row in the matrix above has a companion mutation test in `tests/visual/mutations.test.ts` — it applies a fault patch in-memory (e.g., overrides `MODE_ICONS.plan` to `"."`) and asserts the relevant test FAILS. This is the "prove your tests actually work" gate. If a refactor silently breaks the ability to detect a known bug class, the mutation test for that class goes red.

### v1 scope (what ships in this session)

1. `renderScenario()` harness (scripted-event-driven, synchronous, real `<App/>`).
2. `parseFrame()` semantic parser — cardStream, sidePanel, welcome region, input box.
3. Layout invariants — overflow, icon alignment, mode row, side panel visible, command input present.
4. 7 canonical scenarios: welcome, helloWorld, multiTurn, bashTool, longToolResult, permissionRequest, markdownRich.
5. 3 visual test files:
   - `visual/scenarios.test.tsx` — runs every scenario, asserts invariants + small fixture diff on key regions
   - `visual/markdown.test.tsx` — renders markdownRich at 4 widths, fixture diff per width
   - `visual/side-panel.test.tsx` — mode glyph + label + color per mode (parsed, not coordinate-based)
6. 1 mutation test file: `visual/mutations.test.ts` — proves the above tests catch 5 concrete injected regressions.
7. `regressions/` seed + README — culture mechanism for user-reported bugs.

### v2 backlog (tracked as new beads)

- `km-silvercode.test-ui-driver` — keystroke simulation + fake clock
- `km-silvercode.test-process-harness` — stdout/stderr capture for resume hint
- `km-silvercode.test-hover-popovers` — mouse events + popover assertions
- `km-silvercode.test-resize-matrix` — scenarios × width parameterization
- `km-silvercode.test-mutation-gate` — wire mutation proof into CI

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
  script: ReadonlyArray<AgentEvent> // drives session state
  cols: number
  rows: number
  layout?: "single" | "grid-2" | "grid-4"
  bare?: boolean
}): Promise<{
  term: TermlessTerm
  handle: AppHandle
  fakeSession: ScriptedFakeSession
  text: string // normalized frame text
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
>
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

## Success criteria (v1 — falsifiable by mutation tests)

After shipping this system, every mutation below triggers a specific failing test. `visual/mutations.test.ts` enforces this — proving the tests actually catch what the doc claims:

- [x] Remove `paddingX={1}` from `AssistantBlock` → region fixture diff catches it + icon-align invariant catches it.
- [x] Change `MODE_ICONS.plan` from `·` to `.` typo → `assertModeRowWellFormed` catches the wrong glyph; semantic mode-row parse catches it too.
- [x] Remove `overflow="hidden"` from SessionCard outer Box → `assertNoOverflowIntoSidePanel` + `assertSidePanelVisible` on the longToolResult scenario.
- [x] Break `MarkdownView` flexWrap so paragraphs overflow → `markdown.test.tsx` at 60 cols, `parseFrame().wrapShape` diff.
- [x] Remove `◈` glyph from Silver Code line → side-panel region fixture diff.

### Known gaps (explicitly NOT covered by v1)

These are documented as gaps, NOT claimed as coverage:

- **Resume hint regression after alt-screen exit** — requires process-level stdout/stderr capture. Tracked in `km-silvercode.test-process-harness`.
- **Queue editor height growing** — requires keystroke simulation (focus the queue editor, type, measure). Tracked in `km-silvercode.test-ui-driver`.
- **Activity indicator verb rotation / elapsed timer / token tail** — requires fake clock + interval advance. Tracked in `km-silvercode.test-ui-driver`.
- **Hover-popover visual bugs** — requires mouse events + popover assertion. Tracked in `km-silvercode.test-hover-popovers`.
- **Scroll position / focus-ring bugs** — v2.

When the user reports one of these v2-gap bugs, a v1 regression test can still be added (via `tests/regressions/`) if the reproduction is session-event-driven. If it's UI-driven, the v2 work is now pre-scoped.

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

## Boundary fakes — every third-party API silvercode reaches into

Bead `km-silvercode.test-api-fakes` (closed 2026-04-24) extended ScriptedFakeSession's "fake the Claude session" coverage to every other third-party boundary the app touches. Each boundary now has a factory the harness installs before render and restores after.

| Boundary           | What's faked                                                                           | Override entry point                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Claude CLI version | `spawnSync("claude", "--version")` at module load                                      | `setVersionFactoryOverride()` + `SILVERCODE_FAKE_CLAUDE_VERSION` env var (for module-load probes captured into a const) |
| Git branch         | `.git/HEAD` walk in `gitBranchFor(cwd)`                                                | `setGitFactoryOverride((cwd) => name)` + `SILVERCODE_FAKE_BRANCH` env var                                               |
| Account / quota    | accountly's `checkProfileQuota`, keychain reads, `~/.cache/km/quota-*.json` disk cache | `setAccountFactoryOverride({ readCached, probe })`                                                                      |
| Filesystem         | `~/.cache/km/`, `~/.km/` writes                                                        | `installFakes({ fsRoot })` allocates a tmp dir and overrides `HOME` + `XDG_CACHE_HOME`                                  |

### How the wiring lands without touching components

The hook `useClaudeAccount(accountFactory?)` accepts an optional factory, but the canonical injection path is **module-level** — `setAccountFactoryOverride` flips a sentinel inside `claude-account.ts`. SidePanel's existing `useClaudeAccount()` call (no prop changes needed) reads the override automatically. `claude-version.ts` and `git-branch.ts` follow the same pattern: a `let xxxOverride` at the top of the file, gated checks at the start of each public fn, and `setXxxFactoryOverride(null)` resets to the production path.

The version probe is captured into a const at SidePanel module load (`const CLAUDE_VERSION_AT_STARTUP = probeClaudeVersion()`). For that one boundary the override has to be in place BEFORE SidePanel imports — handled by `apps/silvercode/src/test/setup-fakes.ts` (loaded as a global vitest setupFile) which sets `SILVERCODE_FAKE_CLAUDE_VERSION` BEFORE any test file runs. Per-test version overrides via `setVersionFactoryOverride` still apply for re-probes.

### Harness API

```ts
const s = await renderScenario({
  script: welcome,
  cols: 120,
  rows: 30,
  account: { plan: "claude_max_20x", quotas: warningQuotas() }, // or null for live
  version: "9.9.9-test", // or null for real spawn
  branch: "feat-x", // or null for real .git walk
  fsRoot: "/tmp/scratch", // or null to leave HOME alone
})
try {
  expect(s.text).toContain("87%")
} finally {
  s.dispose() // restores overrides + removes tmp HOME if allocated
}
```

`renderScenario` returns a `dispose()` that restores every module override and removes the per-scenario tmp HOME directory. Calling `dispose()` is required when you opt out of the default healthy account fake — the global `afterEach` in `setup-fakes.ts` restores defaults but does not delete the per-test tmp dir.

### Verification

- **Determinism gate**: `HOME=/tmp/empty-dir bun vitest run apps/silvercode/tests/visual/` passes — proves no test reads the user's real `~/.cache/km/` or shells out to `git`/`claude`.
- **Boundary contract gate**: `apps/silvercode/tests/visual/boundary-fakes.test.tsx` — five contract tests, one per faked boundary, prove the fake path actually surfaces in the rendered frame.

## Live-mode contract tests (SILVERCODE_REAL=1)

Bead `km-silvercode.test-live-mode` (closed 2026-04-24) introduces a parallel "real" test track that swaps every fake for the production implementation, so the fake/real divergence shows up in CI before users hit it.

### Invocation

| Mode | Command                                                      | What runs                                                  |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Fake | `bun vitest run apps/silvercode/tests/`                      | Default — every visual scenario via fakes                  |
| Live | `SILVERCODE_REAL=1 bun vitest run --project silvercode-live` | `*.live.test.tsx` only — real Claude CLI + accountly + git |

### Pattern

Each contract scenario uses `describe.each([["fake"], ["real"]])` so the same assertions run in both modes. The "real" arm calls `test.skip` when `process.env.SILVERCODE_REAL !== "1"` so live-mode tests don't slow the fast suite. Setting `account: null`, `version: null`, `branch: null`, `fsRoot: null` on `renderScenario(...)` opts that boundary out of the fake — that's how the real arm runs against the production implementation.

The live project lives at `silvercode-live` in `vitest.config.ts` and is excluded from both the root config (no-flag run) and the `default` project, so plain `bun vitest run` never triggers it.

### v1 live scenarios

- **Welcome** — empty session, real spawnSync of `claude --version`, real `.git/HEAD` walk, real keychain quota read.
- **Single-turn hello** — sends a literal "say hi" prompt to the real CLI, asserts an assistant glyph + non-empty body in the rendered frame.
- **Quota display** — real accountly probe; asserts the SidePanel renders ≥1 QuotaWindow row (specific %s vary; we assert structure, not values).
