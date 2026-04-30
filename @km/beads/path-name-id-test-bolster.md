---
id: "@km/beads/path-name-id-test-bolster"
aliases:
  - km-beads.path-name-id-test-bolster
  - km-beads-path-name-id-test-bolster
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T15:00:00Z
type: feature
priority: P0
parent: "@km/beads"
---

# Bolster regression tests around resolver / bd create / path resolution @km/beads #task #P0

Before further /pro-corrected refactors land, do a focused review of existing tests in this area and add regressions that codify the new invariants. Also drive the corrected `bd create` surface end-to-end via `/explore` on real-data copies, not just unit tests.

## Why P0

- The 2026-04-30 session shipped 5 commits worth of resolver + CLI changes. Tests passed 256/256 but the /pro 4-leg review surfaced realistic CLI inputs the tests didn't cover (titles with `/`, titles starting with `@`, legacy bd-form positional ids, etc.).
- One bug (`bd create` smart-positional heuristic) was actively broken in production until commit `ef2f0b2e1` reverted it. Tests should have caught this.
- Pre-existing test fixture pattern (raw `repo.addNode({ data: { id: ... } })` without file materialization) creates a divergence between test reality and production. Migrating fixtures is part of `@km/beads/data-id-stop-writing` but the test bolster should set up the helper they'll migrate to.

## Scope

Three sub-tasks:

### 1. Audit existing tests in this area

```bash
rg -l 'resolveShortId|resolveTaskNode|bd create|resolveNode|pathOf' \
  packages/km-beads/tests/ apps/km-cli/tests/ packages/km-core/tests/ \
  packages/km-storage/tests/
```

For each file, classify:
- **Solid** — covers production reality, will catch regressions.
- **Brittle** — relies on test-only seed patterns (raw addNode with data.id) that won't hold post-migration.
- **Missing coverage** — invariant not covered.

### 2. Add the regressions /pro flagged

CLI input matrix tests (`apps/km-cli/tests/bd-create-arg-shapes.test.ts` — new):

- `bd create "Title"` → bd compat: title-positional, lands in inbox, no smart-positional misroute.
- `bd create "fix: handle / in regex"` → title with `/`, treated as title not path. **Regression for the broken heuristic that was in commit `4621393af` and reverted in `ef2f0b2e1`.**
- `bd create "@alice please review"` → title starting with `@`, treated as title not path.
- `bd create km-beads.foo` (legacy bd-form id as title) → treated as title; lands in inbox.
- `bd create "Title" --path @km/beads/foo` → km canonical: file at `@km/beads/foo.md`.
- `bd create "Title" --id @km/beads/foo` → bd compat: same as --path.
- `bd create "Title" --parent @km/beads --id foo` → bd compat split form.
- `bd create "Title" --path @km/beads/foo --id @km/other/bar` → warns, --path wins.
- `bd create "Title" --path @km/beads/existing-foo` → fails clearly when file already exists.

Resolver matrix tests (extend `packages/km-beads/tests/resolve-id.property.test.ts`):

- Foreign-vault sigil disambiguation under cross-prefix collisions (already covered by the test that lost its `.fails` marker — keep + extend).
- Path-form without sigil (`scope/slug` as input) → resolved via fs_path suffix match.
- ULID input → direct pkey lookup.
- Legacy bd-form alias → json_each scan over data.aliases.
- Path-form vs alias collision → path-form wins (resolveNode is step 2; alias is step 3).
- Missing input (`bd show wrong-id`) → returns null without hitting the json_extract fallback if test setup uses file-materialized fixtures.

End-to-end via `/explore` on real-data copy:

- Copy vault snapshot to `~/tmp/explore-bd-create-<date>/`.
- Run `bd create` with the matrix above.
- Inspect `state.db` and on-disk files to confirm shape.
- Compare resolved beads via `bd show` to catch silent fallbacks.

### 3. Migrate test fixtures off raw-addNode-with-data.id

Add a helper to the test surface (probably `packages/km-beads/tests/test-helpers.ts` or extend an existing one):

```typescript
/**
 * Seed a bead via file materialization — mirrors production (renderBeadFile
 * + writeFileSync + repo.sync()) instead of raw addNode-with-data.id.
 *
 * Use this in new tests. Tests still using raw addNode are tolerated by
 * the resolveShortId step-4 compat fallback today, but that fallback is
 * scheduled for removal once @km/beads/data-id-stop-writing lands.
 */
export function seedBead(
  repo: Repo,
  path: string,         // e.g. "@km/beads/foo"
  options?: { title?: string; type?: string; priority?: string },
): { nodeId: string; filepath: string }
```

Migrate the 3 test files that use raw addNode-with-data.id to use `seedBead`:
- `apps/km-cli/tests/resolve-task.test.ts`
- `apps/km-cli/tests/bd-close-resolver-symmetry.test.ts`
- (any other files in the audit)

After migration, the resolveShortId step-4 compat fallback (added in `4621393af`) becomes deletable. **Don't delete it in this bead** — that's `@km/beads/data-id-stop-writing` territory. But assert via test that NEW fixtures don't depend on it.

## Acceptance

- Audit checklist completed; brittle tests flagged for migration.
- New regression tests in `apps/km-cli/tests/bd-create-arg-shapes.test.ts` cover at least the 9 CLI input cases above. All pass.
- New resolver matrix tests in `packages/km-beads/tests/resolve-id.property.test.ts` cover the 6 listed resolver paths. All pass.
- `seedBead()` helper exists; at least 1 test file migrated to use it as proof-of-shape.
- `/explore` session on a real-data copy executes the CLI matrix and compares against expectations. Findings logged in this bead's notes.

## Workflow

This bead's implementation MUST happen in a worktree (per `.claude/skills/worktree/SKILL.md` + the user's 2026-04-30 direction). Steps:

1. `bun worktree claim @km/beads/path-name-id-test-bolster` — picks up a `wt<N>` slot.
2. cd into the worktree, do all work there.
3. After acceptance criteria pass: merge the worktree branch back to main, release the slot.

Tests + the `/explore` finding both run inside the worktree — never on main repo's working dir.

## Related

- Parent epic: `@km/all/path-name-id-redesign`
- Sister beads (deferred until tests are solid): `@km/beads/data-id-stop-writing`, `@km/beads/frontmatter-path-rename`, `@km/all/rename-content-cascade`
- /pro review 2026-04-30 (GPT-5.4 Pro + Kimi K2.6 + Grok 4 + Gemini 3 Pro) — found the gaps this bead closes.
