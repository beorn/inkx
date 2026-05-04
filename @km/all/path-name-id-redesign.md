---
id: "@km/all/path-name-id-redesign"
aliases:
  - km-all.path-name-id-redesign
  - km-all-path-name-id-redesign
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T10:50:41Z
type: epic
priority: P1
parent: "@km/all"
---

# Path / Name / ID — three-concept canonical model + implementation @km/all #epic #P1

Tracking epic for the 2026-04-30 architectural redesign of bead identity. Design verdict, child beads, and arch retros all live here.

## The verdict (from the /arch session)

Three concepts, distinct (per `docs/design/model/storage.md:761-787`):

| Concept | What | Where stored |
|---|---|---|
| **id** | ULID, opaque, internal — never changes | `nodes.id` (pkey) |
| **name** | path SEGMENT (one slug per node) | `nodes.name` (indexed via `idx_nodes_name`) |
| **path** | composition of names by parent walk; user-facing | DERIVED — composed from `(parent walk + name)`, materialized in markdown for human readers |

**No equation between concepts.** Path is composed FROM names, but path ≠ name. id is internal, distinct from both.

**DB references** (`parent_id`, `host_id`, deps `target`, `embed_of`) → **id only**. No DB-level rename cascade.

**Markdown content** (wikilinks `[[@km/beads/foo]]`, mentions, frontmatter) → **path** for human friendliness.

**CLI** → accepts either form; resolver translates path → id before query.

**Resolution order** (in `resolveShortId`):
1. id (direct ULID match)
2. path (delegate to `repo.resolveNode`, indexed `fs_path` lookup)
3. legacy bd-form aliases (json_each scan over `data.aliases`)
4. compat fallback: `data.id` json_extract scan (for test fixtures; will be removed)

## Arch retros + design records

- `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md` — original /arch run, with audit trail of how the verdict evolved through five user reversals (A → α → β → γ → corrected α-with-clarified-vocabulary)
- `.claude/arch-decisions/_2026-04-30-path-vs-ulid-bundle.md` — Phase 1 bundle (canonical doc reads + close-reason quotes)
- The /big session 2026-04-30 (in conversation history) — verdict that NO new typed wrappers (Path / Name / NodeRef value objects, etc.) are needed; existing string + KNode + KTree namespaces suffice.

## Child beads

### Shipped (commits e540ec95c..3e8673558)

- ✅ `@km/all/architectural-decision-skill` — `/arch` skill + drift-checker + `/max` Step 0 gate (e540ec95c, 23de99e2e)
- ✅ `@km/all/path-derivation-helper` — `pathOf(node)` helper in `@km/core/src/path.ts` + 12 tests (4727f3a4e)
- ✅ `@km/beads/resolver-path-via-name-walk` — `resolveShortId` delegates path-form to `repo.resolveNode` (4727f3a4e)
- ✅ `@km/beads/directory-nesting-bd-create` — `bd create @km/beads/foo --title "..."` path-positional CLI (4621393af)
- ✅ Bonus: `resolver-sigil-ambiguity` — accidentally fixed by the resolveShortId refactor (test `KNOWN BUG: sigil form should disambiguate across foreign prefixes` now passes; `.fails` marker removed)

### Dropped (decided not needed)

- ❌ `@km/storage/parent-name-unique` — fs_path uniqueness is enforced by the OS filesystem; mdsection name collisions are valid. Not needed.
- ❌ Path / Name / NodeRef value objects, PathBuilder, PathDelta, PathScope, PathPattern, PathSegment enum, MaterializedPath, AliasIndex registry, Resolver unifying interface — YAGNI verdict from /big session. Three concepts already modeled correctly via KNode fields + pathOf derivation.

### Backlog (revised through 2026-05-03 — see "Plan corrections" + "2026-05-03 reframe" below)

**Shipped:**

