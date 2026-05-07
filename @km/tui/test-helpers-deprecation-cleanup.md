---
id: "@km/tui/test-helpers-deprecation-cleanup"
type: refactor
priority: P3
created_at: 2026-05-06T00:00:00.000Z
parent: "@km/all/L5-deprecation-purge"
closed_at: 2026-05-07T04:01:04.708Z
closeReason: "Migrated 14 expectScreen + 4 expectScreenNot callsites to
  canonical matchers (`expect(app).toContainText(text)` for TestApp callers,
  `expect(board.screen.text).toContain(text)` for createDriverTest callers).
  Deleted both deprecated helpers from test-app.ts and board-test.ts; CI
  baseline lowered 2 → 0 (hard ban). Audit of the 79 `app.dispatch(\"...\")`
  callsites found each falls into a legitimate bucket (orphan commands with no
  key binding: search/item_picker/pane_split_and_pick × 72; command-registry
  iteration test × 2; dispatch render-flush behavior pinning × 5). Reframed
  dispatch's JSDoc from @deprecated to @internal and added a baseline guard
  (BASELINE_APP_DISPATCH=79) so new callers fail CI. The pipe-plugin
  `app.dispatch({type:...})` form was never affected — different dispatcher.
  Commits: 72b721462 (Phase 5h-A: expectScreen retired), 246d0614f (Phase 5h-B:
  dispatch reframed). 2561 km-tui tests pass; tsc 0 errors."
---

# [x] km-tui/tests: migrate `dispatch` / `expectScreen` / `expectScreenNot` test-helpers (L5 Phase 5h follow-up) #refactor #P3

Test-helper deprecations in `apps/km-tui/tests/helpers/test-app.ts` exceed the 30-call threshold for in-line cleanup, deferred from L5 Phase 5h.

## Inventory (counts at time of filing)

- `app.dispatch(commandId)` — 118 call sites — replace with `app.press(<key>)` or `app.command(<id>)`
- `app.expectScreen(text)` — 19 call sites — replace with `expect(app).toContainText(text)`
- `app.expectScreenNot(text)` — 4 call sites — replace with `expect(app).not.toContainText(text)`

Total: 141 call sites. Per `.claude/skills/refactor/migrate.md`, batch-refactor territory.

## Acceptance

- [ ] `grep -rn "\.dispatch(\|\.expectScreen\b\|\.expectScreenNot\b" apps/km-tui/tests/ --include='*.ts' --include='*.tsx' | wc -l` returns 0
- [ ] Three deprecated methods (`dispatch`, `expectScreen`, `expectScreenNot`) deleted from `apps/km-tui/tests/helpers/test-app.ts`
- [ ] All test files compile + pass (`bun vitest run apps/km-tui/tests/`)

## Approach

Use `bun vendor/bearly/tools/refactor.ts` editsets. The `dispatch` migration needs per-call judgment (which key triggers the command) — likely an LLM-driven `pattern.migrate` over an editset, not a pure find/replace. The `expectScreen*` migrations are mechanical (`X.expectScreen(Y)` → `expect(X).toContainText(Y)`).

## Why deferred

Per the L5 Phase 5h micro-phase brief (P5 deprecation purge): test-helper deprecations are non-blocking, and the 30-call threshold for in-line work was exceeded.

