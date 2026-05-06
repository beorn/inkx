---
mentions:
  - km
id: "@km/beads/bead-type-keywords-shared-constant"
aliases:
  - km-beads.bead-type-keywords-shared-constant
  - km-beads-bead-type-keywords-shared-constant
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: bug
priority: P2
status: todo
parent: km-beads
_stub: true
---

The list of valid bead type keywords is duplicated and has already drifted:

- `apps/km-cli/src/commands/tasks/set-clear-plan.ts` `KNOWN_TYPES`: `["bug", "feature", "epic", "task", "docs", "chore"]`
- `packages/km-beads/src/queries.ts` `nodeToBead.typeKeywords` (~line 298): `["bug", "feature", "epic", "task", "docs", "question"]`

Difference: `chore` vs `question`. Whichever set is "correct" is a product decision — the canonical source per `docs/future/beads.md` "Issue Type Tags" section should resolve it.

## Fix

1. Verify against `docs/future/beads.md` "Issue Type Tags" — which keywords are canonical?
2. Decide: do we accept BOTH `chore` and `question`? (Both seem useful — chore for maintenance, question for open questions.)
3. Export `BEAD_TYPE_KEYWORDS: readonly string[]` from `packages/km-beads/src/index.ts` (or types.ts).
4. Both `set-clear-plan.ts` and `queries.ts` consume the same constant.
5. Add a test that pins the union (so the next drift becomes a TS-failure or test-failure, not a silent inconsistency).

### Acceptance

- [ ] Single source of truth for bead type keywords lives in `@km/beads`
- [ ] `tasks set <id> type:question` and `tasks set <id> type:chore` BOTH succeed (or both fail consistently per the product decision)
- [ ] `nodeToBead` returns the same set of types that `set-clear-plan` accepts
- [ ] Regression test: importing from `@km/beads`, the keyword union is exhaustive
- [ ] `docs/future/beads.md` "Issue Type Tags" matches the constant

### Why this is L4

Currently the drift is silent — neither path errors when the set diverges. Sharing the constant + a TS test makes the drift impossible by construction.

### Surfaced by

Code-quality agent in session f9eb64dc.

