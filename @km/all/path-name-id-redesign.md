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

### Backlog (revised after /pro 4-leg review on 2026-04-30 — see "Plan corrections" below)

- 📋 `@km/beads/path-name-id-test-bolster` (P0, NEW) — audit + bolster regression tests in this area before further refactors land; add `seedBead()` helper for file-materialization fixtures; run `/explore` on real-data copy. **First bead to work on.**
- 📋 `@km/tree/ktree-path-method` (P2) — add `KTree.path(tree, id)` to canonical namespace (Discoverability Test). Cache-free walk; foreshadows `drop-fs-path-derive-from-name`.
- 📋 `@km/all/id-name-path-code-cleanup` (P2) — sweep variable/function/parameter names where "id" is used to mean "path" or "name". Includes 6-site migration of inline `fs_path.replace(/^\.\//, "").replace(/\.md$/, "")` → `pathOf()`. Internal vocabulary discipline; `--id`/`--parent` flags STAY for bd compat. **Note: branded `NodeId` and `RepoId` types ALREADY exist in `packages/km-core/src/types.ts:260,266` (storage v5).** Path branding deemed unnecessary (pathOf returns plain string; shape `@<prefix>/...` is unambiguous in practice).
- 📋 `@km/all/rename-content-cascade` (**P1, was P2**) — content-layer batch update of wikilinks/mentions when a node's path changes. **CORRECTNESS, not UX**: per Gemini's argument, DB rebuild from disk reads stale `[[@km/beads/foo]]` text → fails to resolve → DB link table records broken link. Text content IS canonical in markdown-based system.
- 📋 `@km/beads/data-id-stop-writing` (P2) — stop writing `data.id` (= path-form) into bead frontmatter. Coupled with next bead; ship together.
- 📋 `@km/beads/frontmatter-path-rename` (**P2, was P3**) — rename frontmatter `id:` → `path:` OR remove entirely. **Promoted from P3** because it's atomically coupled with `data-id-stop-writing` per /pro consensus.
- 📋 `@km/storage/parent-name-unique-partial` (NEW, P2) — re-file the dropped `parent-name-unique` bead, this time as `UNIQUE (parent_id, name) WHERE fstype IS NOT NULL` partial index. Even with `fs_path` retained, this catches watcher-bug ambiguity and is a prerequisite for the eventual recursive-walk resolver. The previously-dropped flat version was right to drop; the partial-by-fstype version is needed.
- 📋 `@km/all/storage-doc-three-concepts` (P3) — update docs with consistent path/name/id vocabulary. Add: clarify `fstype` vs `type` distinction; explicit anchor handling story (`file#section`); slug stability invariant (title changes do NOT auto-rename); slug case-normalization invariant.

### Dropped (decided not to do)

- ❌ `@km/storage/drop-fs-path-derive-from-name` — DROPPED on /pro review reflection. Reasoning: `fs_path` is a legitimate canonical cache mirrored from the filesystem (which is ground truth, not km). The OS owns file paths; we mirror to `fs_path` for O(log N) queries. The duplication concern applied to `data.id` (TWO places we maintain — JSON + would-be column); `fs_path` is ONE place, kept consistent with the OS. Watcher/reconciler/move-detection all need it. Performance: O(log N) index hit vs O(depth) recursive CTE per resolve. **Formalize fs_path as canonical cache in `storage-doc-three-concepts` instead of dropping it.**

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
