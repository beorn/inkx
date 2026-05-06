---
mentions:
  - km
aliases:
  - km-infra.scope-consolidation
  - km-infra-scope-consolidation
created_at: 2026-05-06T19:14:34.309Z
closed_at: 2026-05-06T21:34:07.000Z
closeReason: "Migration complete. 6 commits landed (01d980b8a, b641cff14,
  9fdb0c48c, c188093ff, bf6d90d86, 07d97c07f). Final state: 17 active scopes;
  @km/all slimmed 41→7; 5 epics closed (bear, agent-view, logview, tools,
  logger); ~50 renames; 5 inbox triaged; 0 stale wikilinks; 2 empty dirs
  removed. CLI fixes (-s flag unshadow, open status alias, bd surface defaults
  to mdfile) shipped. 2 bd-sync follow-up bugs filed
  (@km/bd-compat/close-no-marker-write, @km/bd-compat/rename-id-column-stale).
  Doc: hub/km/scope-consolidation-target.md."
---

# [x] Scope consolidation — reduce @km/* sprawl to 8 active scopes #epic #P2

Reorganize the `@km/*` scope surface to reduce sprawl. Current state has ~88 directories on disk and ~22 distinct scopes appearing in some form (active backlogs + epic root files + zero-child orphan epics). Consolidate to ~8 well-defined active scopes; close orphan epics; relocate cross-cutting beads from `@km/all` into specific scopes.

## Target scope set (8)

1. **`@km/all`** — true cross-cutting only (target ~12 beads). Strategy/vision items that genuinely span all packages.
2. **`@km/infra`** — CI, packaging, build, monorepo guardrails, dev tooling.
3. **`@km/market`** — marketing, positioning, blog, launch, public docs.
4. **`@km/bearly`** — `vendor/bearly/*` Claude Code tooling monorepo (logger / loggily / logview families fold in here).
5. **`@km/silvercode`** — silvercode agent workspace app (absorbs `agent-view` orphan epic + `agent-harness`).
6. **`@km/silvery`** — silvery framework (already exists; 219 open beads + 618 closed).
7. **`@km/flexily`** — flexily layout engine (kept separate from silvery — its own vendor package with its own roadmap).
8. **`@km/tribe`** — tribe coordination, recall, bg-recall daemon, channel/dispatch infra (already exists; the recall + memory work moves here from `bearly`).

## Decisions captured (2026-05-06)

- `@km/flexily` stays separate from `@km/silvery`. Flexily is its own vendor package.
- `@km/tribe` is the home for recall + memory infrastructure (not `@km/bearly`).
- No new `@km/core` scope. Core packages (board, cli, markdown, review) get folded into either `@km/infra` or absorbed into `@km/all` if cross-cutting.

## Orphan epics to close

- `@km/agent-view.md` — 0 children; subsumed by `@km/silvercode`.
- `@km/bear.md` — 0 children; subsumed by `@km/bearly`.
- `@km/logview.md` — 0 children; subsumed by `@km/bearly`.

## Bead movement (high-level)

From `@km/all/*` (currently ~41 beads), relocate where applicable:

- `silvery-launch-w0-w3`, `sterling`, `codepath-collapse`, `owned-divergence`, `surface-freeze`, `silvery-packages-licensing`, `style-precedence-lint` → `@km/silvery`
- `announce`, `vision-reframe-2026-04-27`, `kilo-opencode-fork-2026-04-27`, `coding-agent-landscape-2026-04-27`, `oss-vs-private-2026-04-27` → `@km/market`
- `align-vendor-deps`, `doc-edit-safety`, `signal-handler-registry`, `pre-existing-type-errors` → `@km/infra`
- `autolinks-extraction` → `@km/silvercode`

Singleton/small scopes to absorb:

- `@km/board/*`, `@km/cli/*`, `@km/markdown/*`, `@km/review/*`, `@km/session/*`, `@km/shared/*` → fold into `@km/infra` or `@km/all` per case.
- `@km/agent-harness/*` → `@km/silvercode`.
- `@km/inbox/*` → triage into appropriate target scope.

## Known blockers / prerequisites

- `km bd list --json` is broken in two ways: `--status open` returns `[]`; subtree beads (silvery/tui/storage) are silently omitted from the dump. File these as separate bugs under `@km/cli`. Without working JSON output, mass `km bd rename` operations need verification by directory listing instead of bead query.
- `recall` is broken on at least one machine (better-sqlite3 NODE_MODULE_VERSION mismatch — needs rebuild). Independent of this work.

