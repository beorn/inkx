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

### Backlog

- 📋 `@km/tree/ktree-path-method` (P2) — add `KTree.path(tree, id)` to canonical namespace (Discoverability Test). Cache-free walk; foreshadows `drop-fs-path-derive-from-name`.
- 📋 `@km/all/id-name-path-code-cleanup` (P2) — sweep variable/function/parameter names where "id" is used to mean "path" or "name". Includes 6-site migration of inline `fs_path.replace(/^\.\//, "").replace(/\.md$/, "")` → `pathOf()`. Internal vocabulary discipline; `--id`/`--parent` flags STAY for bd compat.
- 📋 `@km/all/rename-content-cascade` (P2, originally P1 — softened) — content-layer batch update of wikilinks/mentions when a node's path changes. UX freshness, not correctness (resolver still finds beads via id even if path text is stale).
- 📋 `@km/beads/data-id-stop-writing` (P2) — stop writing `data.id` (= path-form) into bead frontmatter. Tightly coupled to the next bead — should land together.
- 📋 `@km/beads/frontmatter-path-rename` (P3) — rename frontmatter `id:` → `path:` OR remove entirely. Decision deferred until tests are ready to migrate.
- 📋 `@km/all/storage-doc-three-concepts` (P3) — update `docs/design/model/storage.md:761-787`, `knode.md:13`, `packages/km-storage/CLAUDE.md` with consistent path/name/id vocabulary.
- 📋 `@km/storage/drop-fs-path-derive-from-name` (P3) — drop `fs_path` column entirely; derive path from parent walk + name. Sizable refactor (touches reconciler, watcher, every reader). Lower priority but structurally cleanest end state.

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
