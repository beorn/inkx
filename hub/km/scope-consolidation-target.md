# Scope Consolidation — Target Inventory

Tracking bead: `@km/infra/scope-consolidation`
Generated: 2026-05-06 from filesystem scan of `@km/**/*.md` (546 open beads across 30 scopes).

## Decisions captured

- `@km/flexily` stays its own scope (own vendor package, own roadmap).
- `@km/tribe` owns recall + memory + bear-daemon work.
- `@km/agent-view` → close + drop. Silvercode replaces it; the underlying `apps/km-agent-view/` is being absorbed.
- `@km/logview` → close. All 4 children are already `[x]`; only the parent epic is open.
- `@km/bear` → close. All 7 phase children are already `[x]`; the unification work was done.
- No new `@km/core` scope. Core packages keep their own scopes.

## Target scope set (19)

These are the scopes that retain open beads after consolidation. Each = a real package or a real cross-cutting bucket.

| Scope          | Today   | After       | Notes                                                                                                                                                                                                                              |
| -------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @km/silvery    | 209     | ~215        | + items relocated from @km/all                                                                                                                                                                                                     |
| @km/tui        | 61      | ~61         | km-tui app — stays as-is                                                                                                                                                                                                           |
| @km/silvercode | 56      | ~58         | + agent-harness, + 1 inbox                                                                                                                                                                                                         |
| @km/infra      | 30      | ~38         | + items from @km/all, + vitestx, + tools subset                                                                                                                                                                                    |
| @km/market     | 29      | ~36         | + items from @km/all (incl. silvery launch + packages-licensing)                                                                                                                                                                   |
| @km/tribe      | 26      | ~28         | + recall-related from bearly, + 1 inbox                                                                                                                                                                                            |
| @km/bearly     | 19      | 19          | as-is                                                                                                                                                                                                                              |
| @km/loggily    | 2       | ~4          | absorbs @km/logger                                                                                                                                                                                                                 |
| @km/termless   | 13      | 13          | as-is                                                                                                                                                                                                                              |
| @km/storage    | 13      | ~17         | + tree, + storage-8, + ast-alignment from all                                                                                                                                                                                      |
| @km/all        | 42      | ~12         | slim to true cross-cutting only                                                                                                                                                                                                    |
| @km/terminfo   | 9       | 9           | as-is                                                                                                                                                                                                                              |
| @km/flexily    | 5       | 5           | as-is                                                                                                                                                                                                                              |
| @km/markdown   | 2       | 2           | as-is (own vendor package)                                                                                                                                                                                                         |
| @km/board      | 2       | 2           | as-is (own package)                                                                                                                                                                                                                |
| @km/cli        | 2       | 1           | km-cli app — task-bd-collapse moves to @km/bd-compat                                                                                                                                                                               |
| @km/bd-compat  | 0 (new) | ~5          | new scope for bd compatibility shim work; absorbs cli/task-bd-collapse + tools/bd-*                                                                                                                                                |
| @km/mdtest     | 0 (new) | 1+          | new scope for mdtest package; absorbs vitestx/mdtest                                                                                                                                                                               |
| @km/import     | 0 (new) | 0 → growing | new scope anchor for km import <source> work (bd, asana, github, linear, …). Closed history under cli/ (migrate-to-import-bd, comment-parse, attachment-links) can be retroactively moved if useful, otherwise just for new beads. |

**Closed/absorbed:** `@km/bear`, `@km/agent-view`, `@km/logview`, `@km/agent-harness`, `@km/tools`, `@km/tree`, `@km/vitestx`, `@km/loggily`, `@km/logger`, `@km/storage-8`, `@km/shared`, `@km/session`, `@km/review`, `@km/inbox` (triaged, not closed as scope).

## `@km/all` → re-categorize (42 → ~12)

The big migration. Each line: current title → proposed target scope.

### → `@km/silvery` (6)

- `sterling` — Sterling design system — tracking epic [P1]
- `codepath-collapse` — [epic] Codepath collapse — delete dead/dual paths [P3]
- `owned-divergence` — [epic] Owned divergence — workarounds we maintain forever [P3]
- `surface-freeze` — Surface freeze: no new view modes / node types until W3 omnibox + W7 selection close [P2]
- `docs-dimcolor-drift` — Doc drift: visual-spec/design/rendering still reference removed dimColor prop [P3]
- `tea-discipline-enforce` — Enforce TEA discipline across all interactive subsystems (lint rule + migration plan) [P2]

### → `@km/market` (7)