- ✅ `@km/beads/path-name-id-test-bolster` (P0) — regression tests landed in commit `ab0d2f082` (`apps/km-cli/tests/bd-create-arg-shapes.test.ts`, 13 tests across 3 layers).
- ✅ `@km/tree/ktree-path-method` (P2) — `KTree.path(tree, id)` shipped in commit `c8c98bfd1`. Cache-free walk, `KTree.PATH_MAX_DEPTH = 64`.
- ✅ `@km/all/id-name-path-code-cleanup` (P1, **partial**) — 6-site `pathOf()` migration shipped in `c8c98bfd1`. Function-rename sweep moved to a focused sister bead (`@km/all/drop-shortid-concept`). This bead's remaining scope is general id/name/path/ref vocabulary discipline.
- ✅ `@km/storage/parent-name-unique-partial` (P2) — schema v8 partial UNIQUE shipped in commit `6e7846a1d`; predicate hotfix in `fe08e9734` (mdsection has fstype="mdsection", not NULL, so predicate narrowed to explicit on-disk tier list).
- ✅ `@km/all/storage-doc-three-concepts` (P3, **partial**) — `docs/design/model/storage.md` updated in `6e7846a1d` with /pro additions + 2×2 vocabulary in `6986fa6cb` (Phase B1). Per-package CLAUDE.mds + `knode.md` updates still partial.

**Shipped 2026-05-04 (Phase A + Phase B + Phase C):**

- ✅ `@km/storage/extract-resolveref` (P1) — universal `resolveRef(repo, ref)` in `@km/storage` (commit `9b2196021`). 7 new tests at `packages/km-storage/tests/resolve-ref.test.ts`. `resolveShortId` in `@km/beads` keeps step-4 compat fallback as a thin wrapper that delegates steps 1–3 to `resolveRef`.
- ✅ `@km/all/drop-shortid-concept` (P2) — `generateShortId` → `mintBeadName`, `generateCustomId` → `normalizeBdRef` (deviation: name reflects actual behavior — function returns bd-form not path-form, see commit message), `generateSubId` → `mintSubBeadName` (commit `856b1ab38`). Zero external generator callers.
- ✅ `@km/storage/aliases-first-class` (P2) — schema v9 with `node_aliases(node_id, alias)` table + `idx_node_aliases_alias` + INSERT/UPDATE/DELETE triggers + backfill (commit `25b4e256e`). `resolveRef` step 3 now uses indexed lookup. 9 new tests.
- ✅ `@km/storage/seed-file-node-helper` (P2) + `@km/beads/seed-bead-as-thin-wrapper` (P3) — universal `seedFileNode(repo, path, opts)` in `@km/storage/testing` and 11-LOC bd-conventional `seedBead` wrapper in `@km/beads/testing` (commit `e56be3722`). 13 new tests.
- ✅ `@km/all/path-name-orthogonal-vocabulary` (P3) — `pathOf` → `fsPathOf` rename in `@km/core` with deprecated alias, 6 callers migrated, 2×2 vocabulary in `storage.md` and `knode.md` (commits `3c963242b`, `5072218a2`, `6986fa6cb`).
- ✅ `@km/storage/deps-first-class` (P2) — loader-merge: frontmatter `dependencies:` array now feeds `data.props["blocked-by"]` so the existing v7 `deps` trigger indexes both authoring forms. NO new column, NO new table (commit `6e1c2f5ca`). 13 new tests.
- ✅ `@km/all/props-not-frontmatter` (P3) — full sweep across km-board, km-storage, km-tree, km-fs-mount, km-beads, km-cli, km-tui (commits `b98adfec8`, `5f43d546b`, `80864695e`, `abbb811be`, `0ef7af5c4`, `5128745e4`). 22 files changed; before 213 mentions, after 178 — the 178 remaining are legitimate parser-surface references (`splitFrontmatter`, `extractFrontmatter`, `mergeFileFrontmatter`), fixture filenames, local YAML-rendering variables, and km-fs-mount drift-preservation paths that genuinely refer to YAML-on-disk. Vocabulary paragraph added to `docs/design/model/storage.md`.

**Shipped 2026-05-04 (Phase D — frontmatter id field dropped):**

