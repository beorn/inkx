---
id: "@km/beads/upstream-bd-1/0/3-export-path"
aliases:
  - km-beads.upstream-bd-1.0.3-export-path
  - km-beads-upstream-bd-1-0-3-export-path
created_by: claude:cc081a9a
created_at: 2026-04-28T06:42:31Z
---

# [ ] Remove check-no-stray-issues-jsonl gate when bd >=1.0.3 is universal @km/beads #bug #P3

blocks:: [[@km/all/upstream-waiting]]

Workaround tracking. bd v1.0.2's pre-commit hook resolves `export.path = "issues.jsonl"` against the worktree CWD instead of `.beads/`, causing `git update-index` to add a stray ~9 MB `issues.jsonl` at repo root. Fixed upstream in v1.0.3 (commit d0f0ad6f). Our defense-in-depth: `packages/km-infra/scripts/check-no-stray-issues-jsonl.sh` + matching vitest test, wired into `bun fix` and `test:ci`. Three concurrent agents tripped on this in a single /max session; five prior cleanup commits in main.

Upstream: https://github.com/steveyegge/beads/issues/3311
Status: released-upstream as of 2026-04-27
  - released-upstream: bd v1.0.3 published 2026-04-24; `brew upgrade beads` available locally
  - To reach adopted-locally: every contributor environment must be running >=1.0.3; verify via `bd version` in CI or doctor check
Last checked: 2026-04-27
Escalate by: 2026-10-27

Files affected by the workaround:
- packages/@km/infra/scripts/check-no-stray-issues-jsonl.sh (new — guards against stray issues.jsonl at repo root)
- packages/@km/infra/tests/no-stray-issues-jsonl.test.ts (new — vitest mirror of the shell guard)
- package.json (added check to `fix` and `test:ci` script chains)

Unwind when bd >=1.0.3 is universal:
1. Verify all dev environments are on bd >=1.0.3 (`bd version` in CI; doctor check optional)
2. Delete `packages/km-infra/scripts/check-no-stray-issues-jsonl.sh`
3. Delete `packages/km-infra/tests/no-stray-issues-jsonl.test.ts`
4. Remove the script invocation from `package.json` `fix` and `test:ci` scripts
5. Run `bun fix && bun run test:fast` to confirm both still pass
6. Close this bead with "unwound after bd <verified-version> universal"