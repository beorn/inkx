# Test Migration Semantic Drift

**Lesson**: When migrating a test from a **pipeline-correctness assertion** to a **user-facing assertion**, the new assertion can over-specify layout/scroll behavior that the original didn't care about. The test fails across terminal sizes but no underlying regression exists.

## Concrete case: nav-garble-wide

**Original (2026-03-13, `a487c3288`)**:
```typescript
board.expectIncrementalMatchesFresh()
```
Pipeline-level check — did the incremental render match the fresh render? Tests the silvery output phase doesn't drift.

**Migrated (2026-03-27, `95dcd6574`)**:
```typescript
expect(app.text).toContain("UNIQUE_CARD_A")
```
User-facing check — is this specific card visible on screen? Much narrower claim.

**Result**: passed at 220×50 (6 columns fit), failed at 200×50 and 160×40 (5/4 columns fit, INBOX legitimately scrolled off). The pipeline was behaving correctly — horizontal column scroll (`◂` indicator) is correct behavior when columns don't fit. The new assertion was just wrong.

## Symptoms to watch for

- Migrated test fails across **specific terminal sizes** but not all sizes
- `SILVERY_STRICT` / `checkIncremental` / `checkReplay` stay silent
- Failure output shows **overflow indicators** (`◂`, `▸`, `▲`, `▼`) — signals legitimate scroll/virtualization
- The failure goes away at sizes where "everything fits"

## Correct pattern for migration

For **rendering correctness**: use `createTestApp`'s built-in diagnostics (`checkIncremental`, `checkStability`, auto-enabled). They're the direct successor to `expectIncrementalMatchesFresh`.

For **user-visible garble**: assert the actual fingerprint:
- Duplicate titles: `countOccurrences(text, title) ≤ 1`
- Text leaking into borders: `/╰─.*[a-z].*─╯/` regex → fail
- Content where it shouldn't be: scoped region checks via `app.q(selector)`

Don't assert "card X is visible at width Y" unless you actually care about visibility at that specific width — that conflates "rendering works" with "layout fits".

## Related

- `apps/km-tui/tests/nav-garble-wide.test.ts` — the canonical test after fix (`ee4d67c7f`)
- `docs/lessons/debugging-rendering.md` — the pipeline assertion stack
- `apps/km-tui/tests/CLAUDE.md` — test API canon