- ✅ `@km/beads/frontmatter-path-rename` (P2) — `renderBeadFile` and `issueToMarkdown` (bd-import) no longer emit the `id:` YAML field (commit `c356e75d9`). The file's path-form IS the canonical id. 9 tests updated to assert absence. Existing rows retain their `id:` YAML as harmless fossils.
- ✅ `@km/beads/data-id-stop-writing` (P2, **partial**) — production write paths no longer emit `id:` (paired with frontmatter-path-rename). The `resolveShortId` step-4 `data.id` json_extract fallback stays for one transitional release; deletable once test fixtures fully migrate to `seedFileNode`.

**Pending (Phase E — drop-data-tags, 3-phase):**

- 📋 `@km/all/drop-data-tags` (P3) — drop the `data.tags` denormalization. Phase A: pass `{ tags: true }` to `extractLinks` in the loader so `#P<n>` / `#<type>` hashtags emitted by `issueToMarkdown` H1 land in the `links` table. Phase B: migrate 4 readers (mutations:206, show.ts:259, agent/queries:130, beads/queries:266) to SELECT FROM links WHERE href = '#PX'. Phase C: stop writing `data.tags`.

**Pending (Phase F — rename-content-cascade):**

- 📋 `@km/all/rename-content-cascade` (P1) — content-layer batch update of wikilinks/mentions when a node's path changes. Background worker subscribing to node-renamed events; persist queue at `.km/rename-queue.jsonl`; crash-resumable. Biggest remaining work — own session recommended.

### YAGNI verdict on new domain interface objects (re-verified 2026-04-30, re-confirmed 2026-05-03)

Three independent arch-agent reviews + two /pro 4-leg reviews converged on the
same verdict: no `Path` brand, no `NodeRef` discriminated union, no
`PathBuilder`/`PathDelta`/`PathScope`/`PathPattern`/`PathSegment`/`MaterializedPath`/`AliasIndex`/`Resolver`
unifying interface. Plain strings + KNode fields + named seam functions
(`pathOf`, `KTree.path`, `resolveRef`) cover every actual consumer.

The 2026-05-03 reframe also dropped a candidate from the GPT-5.4 Pro
review: `node_plane_map(node_id, plane, key)` table for future
multi-plane materialization. Speculative-generality before the second
plane exists; vocabulary > schema for now.

### Dropped (decided not to do)

- ❌ `@km/storage/drop-fs-path-derive-from-name` — DROPPED on /pro review reflection. Reasoning: `fs_path` is a legitimate canonical cache mirrored from the filesystem (which is ground truth, not km). The OS owns file paths; we mirror to `fs_path` for O(log N) queries. The duplication concern applied to `data.id` (TWO places we maintain — JSON + would-be column); `fs_path` is ONE place, kept consistent with the OS. Watcher/reconciler/move-detection all need it. Performance: O(log N) index hit vs O(depth) recursive CTE per resolve. **Formalize fs_path as canonical cache in `storage-doc-three-concepts` instead of dropping it.**

## 2026-05-03 reframe — universal data model, beads as CLI surface only

Multi-day discussion (user + /pro 4-leg + multiple arch-agent reviews) converged
on a sharper framing than the original epic captured. The shifts:

### What "thin beads" actually means

`@km/beads` is over-scoped. It bundles four concerns that each have a more
natural home:

1. **Universal node operations** (resolver, file materialization, `Bead.create`
   factory, lifecycle verbs like close/drop/claim) → `@km/storage`.
2. **Universal frontmatter shape concerns** → `@km/markdown` (parser owns YAML;
   data layer talks "props," not "frontmatter").
3. **bd CLI surface** (`km bd create`, `km bd list`, …) → stays as a CLI
   profile. The `bd` verb prefix supports bd-compatibility; the underlying
   operations are universal.
4. **bd-import / bd-form alias translation** → `@km/migrate` (or stays in
   `@km/beads/migrate.ts` as a focused module).

After distribution, `@km/beads` is essentially the bd CLI compat module
plus a name generator. The data model carries **zero** beads-specific
concepts — no `type: "bead"`, no isBead predicate, no Bead aggregate.

### What `bd create` needs is auto-name-generation, not a "shortId"

