---
id: "@km/tui/test-helpers-deprecation-cleanup"
type: refactor
priority: P3
created_at: 2026-05-06T00:00:00.000Z
parent: "@km/all/L5-deprecation-purge"
---

# [ ] km-tui/tests: migrate `dispatch` / `expectScreen` / `expectScreenNot` test-helpers (L5 Phase 5h follow-up) #refactor #P3

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
