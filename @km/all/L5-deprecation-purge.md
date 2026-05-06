---
id: "@km/all/L5-deprecation-purge"
type: refactor
priority: P2
created_at: 2026-05-06T23:55:00.000Z
parent: "@km/all"
---

# [ ] L5 plateau — purge deprecated parallel concepts (data.*, @deprecated, legacy hooks) #refactor #P2

Reach the L5 quality plateau (per `docs/lessons/quality-plateau-refactoring.md`): **the live pipeline uses ONE concept, not two.** Currently we have two consumer paths for sigil mentions (`data.mentions` JSON LIKE vs. `links` table), two paths for tags (`data.tags` vs. `links`), two `priority` paths (`KNode.priority` field vs. `getNodePriority()`), and a handful of `@deprecated` shims kept "for back-compat." Per `docs/lessons/refactoring.md`: **delete old code first, fix breaks second.** This bead does that, in disciplined phases.

## Inventory — what's deprecated and how it must die

### Group A — `data.*` parallel index (the user-flagged one)

Source of truth = `links` table (per `docs/design/model/klink.md`). The JSON sidecars are stale parallel caches.

| Field | Writer | Consumers (must switch) | Status |
|---|---|---|---|
| `data.mentions` | `packages/km-markdown/src/extensions/km-refs.ts:26` | `packages/km-storage/src/query.ts:482` (buildRefCondition queries JSON LIKE), `apps/km-cli/src/commands/show.ts:278` (display) | **Live; primary user-flagged target** |
| `data.projects` | `packages/km-markdown/src/extensions/km-refs.ts:27` | Same as mentions (just different JSON path) | Live |
| `data.tags` | `packages/km-markdown/src/extensions/km-refs.ts:25` | `packages/km-storage/src/query.ts:484` (`jsonPath = "tags"`), `apps/km-cli/src/commands/show.ts` | Live (despite earlier "drop-data-tags" — that only removed YAML frontmatter persistence; runtime parse-time write still happens) |
| `data._allMentions` / `data._allProjects` | `packages/km-markdown/src/ast2nodes.ts:1287` (`aggregateRefs`) | `apps/km-tui/src/views/detail-pane-items.ts:41-42` (lists them as HIDE-from-display, so essentially dead consumer) | Live but consumer-dead — pure overhead |
| `extractChangedAttrs` regex parallel pass | `packages/km-storage/src/db/rules.ts:785` (incremental rule-eval signature derivation) | Used during rule materialization | Tightly coupled to `data.*` deprecation — once consumers query links, this can switch too |

The Asana import adapter usages at `apps/km-cli/src/import/convert.ts` etc. of `data.projects` are SEPARATE (Asana-source project metadata, not km canonical) — leave alone.

### Group B — `@deprecated` JSDoc-marked code (production)

Per refactoring.md §4: **`@deprecated` annotations don't work — LLMs ignore them. Delete the API.**

| File:Line | What | Replacement | Notes |
|---|---|---|---|
| `packages/km-core/src/types.ts` (KNode.priority field) | Legacy column-mirror | `getNodePriority(node)` | Schema column dropped at v11; field stays |
| `packages/km-core/src/path.ts` `pathOf` | Wrong-cell-of-2x2 helper | `fsPathOf` | Tracked as `@km/all/path-name-orthogonal-vocabulary` |
| `packages/km-storage/src/repo/loader.ts` `loadRepo` shim | Singleton wrapper | `createRepo()` | Existing migration debt |
| `packages/km-fs-mount/src/watch/writequeue.ts` `OperationResult` | Type alias for tests | `TreeOpResult` | Pure rename |
| `apps/km-cli/src/commands/tasks/queries.ts` `getTasksUnderNode`, `taskIsBlocked`, `findTaskByPathOrId` | Pre-Task-factory helpers | `Task.under(repo, id)`, `Task.isBlocked(node)`, `Task.findByPathOrId(...)` | CLI consumers |
| `apps/km-tui/src/config-persist.ts` re-exports | Re-export shim | Direct `@km/commands` import | |
| `apps/km-tui/src/state/ui-reducer.ts` `FILTER_ROWS` | Type alias | `VIEW_DIALOG_ROWS` filter inline | |
| `apps/km-tui/tests/helpers/test-app.ts` `dispatch`, `toContainText`, `notToContainText` | Test escape hatches | `press()`, `command()`, `expect(app).toContainText(...)` | Test-helper migration; non-blocking |

### Group C — Legacy bd hook (post-2026-04-29 cutover)

`.git/hooks/prepare-commit-msg` carries the `--- BEGIN BEADS INTEGRATION v1.0.0 ---` block from the external `bd` (Go) binary. `km bd` is the canonical implementation since 2026-04-29; the legacy hook auto-stages files (filed as `@km/beads/prepare-commit-msg-hook-auto-stages`). Removal:

