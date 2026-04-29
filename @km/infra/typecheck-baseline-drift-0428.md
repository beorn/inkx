---
id: "@km/infra/typecheck-baseline-drift-0428"
aliases:
  - km-infra.typecheck-baseline-drift-0428
  - km-infra-typecheck-baseline-drift-0428
created_by: claude:2405c72e
created_at: 2026-04-28T22:44:31Z
closed_at: 2026-04-28T22:49:13Z
close_reason: "Fixed all 21 baseline-drift errors. silvery bump to 06498f0c (17
  stripAnsi(app.lines[0]!) + 2 prevBuffer!.markAllRowsDirty()). km-side:
  session-reducer Map<TurnId, StripState> generic + km-beads issues[0]!
  non-null. tsc count 0."
---

# [x] Typecheck baseline drift: 21 new errors after Wave 2 integration (silvery-side) @km/infra #bug #P1 @claude:2405c72e

blocks:: [[@km/infra]]

After integrating Wave 2 wip branches on 2026-04-28 evening, typecheck baseline shows 21 new errors:

- 1 in apps/silvercode/packages/agent-harness/src/session-reducer.ts (likely pre-existing, ReadonlyMap variance)
- 2 in packages/@km/beads/tests/migrate.test.ts (pre-existing undefined-checks)
- 1 in vendor/silvery/packages/ag-term/src/renderer.ts (NEW — from silvery 3fa23479 scope fix)
- 17 in vendor/silvery/tests/features/box-flex-direction-reuse.test.tsx (NEW — from silvery 3fa23479)

Root cause: silvery commit 3fa23479 (the scope fiber-disposal fix) introduced typecheck issues that the agent's per-package vitest run did NOT catch (they pass at runtime under SILVERY_STRICT=2 but fail tsc). The agent's report said tests pass; tsc was not part of the agent's verification on the silvery side.

Fix: investigate each error, decide per case:
- True type bugs → fix
- Test fixture using non-public types → fix the test
- Genuinely intentional → bun run typecheck:update (last resort, per CLAUDE.md never-update-baseline rule)

Lesson for next /max with vendor/silvery work: agent prompt MUST require silvery-side tsc verification, not just vitest. Update @km/silvery agent prompt template.

Reference: /loop session 2026-04-28 evening (@km/session/0425-evening). Triggering integration was commit 502149fb6 (Merge wip/@km/silvery/scope-phase-1).