---
id: "@km/all/test-ergonomics"
aliases:
  - km-all.test-ergonomics
  - km-all-test-ergonomics
created_by: Bjørn Stabell
created_at: 2026-04-10T02:41:13Z
closed_at: 2026-04-15T19:25:09Z
close_reason: "Grooming 2026-04-15: vision absorbed into km-all.test-system
  (which has active phase children and is in_progress).
  Snapshot/DSL/record-replay phases (2-4) remain tracked in test-system
  description."
owner: bjorn@stabell.org
---

# [x] Test ergonomics — make tests efficient, authoring-cheap, refactor-proof @km/all #epic #P0

## Vision

Tests should (a) describe user behavior, not internal state, (b) cost nothing to author and maintain, (c) survive internal refactors unchanged, (d) be trivial for AI and non-developers to read/write. Currently none of these are true.

## Current pain

- **523 store.getState() calls across 34 files** — huge surface area of implementation coupling
- Only **3 toMatchSnapshot calls** in @km/tui tests — snapshot infrastructure exists (termless has toMatchTerminalSnapshot, toMatchSvgSnapshot) but is unused
- Tests broke en masse in session 2026-04-09: 157 slow test failures from refactors that didn't change behavior (Board.tsx split, ModeStack deletion, visual mode removal, selection consolidation, rect renames)
- Every big refactor triggers a multi-day test-repair cycle
- Test authoring cost is high — devs copy-paste old tests rather than write new ones, propagating the fragile patterns

## Core insight

Tests are code that duplicates app logic. They share the app's fragility. The fix isn't to make the coupling cleaner — it's to stop duplicating logic altogether. Tests should be RECORDINGS of behavior, not RE-IMPLEMENTATIONS.

## Three-layer strategy

### Layer 1 — Screen snapshots (default assertion)
Every test step captures a screen snapshot. Golden files committed to repo. Refactor that doesn't change rendering → snapshots unchanged → tests pass. Refactor that changes rendering → snapshot diff in PR review.

- termless already provides toMatchTerminalSnapshot (5 files in termless tests use it)
- Wire snapshot assertions into createTestApp: app.expectSnapshot(name?)
- Default snapshot location: tests/__snapshots__/<file>.snap
- Re-record with vitest --update flag

### Layer 2 — Typed observability getters (non-visible state)
Small curated set of typed getters on TestApp for state that doesn't appear on screen but matters: undo depth, bell count, clipboard contents, overlay stack, filter state. See @km/all/test-whitebox-api for the full API.

Covers the ~5% of tests that need white-box inspection. Stable contract — individual getters are maintained when store paths change.

### Layer 3 — Markdown DSL for journey tests (authoring)
Tests as markdown files, not TypeScript:

    # Fold last card in column

    Given fixture: simpleBoard
    When press: j j H
    Then cursor on: task 1b
    Then hidden: task 2a
    Then screen matches snapshot: fold-boundary-01

Compiles to a test runner. Non-developers can edit. AI can generate/read trivially. No imports, no TS boilerplate, no store access. The markdown IS the test.

**Build status**: vendor/mdtest referenced in CLAUDE.md but DOES NOT EXIST — would be greenfield. Alternative: extend vendor/bearly or build @km/mdspec as a new package.

### Layer 4 — Record-and-replay workflow
Interactive authoring: use TTY MCP to exercise the app, tool captures actions + screen states, emits a markdown spec. Developer reviews and commits. Zero manual assertion writing for happy-path journeys.

## Phases

### Phase 1 — Typed getters + delete testEnv — FOUNDATION
See @km/all/test-whitebox-api (child). Audit 523 store.getState() calls, implement covering getters, migrate remaining testEnv tests, delete testEnv, add lint rule.

/complete: grep for testEnv/store.getState/createBoardDriver in apps/@km/tui/tests returns 0 hits. TestApp interface has no store/driver exports.

### Phase 2 — Screen snapshots as first-class assertion
- Wire toMatchTerminalSnapshot into createTestApp
- Add app.expectSnapshot(name?) and app.expectScreenMatches(name?)
- Migrate 20 representative journey tests to snapshot-based assertions
- Document snapshot update workflow

/complete: 20 tests use screen snapshots, workflow documented, snapshot review protocol in PR template.

### Phase 3 — Markdown DSL (@km/mdspec)
- Build @km/mdspec package: parser + runner + AST
- Grammar: Given/When/Then with fixtures, keys, commands, observations
- Compiles to executable tests (runs via vitest or standalone)
- Error messages point to the markdown line numbers
- Syntax-highlighted in editors (via markdown-it or custom)

/complete: 10 journey tests written as .md files execute via vitest, failures point to markdown lines.

### Phase 4 — Record-and-replay tooling
- TTY MCP integration: capture session → emit markdown spec
- bun tdd record → opens interactive repro, captures on exit
- Generated specs are human-editable (not opaque binary)

/complete: /tdd record produces a runnable .md spec for the last 3 bugs.

### Phase 5 — Migrate journey tests to mdspec
- Audit which slow tests are journey tests vs component tests
- Migrate journey tests to .md
- Keep createTestApp for low-level component tests (card layout, border rendering)

/complete: 60% of .slow.spec.ts files replaced with .md specs. Remaining are genuine component tests.

## Relationship to existing beads

- **@km/all/test-whitebox-api** (P0): Phase 1 of this epic. Already open.
- **@km/all/test-migrate** (P0): Bulk migration of 75 files. Feeds into Phase 1.
- **@km/all/test-system** (CLOSED): parent of test-migrate; the original framework bead. This new epic is its successor.

## Why P0

Every refactor triggers a multi-day test-repair cycle. The current proposal (typed getters) stops the bleeding but doesn't address authoring cost. Until authoring is cheap, developers will keep copy-pasting old patterns. The full stack (snapshots + mdspec + record-replay) is the actual fix.