- Delete the `--- BEGIN/END BEADS INTEGRATION ---` block from `.git/hooks/prepare-commit-msg`
- Verify `km bd hooks install` (if it exists) doesn't replicate the same auto-stage behavior
- Document the workaround in `.claude/skills/git/commit.md` regardless (use `git commit -o <file>` for explicit pathspec)

## Phased plan (Update → Absorb → Purge → Remove → Fix)

### Phase 1 — Switch query executor to read from `links` table (Group A foundation)

**Goal**: `buildRefCondition` queries the `links` table instead of `data.*` JSON. This is the unblocker — once consumers don't need `data.*`, the writes can stop.

- `packages/km-storage/src/query.ts:482` `buildRefCondition` rewrite:
  - Was: `data.mentions LIKE '%"agent/3"%'`
  - Now: `EXISTS (SELECT 1 FROM links WHERE host_id = nodes.id AND href = 'km:@agent/3')`
  - Tag form: `href = 'km:%23bug'` (per klink.md percent-encoding for `#`)
  - Project form: `href = 'km:+cleanup'`
- Update `apps/km-cli/src/commands/show.ts:278-280` to read mentions/projects from `links` table query (or delete the block entirely if no UX value)
- Update `apps/km-tui/src/views/detail-pane-items.ts:41-42` `_allMentions`/`_allProjects` HIDE-list — once `aggregateRefs` is removed, these fields don't exist; delete the entries

**New tests**: `packages/km-storage/tests/query/refs-from-links.test.ts` — proves `@person`, `#tag`, `+project` queries return matching nodes via the links join (replaces existing `data.mentions LIKE` test paths).

