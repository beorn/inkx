---
mentions:
  - km
  - claude
id: "@km/silvery/handle-cast-lint"
aliases:
  - km-silvery.handle-cast-lint
  - km-silvery-handle-cast-lint
created_by: claude:da9990c5
created_at: 2026-04-28T21:45:39Z
closed_at: 2026-04-28T22:14:42Z
close_reason: "Ported from closed scope-resource-ownership commit 050902963.
  Allowlist + regex trimmed to scoped-tick / TickHandle (the only factory that
  shipped). Added /.claude/worktrees/ to allowlist (suppresses false positives
  from stale agent clones inside submodules). Verified clean (count=0 vs
  baseline=0). 3/3 tests pass. Committed direct to main: 46e1dad90 (this is a
  lint addition with no merge collision risk, so it bypassed the worktree
  pattern). Files: packages/km-infra/scripts/check-no-handle-cast.sh,
  packages/km-infra/tests/no-handle-cast.test.ts."
started_at: 2026-04-28T22:12:50Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.handle-cast-lint
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-28T14:45:38Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] CI lint blocking 'as XHandle' / 'as TickHandle' casts outside scoped factories @km/silvery #task #P3 @claude:2405c72e

blocks:: [[@km/silvery]]

Salvaged from feat/@km/silvery/scope-resource-ownership commit 050902963 (sub-agent triage 2026-04-28).

## Background

C1 scope-resource-ownership shipped at L4 in silvery (commits 6fbc83ed/293813c9 — Phase 1 + Phase 2 SCOPE_TRACE). Phase 1 introduced `defineHandle()` / `adoptHandle()` with structural unique-symbol brand. Per pro/Kimi review of Phase 1, the brand on `Handle<unique symbol>` is structural, not nominal — `as TickHandle` casts compile through the brand even though the runtime WeakSet inside `adoptHandle()` / `Scope.use()` would reject the resulting forged handle.

A CI lint script + test was prepared on a feat branch but never merged because the branch's other commits (Phase 2 `scoped-runtime.ts` / `scoped-input-owner.ts`) didn't ship. Only `scoped-tick.ts` exists in current silvery.

## What to ship

Port the lint from feat/@km/silvery/scope-resource-ownership commit 050902963:

- `packages/km-infra/scripts/check-no-handle-cast.sh` (107 lines)
- `packages/km-infra/tests/no-handle-cast.test.ts` (73 lines)

**With one correction**: the original allowlist references `scoped-runtime.ts` and `scoped-input-owner.ts` which do NOT exist in current silvery. Trim the allowlist to ONLY `scoped-tick.ts` (the one that did ship and contains 2 legitimate `as TickHandle` casts).

## Why P3 / nice-to-have

km code itself (packages/, apps/) doesn't use the Handle pattern — only silvery internals do. So the lint protects silvery's discipline, not km's. Modest value but small effort.

The original commit is on branch feat/@km/silvery/scope-resource-ownership (will be deleted). To recover: `git show 050902963c14ca0c4efa896bd9c688dde73d7a27` from the reflog (commit will live there until gc).

## /complete criteria

- [ ] Port both files from commit 050902963
- [ ] Trim allowlist to scoped-tick.ts only
- [ ] Add CI invocation in package.json or .github workflow
- [ ] Test catches a deliberate forged `as TickHandle` cast outside scoped-tick.ts