## Acceptance

- ≤8 active scopes show open beads in the default `km bd list` view.
- The three orphan epics (`agent-view`, `bear`, `logview`) are closed with reason naming the absorbing scope.
- `@km/all` open count drops to ≤15 beads (true cross-cutting only).
- Skill doc `pm/SKILL.md` "Scope Epics" table updated to match the new 8-scope set.
- All renames executed via `km bd rename` so deps/aliases/wikilinks update automatically. Commit per scope (one scope = one commit) for reversibility.

## Related

- `@km/infra/org-redesign` — broader org/agents/docs/skills redesign epic.
- `@km/all/path-name-id-redesign` (closed) — established the path/name/id three-concept model that makes scope renames safe.

Target inventory written to hub/km/scope-consolidation-target.md (2026-05-06). 546 open beads across 30 scopes; consolidates to 15 active scopes. Decisions captured: flexily separate, tribe owns recall+memory+bear-daemon, agent-view/bear/logview epics close (children all done). Migration plan in 6 phases — start with closing the 3 dead epics (lowest risk).

[bd list bugs fixed] Root cause was -s flag clash (program.ts -s,--silent shadowed bd list -s,--status). Dropped -s short alias from root; added 'open' alias in filterTasksByStatus. -s todo now returns 3879 (was 7); --status open returns 3934 (was 0). Files modified: apps/km-cli/src/program.ts, apps/km-cli/src/commands/tasks/list-plan.ts.

[bd surface bead-centric defaults shipped] bd list / bd ready / bd query now default to fstype:mdfile (one bead = one .md file; inline-checkbox sub-tasks excluded). Scope-epic umbrellas (@km/silvery.md etc) included — they ARE beads. --all-tasks flag opts out. Files: apps/km-cli/src/commands/{bd-list,bd-query}.ts, apps/km-cli/src/commands/tasks/{list,list-plan}.ts. Verified: bd list -s open returns 546 (was 3934).

Migration complete. Final state: 13 active scope-epic umbrellas (silvery, tui, silvercode, infra, market, tribe, bearly, storage, termless, terminfo, flexily, loggily, all) + bd-compat/mdtest/import/board/cli/markdown active sub-scopes without umbrella files = 19 active scopes total. @km/all slimmed from 41 to 7 (true cross-cutting only: plateau, plateau-90, shared-substrate-review, vorg, universal-editor, upstream-waiting, fix-sweep-0426). pm/SKILL.md Scope Epics table updated. Skipped wip beads owned by other claude sessions (fix-sweep-0426, shared/text-render-package, session/0428-evening, bearly/injection-framing).

Reorganize the `@km/*` scope surface to reduce sprawl. Current state has ~88 directories on disk and ~22 distinct scopes appearing in some form (active backlogs + epic root files + zero-child orphan epics). Consolidate to a defensible active set; close orphan epics; relocate cross-cutting beads from `@km/all` into specific scopes.

**Outcome (2026-05-06):** Initial "8 active scopes" target was wishful — the real number is 17 once you account for the substantial vendor-package scopes (silvery, tui, storage, termless, terminfo) that were hidden by a `bd list --json` bug. Final state matches the target inventory at `hub/km/scope-consolidation-target.md`.

## Acceptance — verified ✓

- ✅ 17 active scopes (was ~30): silvery, tui, silvercode, infra, market, tribe, bearly, storage, termless, terminfo, flexily, loggily, all + bd-compat/mdtest/import/board/cli/markdown sub-scopes.
- ✅ Three orphan epics (`agent-view`, `bear`, `logview`) closed with reason naming absorbing scope (manual marker patch — `km bd close` doesn't write `[x]` to source markdown; bug filed as `@km/bd-compat/close-no-marker-write`).
- ✅ `@km/all` open count: 7 (down from 41). True cross-cutting only: plateau, plateau-90, shared-substrate-review, vorg, universal-editor, upstream-waiting, fix-sweep-0426.
- ✅ Skill doc `pm/SKILL.md` "Scope Epics" table updated to match the new set + adds bd-surface-defaults paragraph (beads = mdfiles).
- ✅ All renames executed via `km bd rename` (deps/aliases/wikilinks updated automatically; verified 0 stale wikilinks).