- `silvery-launch-w0-w3` — Silvery launch — Week 0-3 execution epic [P1] (orchestrates the launch from `hub/km/design/licensing-strategy.md`; not framework engineering)
- `silvery-packages-licensing-2026-04-27` — Per-package licensing analysis: silvery + terminfo + termless + 60 others [P2] (legal/positioning input to launch)
- `announce` — Public GitHub presence and community setup for silvery and flexily [P3]
- `vision-reframe-2026-04-27` — Vision reframe: km as plan+doc surface, tribe as coordination substrate [P2]
- `kilo-opencode-fork-2026-04-27` — Doc updates: Kilo Code is now an opencode fork [P3]
- `coding-agent-landscape-2026-04-27` — Coding-agent competitive landscape: deep research + /pro enrichment [P3]
- `oss-vs-private-2026-04-27` — Strategic: OSS vs private across silvery/tribe/km/silvercode/agentroom [P2]

### → `@km/infra` (15) — incl. all test-architecture work

Rationale: test infra/architecture is cross-package but bounded — belongs in `@km/infra`, not `@km/all`. Per-package test beads (silvery/*, silvercode/*, bearly/* etc.) stay in their scope.

- `align-vendor-deps` — Align vendor/* dep versions with km root [P3]
- `doc-edit-safety` — Encode doc-edit safety rule: never use perl/sed for markdown with pipe-heavy content [P2]
- `signal-handler-registry` — Signal handler dependency registry [P2]
- `pre-existing-type-errors` — Fix all pre-existing type errors (0 baseline) [P2]
- `bench` — Benchmarking & perf observability [P2 epic]
- `interaction-test-project` — Add 'interaction' vitest project for feature⊕feature property tests [P2]
- `typecheck-baseline-drift` — 8 new typecheck errors after Phase 3 merges [P2 bug]
- `roadmap-integrate` — Integrate docs/roadmap.md into docs/backlog.md (or retire) [P3]
- **`test-system`** [P0 wip epic] — Strictest — km's testing system (parent of next 3)
- **`test-system/p4-invariants`** [P2] — Phase 4: Content stability invariant + property-based tier
- **`test-system/p5-mece`** [P2] — Phase 5: MECE reorg — consolidate tests from ~130 to ~55-60 files
- **`test-system/p6-api`** [P2] — Phase 6: TestApp API refinement
- **`test-pro-findings`** [P1] — Pro review findings — semantic model, differential tests, generated sequences, matchers
- **`test-trace-replay`** [P3 epic] — Trace-replay testing — action traces as the test model
- **`board-test-migration`** [P3] — Migrate board behavior tests from km-tui to km-board
- **`board-test-split`** [P3] — Split board-test.ts into modules + namespace assertions

(was previously assigning board-test-* to `@km/tui` — moved here because they're test-architecture work, not km-tui app code.)

### → `@km/storage` (3)

- `ast-alignment` — Should km-ast types match KNode? Should content be an AST? [P3]
- `reactive-tree-library` — Extract reactive-graph as vendor/reactive-tree — infrastructure library [P2]
- `connector-matrix` — @km/connector-matrix — Matrix homeserver sync [P3] (data sync = storage layer)

### → `@km/silvercode` (1)

- `autolinks-extraction` — Extract smart-link infrastructure into shared package (silvercode + km + website) [P3]

### → `@km/tui` (3)

- `board-test-migration` — Migrate board behavior tests from km-tui to km-board [P3]
- `board-test-split` — Split board-test.ts into modules + namespace assertions [P3]
- `plugin-composability` — Review all km-* packages for plugin composability — withSync, withEventLog, with* [P2]

### → `@km/tribe` (1)

- `fiduciary-verify-claim` — Fiduciary mode — re-verify numbers/dates against primary source [P2]
  - (cross-scope sibling of tribe activity-log work per `@km/tribe.md`)

### Stay in `@km/all` — true cross-cutting (12)

- `(scope epic)` — Cross-cutting: keybindings, code quality, multi-package
- `plateau` [P0] — Quality Plateau — full-stack roadmap to architectural completeness
- `plateau-90` [P2] — Structural hardening program — pro/Kimi-corrected
- `shared-substrate-review` [P0] — Shared substrate across km + kimmi + cloudi
- `fix-sweep-0426` [P1 wip] — Fix sweep 2026-04-26 — supervisor redesign + 83 test failures + 210 typecheck errors
- `test-system` [P0 wip + 3 children: p4-invariants, p5-mece, p6-api] — Strictest — km's testing system
- `test-pro-findings` [P1] — Pro review findings — semantic model, differential tests, generated sequences
- `test-trace-replay` [P3] — Trace-replay testing — action traces as the test model
- `vorg` [P2 epic] — Virtual Org — skill/agent/asset architecture framework
- `universal-editor` [P4] — Universal structured document editor
- `upstream-waiting` [P3 epic] — Upstream-blocked items — review monthly

(Net: 12 if you count `test-system` + 3 sub-beads as 4. Could split `test-system/*` into `@km/vitestx` if vitestx survives, but recommendation is to absorb vitestx → infra and keep test-system in all because it's cross-package.)

## Small scopes — fold to:

### `@km/agent-harness` (1) → `@km/silvercode`

- `per-turn-abort` — agent-harness: per-turn abort / interrupt API [P2]

### `@km/tools` (5) → split: `@km/bd-compat` (3 + epic close) + `@km/tribe` (1)

→ `@km/bd-compat` (new scope — bd compatibility shim work):

- `bd-api` — Spec: km bd CLI wrapper covering full bd API surface [P4]
- `bd-cli-sync` — km bd: full capability sync — search, count, defer, reopen, graph [P4]
- `bd-api/1-km-bd-tier-5-proxy-passthrough-for-advanced-bd-com` — proxy passthrough [P4]

→ close:

- `(scope epic)` — km CLI tools & agent capabilities [P3 epic] — too vague; subsumed by `@km/cli` and `@km/bd-compat`

→ `@km/tribe` (memory infrastructure):

- `recall-enhance` — Agent memory: implement Cloudi ADR01 SPO memory system for km [P4]

### `@km/tree` (3) → `@km/storage`

- `(scope epic)` — Tree layer (KNode outliner, refs, operations) [P3]
- `outliner-reshape` — Reshape withOutliner: method bag → (state, op) → [state, effects] [P3]
- `refs` — Phase 5a: Refs — auto-updating position handles [P4]

### `@km/vitestx` (3) → split: `@km/infra` (2) + `@km/mdtest` (1)

→ `@km/infra` (test framework infra):

- `(scope epic)` — vitestx test framework & infrastructure [P3]
- `ai` — vitestx: AI mode LLM integration [P4]

→ `@km/mdtest` (new scope, mdtest is its own package):

- `mdtest` — vitestx: mdtest integration as vitest plugin [P4] (rename to `@km/mdtest/vitest-plugin`)

### `@km/loggily` (2) → keep as scope (absorbs `@km/logger`)

- `(scope epic)` — loggily [P3]
- `otel-compat` — OpenTelemetry compatibility layer [P4]

### `@km/logger` (2) → `@km/loggily`

logger is the lower-level lib, loggily the higher-level interface — keep the family together as one scope.

- `(scope epic)` — logger-epic [P3] (close; subsumed by loggily epic)
- `metrics` — Phase 3: Metrics — counter/gauge/histogram via ?. zero-overhead pattern [P4]

### `@km/shared` (1) → `@km/silvercode`

- `text-render-package` [P1 wip] — Extract km-tui text pipeline into shared package — silvercode adopts

### `@km/session` (1) → close

- `0428-evening` [P2 wip] — Session log: Wave 1+2 silvercode/silvery integration — sessions are ephemeral; close after the active sweep finishes

### `@km/review` (1) → `@km/silvery`

- `silvery-gap-analysis` [P2] — Gap analysis: km vs silvery — what it takes for km to truly leverage silvery

### `@km/cli` (2) → split: 1 stays in cli, 1 → `@km/bd-compat`

→ `@km/bd-compat` (the bd-compatibility-shim work):

- `task-bd-collapse` [P1] — Collapse `km bd` into `km task` + `km` generic verbs; bd becomes thin back-compat shim

→ stays in `@km/cli` (km-cli app bug):

- `segfault-memory-mode` [P2 bug] — km view segfaults on non-vault cwd (memory mode)

### `@km/storage-8` (1) → `@km/storage`

- `(scope epic)` — Supertags: Typed Sigil Links with Property Schemas [P4]
  - rename to `@km/storage/supertags`

### `@km/inbox` (5) → triage individually

- `1x2va` — Recall ambient adapter — real query path + controller hook [P2 feature] → **`@km/tribe`**
- `aehwy` — Evaluate fallow.tools for km static analysis [P3 task] → **`@km/infra`**
- `code` — Code: agent workspace on silvery [P2 epic] → **`@km/silvercode`** (if it duplicates silvercode, close instead)
- `l98bq` — km enrich: LLM-powered backlink and timeline enrichment [P1 task] → **`@km/storage`** (or `@km/tribe` if framed as memory enrichment)
- `vlmw` — Support task checkboxes in headings for issue files [P2 feature] → **`@km/markdown`** or **`@km/storage`**

## Close / drop

| Scope                                                | Action       | Reason                                                                                          |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| @km/bear (epic only — children all [x])              | close        | Workspace-daemon plan shipped across 7 phases; future bear work tracked in @km/tribe            |
| @km/agent-view (epic only — child mvp-design is [x]) | close + drop | Silvercode replaces it; apps/km-agent-view/ being absorbed                                      |
| @km/logview (epic only — 4 children all [x])         | close        | All 4 logview beads done; future logview work tracked in @km/silvery/showcase-logview if needed |

## Deferred / TBD

- **Big retained scopes' internal organization.** `@km/silvery` (209 open) has implicit sub-themes (`tea/*`, `ag-canvas/*`, `mouse-*`, `paint-clear-*`, `scope-phase-*`, `comp-*`, `examples-*`). Worth grouping under sub-epics (`@km/silvery/tea`, `@km/silvery/canvas`, `@km/silvery/mouse`, etc.) — not part of this consolidation; do as a follow-on within the silvery scope.
- Same for `@km/tui` (60 open) — could group under `@km/tui/omnibox-*`, `@km/tui/tea-*`, `@km/tui/quality-plateau`, `@km/tui/cards-*`.
- `@km/silvercode` (56 open) — `acp-comp-*`, `ambient-*`, `signal-hang-*`, `test-*` clusters worth sub-epics.

## Migration plan

1. **Close the 3 dead epics first.** `km bd close @km/bear @km/agent-view @km/logview` with reasons. Lowest risk, immediate noise reduction.
2. **Fold tiny scopes** (one scope per commit, in this order): `agent-harness`, `vitestx`, `loggily`, `logger`, `shared`, `review`, `tree`, `storage-8`, `tools`. Each = ~5 `km bd rename` invocations + commit.
3. **Triage `@km/inbox`** — 5 beads to relocate.
4. **Migrate `@km/all` → 6 target scopes.** ~30 renames. The big lift.
5. **Update skill doc** `pm/SKILL.md` "Scope Epics" table to match the 15-scope set.
6. **Verify acceptance**:
  - `find @km -maxdepth 1 -name "*.md" | xargs grep -l "^# \[ \]" | wc -l` ≤ 15 (open scope-epic files at top level)
  - `awk -F\\t '$1=="all"' /tmp/km-flat.tsv | wc -l` ≤ 15 (open beads in all)
  - `km bd show @km/bear @km/agent-view @km/logview` → all status=closed

## Known blockers

- ✅ ~~`km bd list --json` is broken: `--status open` returns `[]`; subtree beads (silvery/tui/storage/etc.) silently omitted from dump.~~ **Fixed 2026-05-06** in this same session:
  - Root cause 1: root program `-s, --silent` was shadowing all subcommand `-s, --status` short flags. Dropped the `-s` short alias in `program.ts:109` (kept `--silent` long form; `-q, --quiet` already covers verbosity reduction).
  - Root cause 2: `--status open` did literal exact-match against `t.item.task.status`; "open" is not a status, it's UI shorthand. Added "open" alias in `filterTasksByStatus` (`apps/km-cli/src/commands/tasks/list-plan.ts`) → matches todo OR wip OR blocked.
  - Verified: `km bd list -s todo --json` now returns 3879 (was 7); `km bd list --status open --json` returns 3934 (was 0).
  - Subtree-beads omission was actually index staleness — DB now has 209 silvery beads correctly indexed; not a bug.
- `km bd rename` is the canonical relocate command per skill doc — verify it correctly updates `id:`, `aliases:`, deps, wikilinks. Spot-check after first batch (the small-scope folds) before doing the `@km/all` migration.
- Minor: `km bd create --type epic` writes `#epic` inline tag in title but doesn't set `type: epic` in frontmatter; `km bd show` displays `Type: task` (default). Cosmetic — not a blocker. File as `@km/bd-compat/create-type-frontmatter` when convenient.

## Open decisions

- [x] `bd-*` subset of `@km/tools` (3 beads) → `@km/bd-compat` (new dedicated scope, plus `task-bd-collapse` from cli)
- [x] `@km/inbox/code` epic → **move to `@km/silvercode/code` then close**. Body literally says "Silvercode and related agent workspace infrastructure"; was an earlier name for the same project. Move (not just close) so history lives under the right scope.
- [x] `@km/inbox/l98bq` (km enrich, P1) → **`@km/storage`**. Re-read of the description: it's a `km enrich` CLI that scans vault markdown changes and writes back (entity resolution against vault nodes, timeline-entry appending, date→journal backlink resolution). Vault data manipulation, not agent-memory infrastructure. Earlier "memory" framing was wrong.
- [x] `@km/all/test-system` cluster (parent + 3 children) → **stay in `@km/all`**. Active P0 epic (29 commits on feat/test-system branch); touches km-tui, @km/storage, vitestx, omnibox, bench. Genuinely cross-package — adding `@km/test-system` would create scope ceremony for ~4 beads that close once the rebase finishes. vitestx (framework) ≠ test-system (strategy / MECE / four-tier hierarchy).