**Definition of Done** (per refactoring.md):
- [ ] Query executor uses links table for ref filters; `data.mentions LIKE` SQL gone from query.ts
- [ ] `bd show` displays mentions/projects (or doesn't); no `data.mentions` / `data.projects` reads in CLI/TUI
- [ ] All existing query tests still pass; new tests cover the links-join path
- [ ] `grep "data\.mentions\b" packages/ apps/ --glob '!*.test.ts'` returns ONLY the writer (km-refs.ts) and stub-comment lines

### Phase 2 — Stop writing `data.*` from the parser (Group A purge)

**Depends on**: Phase 1 (consumers must be off `data.*` first).

- `packages/km-markdown/src/extensions/km-refs.ts:25-38` — DELETE the writes to `node.data.tags`, `node.data.mentions`, `node.data.projects` and the listItem hoist. The hashtag emission via `collectSigilLinks` already lands rows in `links` table (Phase 1.1 of `@km/agent/sigil-boards` already shipped).
- `packages/km-markdown/src/ast2nodes.ts:1244-1296` `aggregateRefs` — DELETE entirely. Aggregates are derivable from `SELECT DISTINCT href FROM links WHERE host_id IN <descendants>` if/when needed; today there's no consumer.
- `packages/km-storage/src/db/rules.ts:785` `extractChangedAttrs` regex parallel pass — DELETE; replace with a `links`-table delta lookup (or accept full re-eval since rule signatures already use parsed query refs).

**Definition of Done**:
- [ ] `grep "data\.(mentions|tags|projects)\s*=" packages/ apps/` returns 0 hits in production code
- [ ] `grep "_allMentions\|_allProjects"` returns 0 hits except in DB migration / strip code
- [ ] Full test suite green (1295+ storage, 757+ markdown, 879 km-cli)

### Phase 3 — Strip `data.*` from existing nodes (one-shot DB migration)

**Depends on**: Phase 2 (writer is gone — re-parse won't re-add).

- New SCHEMA_VERSION migration in `packages/km-storage/src/db/schema.ts`:
  ```sql
  UPDATE nodes
  SET data = json_remove(data, '$.mentions', '$.projects', '$.tags',
                                '$._allMentions', '$._allProjects')
  WHERE data IS NOT NULL
    AND (json_extract(data, '$.mentions') IS NOT NULL
      OR json_extract(data, '$.projects') IS NOT NULL
      OR json_extract(data, '$.tags') IS NOT NULL
      OR json_extract(data, '$._allMentions') IS NOT NULL
      OR json_extract(data, '$._allProjects') IS NOT NULL);
  ```
- DATA_VERSION bump (the one that re-extracts content; this isn't a re-extract, but it re-canonicalizes data shape)

**Definition of Done**:
- [ ] Migration runs cleanly on the user's vault (~3920 open beads + closed)
- [ ] `SELECT COUNT(*) FROM nodes WHERE json_extract(data, '$.mentions') IS NOT NULL` returns 0
- [ ] `km sync --from-fs` after migration produces zero new `data.mentions` rows (Phase 2 enforced)

### Phase 4 — Delete dead extractor code (Group A cleanup)

**Depends on**: Phase 3.

- `packages/km-markdown/src/parser.ts` `extractMentions`, `extractProjects` named exports — if no callers remain after Phase 2, DELETE
- `packages/km-markdown/src/index.ts` re-exports — drop deleted symbols
- `packages/km-storage/src/index.ts:215` re-export of `extractMentions` — drop

**Definition of Done**:
- [ ] `grep "extractMentions\|extractProjects" packages/ apps/` returns 0 hits (or only test files testing the regex itself, which can be inlined)
- [ ] No re-exports of deleted symbols

### Phase 5 — Group B: `@deprecated` JSDoc cleanup

Each entry in the Group B table above is its own micro-phase (independent file scope, none block the others). Process: delete the deprecated symbol, fix the resulting tsc errors with the listed replacement. Order by blast-radius:

- 5a. `OperationResult` alias — pure rename, 1 file
- 5b. `KNode.priority` field — touches getter sites; replace with `getNodePriority(node)`
- 5c. `pathOf` → `fsPathOf` — tracked as `@km/all/path-name-orthogonal-vocabulary`
- 5d. `loadRepo` shim → `createRepo` (existing migration debt)
- 5e. `getTasksUnderNode` / `taskIsBlocked` / `findTaskByPathOrId` → `Task.*` factory
- 5f. `config-persist.ts` re-exports → direct `@km/commands` imports
- 5g. `FILTER_ROWS` → inline `VIEW_DIALOG_ROWS` filter
- 5h. (test-helper) `dispatch` / `toContainText` / `notToContainText` → canonical matchers

**Definition of Done** (per micro-phase):
- [ ] `@deprecated` JSDoc removed because the symbol itself is gone
- [ ] `grep "<deprecated-symbol>"` returns 0 hits in production code
- [ ] Tests still green

### Phase 6 — Group C: legacy bd hook removal

- Edit `.git/hooks/prepare-commit-msg`: remove the `--- BEGIN/END BEADS INTEGRATION v1.0.0 ---` block
- Verify the `km bd hooks` install path (if exists) replaces with a non-auto-staging version; if it doesn't exist, the hook stays absent
- Document workaround (`git commit -o <file>` for explicit pathspec) in `.claude/skills/git/commit.md`
- Close `@km/beads/prepare-commit-msg-hook-auto-stages` with the workaround documented

**Definition of Done**:
- [ ] `cat .git/hooks/prepare-commit-msg` shows no `BEADS INTEGRATION` block
- [ ] Test commit with untracked bd-managed files in the working tree → only explicitly staged files land in commit
- [ ] `.claude/skills/git/commit.md` documents the `git commit -o` workaround
- [ ] `@km/beads/prepare-commit-msg-hook-auto-stages` closed

## Cross-cutting acceptance — when is the L5 plateau reached?

After all 6 phases:

- [ ] `grep "data\.\(mentions\|projects\|tags\|_allMentions\|_allProjects\)\b" packages/ apps/ --glob '!*.test.ts'` returns 0 hits
- [ ] `grep "@deprecated" packages/ apps/` returns 0 hits in production code (test-helper migrations are non-blocking)
- [ ] `cat .git/hooks/prepare-commit-msg` doesn't reference external bd
- [ ] `bun fix && bun run test:all` green
- [ ] `bun run test:strictest` green (every-action invariants)

## Risk register

- **Phase 1 perf**: links-table EXISTS query may be slower than `data.mentions LIKE` if indexing is wrong. Verify with bench (`bun run bench query`) before/after; expect parity (`idx_links_href` exists per schema.ts).
- **Asana import collision** (`data.projects` reads in import-adapter): NOT the same field — adapter uses local Asana metadata. Leave alone; assert no collateral damage via grep audit.
- **Phase 3 migration on stale dbs**: if a user runs `km` with an older DATA_VERSION, the migration runs once. Test with a real-vault snapshot before shipping.
- **Phase 5 `KNode.priority` removal**: many callers; needs a sweep. Use `bun vendor/bearly/tools/refactor.ts` for the mechanical part if pattern is consistent enough.

## Tracking

- This bead = umbrella; close when all 6 phases done
- Group A subsumes the existing `@km/all/dissolve-data-tags-to-links` (fold in)
- Group A also subsumes the (already partly shipped) `@km/all/drop-data-tags` (closed; informs Phase 2)
- Group C subsumes `@km/beads/prepare-commit-msg-hook-auto-stages`

## Why this matters (for future-self / agents reading this cold)

The L5 plateau is not "no legacy code anywhere" — it's "the live pipeline uses one concept, not two." Today every keypress that triggers a sigil-mention query goes through both `data.mentions` LIKE (the parallel cache) AND the links table (the canonical store) — depending on which consumer you hit. Two paths means two truths. New agents writing code default to whichever they find first. Deletion is the only sustainable fix; `@deprecated` doesn't work (LLMs ignore it; humans tolerate it).