The `shortId` concept does not exist in km's data model. The three handles
are id (ULID), name (segment), path (composed); plus the alias mechanism
(an extra string that resolves to a node). When `bd create` runs without
an explicit `--id`/`--path`, it auto-generates a node `name` (e.g.
`km-q5hji`) — that's a name generator, not a separate handle type.

Captured in `@km/all/drop-shortid-concept` (P2).

### Universal data model: aliases, deps, no frontmatter, no tags

Per the user's direction:

- **Frontmatter doesn't exist in the data model.** It's a markdown
  serialization concept. The data model has props — typed columns
  (status, priority, due_at, …) plus a `data` JSON escape hatch.
- **Tags don't exist as a separate field.** A hashtag like `#P1` is a
  wikilink to a node named `#P1`. The `links` table indexes wikilinks;
  `data.tags` is a denormalization that goes away.
- **Aliases are universal.** `data.aliases` becomes `node.aliases` —
  any node can have alternate names.
- **Deps are universal.** `data.dependencies` and `data.props["blocked-by"]`
  consolidate into one canonical `node.deps` field.

Captured in `@km/markdown/props-not-frontmatter`, `@km/all/drop-data-tags`,
`@km/storage/aliases-first-class`, `@km/storage/deps-first-class`.

### km CLI is verb-first; no `task <subcommand>` namespace

The km CLI gets verb-first commands operating on `<ref>`:
`km view`, `km add`, `km close`, `km status`, `km claim`, `km move`, …
There is no `task <subcommand>` namespace because **task is a property of
a node, not an object type**. A node is a task when its props say so.
`km bd <subcommand>` stays as a bd-compat profile that maps to the
universal verbs underneath.

The earlier "Phase C: rename `bd` to `task`" idea is dropped.

### Vocabulary corrections from arch-agent reviews

- The rename target for `pathOf` is `fsPathOf` (it reads `fs_path`),
  **not** `treePathOf`. The pure tree-walk version is already shipped as
  `KTree.path()`.
- A `treePathOf` helper is intentionally not introduced — no consumer.
- `fsNameOf` helper deferred — only ONE inline `basename(node.fs_path)`
  caller exists today.
- `node_plane_map` table for future multi-plane materialization is
  speculative-generality; dropped from backlog.

### 2026-05-03 deep-dive arch review of newly-filed beads

After filing the universal-data-model bead set, ran an arch-agent
deep-dive review checking each bead against existing code for
duplication and mis-placement. Three real issues caught + several
clarifications:

1. **`@km/markdown/props-not-frontmatter` was misfiled.** All work
   happens **outside** `@km/markdown`. **Re-parented to `@km/all`.**
2. **`@km/all/drop-data-tags` had an unverified prerequisite.** The
   bead assumed the markdown serializer emits `#P<n>` / `#<type>`
   wikilinks for priority/type — it does NOT. Bead reframed as a
   3-phase plan: Phase A adds the wikilink emission + round-trip test;
   only after that ships do Phase B (migrate readers to `links` table)
   and Phase C (stop writing `data.tags`). Without Phase A,
   `bd list --priority P1` would return zero rows.
3. **`@km/storage/deps-first-class` proposed a column when a function
   suffices.** Existing `deps` SQLite table (schema v7) already
   trigger-indexes `data.props["blocked-by"]`. Simpler fix: have the
   YAML-frontmatter loader feed `data.dependencies` into
   `data.props["blocked-by"]` so both authoring forms hit the existing
   trigger path. No new column. Bead rewritten.
4. **`@km/all/path-name-orthogonal-vocabulary` had an internal
   contradiction** — acceptance section said `treePathOf` exists; body
   said don't introduce it. Acceptance fixed; `fsNameOf` deferred to
   YAGNI (only one inline caller).
5. **`@km/storage/extract-resolveref` had a soft "after
   `aliases-first-class` lands" qualifier on alias resolution** —
   removed; alias resolution works on initial extract via the existing
   JSON read.
6. **`@km/all/drop-shortid-concept` external-caller count: 2** for
   `resolveShortId` (both in km-cli), and zero for the generators.
   Smaller sweep than originally implied.
7. **`@km/beads/frontmatter-path-rename` enumerated the 3 storage-side
   `data.id` reads** (loader.ts:1189, repo.ts:1416, move-with-refs.ts:281)
   that need to migrate alongside the YAML drop.

The arch agent's full report is in this session's transcript on
2026-05-03; key file:line refs are captured in each affected bead.

## Plan corrections from /pro 4-leg review (2026-04-30)

GPT-5.4 Pro (20/20), Gemini 3 Pro (18/20), Kimi K2.6 (17/20), Grok 4 (16/20). Cost: $2.86. All 4 models converged on:

1. **`bd create` smart-positional heuristic was broken** — fixed in commit `ef2f0b2e1` (revert to title-positional + new `--path` flag). Specific failures: titles with `/` ("fix: handle / in regex"), titles starting with `@` ("@alice please review"), legacy bd-form positional ids ("km-beads.foo") → all misrouted.
2. **`rename-content-cascade` is correctness, not UX** — Gemini's clean argument: DB rebuild from disk path produces broken links if content text isn't kept fresh. Promoted P2 → P1.
3. **`data-id-stop-writing` + `frontmatter-path-rename` must ship as ONE PR** — splitting creates inconsistent intermediate state. Both bumped to P2.
4. **resolveShortId step-4 compat fallback** is a performance/discipline footgun — should migrate fixtures (NOT papered over). Captured in the new `path-name-id-test-bolster` P0 bead — adds `seedBead()` helper; once fixtures migrate, step 4 becomes deletable in `data-id-stop-writing`.
5. **Branded types** — `NodeId`/`RepoId` already exist (storage v5, `types.ts:260,266`). `Path` brand deemed unnecessary (plain string, shape unambiguous). No new typing work needed.
6. **Partial UNIQUE (parent_id, name) WHERE fstype IS NOT NULL** — re-filed as `parent-name-unique-partial` P2. Was over-aggressively dropped earlier.
7. **`drop-fs-path-derive-from-name`** — dropped from backlog. fs_path is a legitimate cache mirroring the OS, not duplicated state under our control.
8. **Anchor handling, slug stability, case normalization** — captured as additions to `storage-doc-three-concepts`.

## Workflow direction (2026-04-30)

Per user direction at end of /pro session: **all further implementation work in this epic happens in a worktree**, not main repo's working dir. After implementation: **`/explore` on real-data copy** to validate end-to-end before merging worktree → main. Regression tests are necessary but not sufficient — real-data dogfooding catches what synthetic fixtures miss.

## Memory + lessons

- `feedback-arch-protocol-doesnt-substitute-for-thinking.md` — `/arch` gate criteria (5+ doc quotes, 3+ close-reasons, etc.) prevent under-investigated mistakes but DO NOT certify design correctness. The lead must engage with sync-invariant / duplication / cache-coherence implications. Treat user pushback on a /arch verdict as signal, not noise.

- `/arch` Phase 1.0 orientation step (added in commit `56b93e61b`): before assembling the bundle, grep for existing infrastructure in the topic area and audit for sufficiency. Caught `resolveNode` + `idx_nodes_fs_path` (this session) and `packages/km-fs-mount/src/fs/path-utils.ts` (the /big session) — both pieces the lead would have proposed re-creating.

## Acceptance for closing this epic

- All "Backlog" beads above are either closed or moved to "Won't do" with rationale.
- Tests document the canonical path/name/id model:
  - `pathOf(node)` covered by 12 tests in `packages/km-core/tests/path.test.ts`
  - Resolver behavior covered by `resolve-id.property.test.ts` (id direct / path via fs_path / legacy bd-form / aliases)
  - bd create path-positional has end-to-end coverage
- Docs reflect the three-concept vocabulary (`storage.md:761-787` already does; cleanup bead extends to other docs)
- No new "should we add a Path type?" question arises — future sessions find the YAGNI verdict here and in the cleanup bead

## Related

- `.claude/skills/arch/SKILL.md` — the protocol that drove this redesign
- `tools/check-arch-required.ts` — the drift-checker
- `.claude/arch-decisions/` — retro archive directory
