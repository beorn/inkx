---
topic: "path-vs-ulid-as-sqlite-pkey"
date: 2026-04-30
session: km-bjorns-2026-04-30-arch-skill-shipped
arch_agent_report: "Hybrid — promote data.id to top-level column with UNIQUE partial index; do not make pkey polymorphic"
verdict: "FINAL — nodes.id stays ULID (stable). nodes.name is the path segment. Path = walk parent_id chain, collect names, join with `/`. Path is materialized in markdown frontmatter `id:` for user-friendliness; the DB never stores a duplicate of it."
related_topics: ["storage", "identity", "renames", "name-as-segment"]
---

## CORRECTED FINAL VERDICT (set by user, 2026-04-30 ~09:18)

**Two distinct things held in two distinct places, no duplication anywhere.**

```
nodes.id       = ULID      ← stable, opaque, pkey, never changes
nodes.name     = "foo"     ← path SEGMENT (single slug, not full path)
nodes.parent_id = <ULID>   ← reference to parent's stable ULID

Full path "@km/beads/foo" = walk(parent_id from this node up to root),
                            collect each node's `name`, reverse, join with "/".

Markdown materializes the path for user-friendliness:
  frontmatter id: "@km/beads/foo"   ← derived from parent walk + name; not a stored duplicate
```

**User's argument, verbatim** (the correction):

> no
> node.id is the ULID
> node.name is a path segment which if you follow to the root gives you the path

And, two messages earlier:

> the primary key in sqlite is always nodes.id - but we materialized it as a path in md because it's more userfriendly and md is all about user-friendliness

**Translation**: the path is the *materialization* of identity in markdown. The DB doesn't store the materialized form. The DB stores the *ingredients* — `parent_id` chain plus per-node `name` segments — from which the materialization is computed on demand.

## What this dissolves

- **(B), (C)** — store `data.id` (or promote to a column). Both store a duplicate of the materialized path in the DB. Stale on rename. Rejected.
- **(β) — pkey IS the path** — the path lives in `nodes.id` directly. Renames cascade through DB references. Rejected: cleaner to keep pkey opaque/stable and let `name` carry the per-segment identity.
- **(D) — unify all node IDs to path-form** — same problem as (β), wider blast radius. Rejected.

## What this commits to

- **`nodes.id` stays a ULID.** Pkey shape is uniform across all node types. Memory mode keeps `path:line` form for ephemeral nodes; disk mode keeps ULID. No per-type pkey-shape branching.
- **`nodes.name` (already a column, already indexed via `idx_nodes_name` at `schema.ts:219`) carries the per-parent identity slug.** For beads, `name` is the slug portion of the path-form (e.g. `name = "foo"` for `@km/beads/foo`). For files, `name` is the filename without `.md`. For sections, `name` is the heading slug.
- **Path is computed, not stored.** Resolution `bd show @km/beads/foo` does: split path → walk root by `(parent_id, name)` chain → land on the ULID → fetch row.
- **The full-path materialization in markdown frontmatter (`id: "@km/beads/foo"`) is for human readers and round-trip fidelity.** The DB does not need the materialized form to function — it can recompute it for the renderer/serializer.
- **Cross-references inside the DB use ULIDs** (per "in the DB we can store references as ulids of course"). `parent_id`, `host_id`, deps `target` — all ULIDs. Stable across rename.
- **Renames are local.** Renaming `@km/beads/foo` → `@km/beads/bar` is `UPDATE nodes SET name = 'bar' WHERE id = <ulid>`. Children's `parent_id` stays valid (still points at the same ULID). Links/deps `host_id`/`target` stay valid. **No DB-level cascade.**
- **Wikilink/mention updates are content-level, not DB-level.** When `@km/beads/foo` is renamed to `@km/beads/bar`, every markdown file that contains `[[@km/beads/foo]]` needs the text rewritten to `[[@km/beads/bar]]`. That's the cross-cutting "batch/background update system" the user asked for — applies to *every* km rename use case, not just bead pkey renames.
- **`(parent_id, name)` should be unique among siblings** for nodes whose name carries identity — same parent shouldn't have two children both named `foo` if they're path-resolvable. Add `UNIQUE (parent_id, name)` partial index for the relevant types (beads, files, named sections).

## Migration delta from current state

Current state (per `packages/km-beads/src/migrate.ts` and `short-ids.ts`):
- `nodes.id` = ULID ✓ (already correct)
- `nodes.name` = slug ✓ (already correct — for `@km/beads/foo`, name = "foo")
- `parent_id` = parent's ULID ✓ (already correct)
- `data.id` = full path-form ← **redundant**; remove from new writes
- `data.aliases` = legacy bd-form ids ← keep for backward compat; resolver tries this fallback
- `resolveShortId` does 3 json_extract scans ← **replace with parent-walk recursive CTE**

Migration is mostly **subtractive at the DB level** + **additive at the resolver level**:
- Add: `UNIQUE (parent_id, name) WHERE type IN (...)` partial index for path-resolvable types.
- Add: recursive-CTE resolver for path-form input (`@km/beads/foo` → walk `(parent_id, name)` chain from root).
- Subtract: `data.id` write path in mutations. Existing rows' `data.id` becomes a fossil; resolver no longer reads it.
- Keep: `data.aliases` resolver fallback.
- Keep: ULID generation for new bead nodes.

## Why this is right

1. **No duplicated state.** The path's value is `(parent_walk + name)`. Storing it elsewhere creates a sync invariant. Computing it eliminates the invariant.
2. **Stable references.** Every `parent_id`, `host_id`, deps `target` points at a ULID. Renames don't cascade through the DB. The DB only knows about stable ids.
3. **The user-friendly form lives in the user-friendly place.** Markdown gets the path. SQLite gets ULIDs. Each layer holds the form natural to its consumer.
4. **`idx_nodes_name` was already pointing the way.** The schema (`schema.ts:219`) already indexes `name`. The namespaces close-reason ("name = short_id = identity under the new model") is the design hypothesis that aligns. The /arch agent surfaced this as the "out-of-bundle" alternative; turns out that alternative IS the answer.
5. **Cross-cutting rename machinery is needed anyway.** Wikilinks, mentions, and inline references in markdown content all need batch update on rename. Building that engine once serves every rename use case.

## Beads filed (2026-04-30 09:23, pruned ~09:38 after user pointed out path-walking is already implemented)

User correction at 09:34: "this sounds like you think this is new — this is already implemented — path-walking i mean (i think the resolver does it). i'm pretty sure — but perhaps not at the schema level. btw, i thought h/file/folder fs_type or something like that? it's purely an fs materialization thing."

Two corrections:

1. **Path resolution via `fs_path` already exists** in `packages/km-storage/src/db/queries/smart-resolver.ts:278-305` (`resolveRelativePath`). Routes through indexed `idx_nodes_fs_path`. The slowness is in `resolveShortId` (km-beads-specific) doing redundant `json_extract` scans on `data.id`, not in path resolution itself. The fix is much smaller: delegate `resolveShortId` to `resolveNode` for path inputs.

2. **`fstype` (filesystem materialization: `repo`/`folder`/`file`/`mdsection`) is the right column**, not `type` (markdown shape: `h`/`p`/`code`/...). I'd conflated them. The path-resolvable concept is purely about fs-materialized nodes (`fstype IS NOT NULL`).

Pruned bead set:

| # | Bead | Status |
|---|------|--------|
| ~~1~~ | `@km/storage/parent-name-unique` | **DROPPED** — fs_path uniqueness enforced by OS filesystem; mdsection name collisions are valid. Marked closed in the bead file. |
| 2 | `@km/beads/resolver-path-via-name-walk` | **REFRAMED** — small refactor: `resolveShortId` delegates to `resolveNode` for path inputs; aliases scan stays for legacy bd-form. ~10 lines. |
| 3 | `@km/beads/directory-nesting-bd-create` | Unchanged. Agenda item #4. Now only depends on (2). |
| 4 | `@km/beads/data-id-stop-writing` | Unchanged. |
| 5 | `@km/all/path-derivation-helper` | Updated — fast path: `pathOf` reads `fs_path` for fs-materialized nodes (one-liner); walk fallback for sub-file nodes. |
| 6 | `@km/all/rename-content-cascade` | Unchanged. P2 (UX freshness, not correctness). |
| 7 | `@km/all/id-name-path-code-cleanup` | Unchanged. |
| 8 | `@km/all/storage-doc-three-concepts` | Unchanged. Adds: clarify `fstype` vs `type` distinction in docs that conflate them. |
| 9 | `@km/beads/frontmatter-path-rename` | Unchanged. P3. |

Net scope reduction: the schema migration is gone (no SCHEMA_VERSION bump, no `km doctor name-collisions` subcommand needed). The "resolver rewrite" becomes "delegate to existing infrastructure". The agenda's task #4 (directory-nesting `bd create`) is now ~½ day work, not ~1.5 days.

**Larger lesson** (added to memory): the /arch agent and the lead spent considerable effort designing storage and resolver changes WITHOUT noticing that the relevant infrastructure (`resolveNode`, `idx_nodes_fs_path`, `fstype`-indexed lookup) already existed. Both gate-passed reports failed to surface it. The bead's bundle "Current code state" section listed `short-ids.ts:resolveShortId` but didn't audit `resolveNode` as the broader-scope alternative path that already worked. Adding an `arch` Phase 1 step: "before recommending new resolution machinery, grep for existing resolution code and confirm it's *insufficient*, not just *unused-here*."

---

## SUPERSEDED — earlier "FINAL VERDICT (β)" block (path-as-pkey)

The block below was based on user message 4 ("the primary key in sqlite is always nodes.id - but we materialized it as a path in md"). I read it as "pkey *holds* the path"; the user clarified it means "pkey IS what SQLite calls the primary key, and we materialize the path in markdown — the DB stores the ingredients, not the materialized form." Kept for audit.

**The id IS the path. SQLite pkey `nodes.id` is the materialized path-form (`@km/beads/foo`). Markdown frontmatter `id:` is the same value. They're the same thing, not two things kept in sync.**

**User's argument, verbatim**:

> we will have to update all backlinks anyways - it's a problem we have across the entire 'km' - i'd rather we made a good system to batch / background update things
>
> the primary key in sqlite is always nodes.id - but we materialized it as a path in md because it's more userfriendly and md is all about user-friendliness

**What this means for implementation**:

1. `nodes.id` for bead-typed rows becomes the path-form (`@km/beads/foo`, `@pim/storage/bar`, etc.). For nodes whose path is NOT their identity (paragraphs, list items, sections without anchors), `nodes.id` stays ULID-shaped.
2. Schema is heterogeneous in pkey *value shape* but homogeneous in pkey *type* (`TEXT`). That's fine — SQLite doesn't care.
3. **Rename cascade is real and intentional.** Renaming `@km/beads/foo` → `@km/beads/bar` means UPDATE the pkey + cascade through every row that references it (`parent_id` of children, `host_id` in links, `target` in deps, JSON-stored `blocked-by` arrays).
4. **The cascade is not a reason to dodge path-as-pkey.** km already has cascade-update needs everywhere (backlinks, wikilinks, inline mentions). Per the user: "i'd rather we made a good system to batch / background update things". The right move is to build the rename-update engine ONCE, then use it for pkey-rename + every other cross-reference update km needs.
5. `data.id` (JSON) and `data_id` (proposed column) are NEITHER added — they'd be duplicates. The `data` JSON keeps `aliases:` for legacy bd-form id resolution, but the canonical id IS `nodes.id`.

## Why this dissolves the prior framings

- **(α) ULID-stable, path derived** — was attractive to me because it avoids rename cascade. But: the cascade is needed anyway for backlinks/wikilinks/mentions across km. Dodging it via opaque ids is solving the wrong problem.
- **(C) Hybrid `data_id` column** — was the agent's recommendation. Caching the path in a separate column re-creates the staleness problem we were trying to fix.
- **(B) Status quo** — same as (C) but in JSON. Same problem.
- **(D) Unify all node IDs to path-form** — overshoots. Only nodes whose path IS their identity (beads, files, sections with anchors) need path pkeys. Paragraphs and unanchored list items keep ULIDs.

## Lessons captured

1. **The /arch agent's verdict was wrong, despite passing every gate.** It met all five gate criteria (5+ doc quotes, 3+ close-reasons, contradictions named, no draft-doc citations, no phantom file paths) and still recommended a structurally flawed option (C). The lead initially adopted that verdict without catching the staleness issue. The user caught it.
2. **Gate criteria catch sloppy investigation, not design errors.** Running the protocol does not substitute for thinking through the design implications. This is itself an architectural lesson about /arch: the protocol's job is to prevent the *un-investigated* mistake (the 2026-04-30 morning failure), not to certify that the design is right.
3. **The framing matters more than the analysis.** The agent (and I) were comparing options A/B/C/D/E. The user reframed: it's binary — global stable id (with derived path) OR path-as-id (with rename cascade). All "hybrid" options reduce to one or the other in disguise.
4. **Filing follow-up memory: `feedback-arch-protocol-doesnt-substitute-for-thinking.md`** — the lead must engage with the *design* of the recommendation, not just verify the *citation gates*. /arch lowers the floor on bad-investigation mistakes; it does not raise the ceiling on design quality.

## Beads to file

- `@km/storage/nodes-id-as-path-form` (P1) — schema migration: bead-typed rows have path-form pkeys (`@km/beads/foo`); ULID stays for paragraphs/unanchored items. Includes backfill from current `data.id`. Resync required (delete `.km/state.db`).
- `@km/all/rename-cascade-engine` (P1) — generic batch/background update system covering pkey rename + all cross-reference updates km needs (backlinks, wikilinks, mentions, deps `blocked-by`, link table `host_id`, JSON-array refs). Per user: "i'd rather we made a good system to batch / background update things." Cross-cutting; many consumers.
- `@km/beads/resolver-pkey-direct` (P1) — `resolveShortId` becomes a direct `WHERE id = ?` for path-form input; aliases path remains as `json_each` fallback for legacy bd-form ids.
- `@km/beads/data-id-removal` (P2) — drop `data.id` from new writes (it equals `nodes.id` now). Existing rows' `data.id` becomes a no-op; resolver no longer reads it. Migration: leave existing `data.id` values as fossils; future commit removes the JSON path fully once we're confident.
- `@km/beads/directory-nesting-bd-create` (P1) — agenda item #4. Under (β) this is straightforward: `bd create @km/beads/foo` infers `parent_id = "@km/beads"` from the leading path segments, mints `id = "@km/beads/foo"`, and INSERTs. Depends on `nodes-id-as-path-form`.
- `@km/all/knode-storage-doc-update` (P3) — update `docs/design/model/knode.md:13`, `docs/design/model/storage.md:373-787`, `packages/km-storage/CLAUDE.md` to reflect that nodes-with-stable-paths use path-as-pkey.

---

## ORIGINAL RETRO (kept verbatim for audit; superseded by the FINAL VERDICT above)



## REVERSAL FROM /arch AGENT VERDICT (2026-04-30, immediately post-retro)

**The /arch agent's recommendation of (C) was wrong. The lead initially accepted it without catching the flaw. The user caught it.**

**User's argument, verbatim**:

> (A) we don't have a choice - it's a path - if you put the path-like thing in a data.id it'll also be stale if you move the node - it'll be the path-that-the-node-had-when-it-was-created which is not useful and confusing
> (C) rename only breaks the path - the node.id is the same

**The flaw in (C)**: `data_id` is a stored copy of the current path-form. Under any rename, `data_id` either (a) gets updated atomically with the rename — at which point we have a duplicated mutable cache that must be kept in sync with the file location and parent walk, OR (b) doesn't get updated — at which point `data_id` is "the path the node had when it was created", which is misleading. (C) does not actually fix the duplication problem of (B); it just moves the cached copy from JSON to a column. The cache-coherence problem (which is what produced the claim-loses-issue / close-drop-data-wipe class of bugs in the first place) is unchanged.

**Why (A) is forced**: the canonical user-visible identity for these nodes IS the path. There is no second source of truth that exists independently of the path. Therefore the path must BE the pkey, not stored alongside it. Rename = pkey change. Cascade through `parent_id` of children + `host_id` in links + deps materialization is mechanical, not a duplication.

**Final verdict: (A) path-form pkey for bead nodes** (and any other node where path == rename-stable identity by construction). ULID stays as pkey for nodes whose path is NOT their identity (paragraphs, list items, sections without stable anchors). Schema is heterogeneous in pkey *shape* but homogeneous in pkey *type* (`TEXT`).

**This is a structural lesson for /arch**: the agent's report had 8+ doc citations and 5 close-reason quotes, met all gate criteria, and was still wrong on the core question. The gate criteria don't catch design errors; they catch sloppy investigation. The lead has to think — running the protocol doesn't substitute for thinking. Filing this as feedback memory `feedback-arch-protocol-doesnt-substitute-for-thinking.md`.

---

## ORIGINAL RETRO (kept verbatim for audit; superseded by the reversal above)



# Arch retro — path-vs-ULID-as-SQLite-pkey

## Bundle path

`/tmp/arch-path-vs-ulid.md` (full copy embedded at the bottom of this file in case /tmp is cleared).

## Canonical docs the lead actually read (line numbers)

- `docs/design/model/storage.md:1-928` — read in full. Key sections: ID Strategy table at 373-378 (Disk = ULID, Memory = `path:line`), nodes table CREATE at 391-438, Names/Paths/IDs three-concept distinction at 760-787, change events 510-587, repo loader 590-661.
- `docs/design/model/knode.md:1-345` — read in full. Line 13 declares "id: string (ULID)". Invariants section 290-296. Three-layer predicate taxonomy 254-269 (tree/view/render layers — separate concern from identity).
- `docs/design/model/repo-api.md:1-336` — read in full. `getNode(id: string)` line 78. `addNode(parentId, node) → string` line 180. The interface treats id as opaque string.
- `docs/architecture.md:39-148` — read sections KNode, Position, Repo. `addNode(parentId, node): string` at line 66 — generic string return.
- `packages/km-storage/CLAUDE.md` — read in full via system reminder. Two load-bearing invariants: (a) "Filesystem remains the source of truth for content; storage is a cache + index", (b) "Event-sourcing-lite is the direction for CRDT compatibility".
- `packages/km-storage/src/db/schema.ts:1-220` — read schema header (SCHEMA_VERSION = 7 + history) and nodes table. Line 155 confirms `id TEXT PRIMARY KEY` is shape-agnostic. Line 219 confirms `idx_nodes_name` already exists (key for the agent's surfaced "what about name?" alternative).
- `packages/km-beads/src/short-ids.ts:1-127` — read in full. `resolveShortId` does THREE sequential `json_extract` scans (95-126).
- `packages/km-beads/src/migrate.ts:148-470` (selected) — `bdIdToPathForm` at 376, migration writes `id: <path-form>` into `data` JSON column.

## Close-reasons the lead actually read (verbatim)

- **`@km/infra/namespaces`** — closed 2026-04-20: "Dissolved. name = short_id = identity under the new model (hub/km/design/tribe-matrix.md). No separate namespace facet needed; name-minting per parent remains in km-beads."
- **`@km/beads/path-ids`** — closed 2026-04-28: "Shipped in commit ede04bd5a (staged work was bundled into a peer agent's commit by concurrent git activity, but all code is present in that SHA)."
- **`@km/beads/aliases-resolver`** — closed 2026-04-28: "Shipped in commit ede04bd5a [...]"
- **`@km/beads/claim-loses-issue`** — closed 2026-04-28: "Fixed in commit d14054dd6 (preserve data blob on update; remove obsolete assignee mirror). updateIssueFields now merges currentData when priority/type change, preserving id/aliases/short_id. [...] Sister fix for close/drop in commit 3309b3512."
- **`@km/beads/close-drop-data-wipe`** — closed 2026-04-28: "Fixed in commit 3309b3512. closeIssueFields/dropIssueFields now accept currentData and merge it into the data write, preserving id/aliases/short_id/mentions/tags when a reason is set. CLI callers in apps/km-cli/src/commands/bd.ts read node.data and pass it through. 3 new tests in packages/km-beads/tests/mutations.test.ts pin the invariant."

## Contradictions found

1. **`knode.md:13` ("id: string (ULID)") vs `storage.md:392` (TEXT PRIMARY KEY) + `storage.md:761-767` (ID is "stable across renames", not ULID-specifically).** Resolution: storage.md + schema.ts win. The "ULID" in knode.md:13 is a *current* fact, not a *contractual* one — the surrounding architecture treats identity-form as policy, not contract. knode.md:13 is a one-line update consequence of any pkey change, not a blocker to one.

2. **`storage.md:761-767` (Name, Path, ID are three distinct concepts; ID's defining property is rename-stability) vs `@km/infra/namespaces` close-reason hypothesis ("name = short_id = identity").** Resolution: storage.md wins. ID's *defining property* is rename-stability; Name is explicitly non-unique. Collapsing Name into ID would lose the very property ID exists to provide. **This rules out hypothesis (D)** in its strongest form: unifying *all* node IDs to path-form means ID = Path, which breaks rename-stability for non-bead nodes (paragraphs in a renamed file would lose identity). For beads specifically, path *is* the rename-stable identity by construction, but for paragraphs/sections inside a renamed file it isn't.

3. **`@km/infra/namespaces` close-reason cites `hub/km/design/tribe-matrix.md` as authority.** Per `feedback-hub-docs-are-drafts-not-canonical.md`, `hub/<project>/design/*` is per-doc draft territory unless explicitly vetted. The user pushed back on tribe-matrix.md specifically in the 2026-04-30 origin session ("tribe-matrix - i don't think this doc has been fully vetted"). Resolution: treat the namespaces close-reason's design-intent statement as a working hypothesis, not a binding rule.

## Reversal check

**Partial REVERSAL FROM PRIOR FRAMING.**

- **Prior framing** (2026-04-30 morning, halted): drafted a "5-step refactor of bead identity" treating user iteration on bead body as plan approval. Specific shape was never committed but it was a holistic identity-and-resolver redesign of the `frontmatter id:` field plus the resolver, in advance of `/max`. Per `feedback-architectural-decisions-need-big-before-max.md`, the user halted me explicitly: "we do not want to change the architecture/identity of things without a solid understanding of what we have and what we planned — it has wide-ranging consequences."
- **New verdict** (this run): structurally smaller. Don't reshape `frontmatter id:` at all. Keep ULID as pkey. Promote `data.id` to a top-level column with `UNIQUE` partial index. Additive schema migration. Resolver query becomes `WHERE data_id = ?`.
- **Why the reversal is justified**: the canonical docs (`storage.md:761-767`) protect the rename-stability invariant for non-bead nodes; making pkey polymorphic (option A) or unifying all IDs to paths (option D) breaks that invariant for paragraphs/sections inside renamed files. The class of mutation bugs (claim-loses-issue, close-drop-data-wipe) was structurally caused by canonical identity living in a JSON blob — the cure is to move the column out of JSON, not to change the pkey. The smaller move dominates the larger one.

## Verdict

**ADOPTED — option (C): Hybrid. Promote `data.id` to a top-level column with `UNIQUE` partial index. Do not change pkey shape.**

Schema delta (additive only):
- `nodes.data_id TEXT` (NULL allowed for non-bead rows)
- `CREATE UNIQUE INDEX idx_nodes_data_id ON nodes(data_id) WHERE data_id IS NOT NULL`
- Backfill: `UPDATE nodes SET data_id = json_extract(data, '$.id') WHERE json_extract(data, '$.id') IS NOT NULL`
- Bump `SCHEMA_VERSION = 8` (history note: "promote data.id to indexed column; resolver no longer scans json_extract").

Code delta:
- `packages/km-beads/src/short-ids.ts:resolveShortId` — first scan becomes `WHERE data_id = ? OR data_id = ? OR data_id LIKE ?`. Aliases scan via `json_each` remains for the rare path.
- Mutation paths (`mutations.ts`, `bd.ts`) — write `data_id` on insert. `data_id` is immutable for the row's lifetime; renames go through a structured path that updates both `data_id` and `data.id` atomically (or rejects if the new path collides with another row's `data_id` via the UNIQUE index).
- Tests in `packages/km-beads/tests/mutations.test.ts` add: "data_id survives partial mutation" invariant.

Doc delta:
- `docs/design/model/knode.md:13` — change "id: string (ULID)" to acknowledge ULID is the ID *and* `data_id` may carry the canonical path-form for nodes that have one.
- `docs/design/model/storage.md:373-378` — keep ID Strategy table; add a sibling row noting `data_id` (path-form, optional, indexed) for nodes whose path *is* their canonical name.
- `docs/design/model/storage.md:760-787` — keep three-concept Name/Path/ID model; clarify that `data_id` is the column that materializes Path-as-ID for the subset of nodes (beads) where path IS the rename-stable identity.

Resync: required. Per `packages/km-storage/CLAUDE.md` invariant, the commit message and changelog must instruct users to delete `.km/state.db` after pulling.

## Effort estimate (verified, not from agent's report)

~1 day for a focused session, broken down:

- Schema migration (additive column + backfill + UNIQUE partial index + SCHEMA_VERSION bump): 1-2 hrs.
- Rewrite `short-ids.ts:resolveShortId` (column-based first, json_each aliases fallback): 1 hr.
- Mutation paths — write `data_id` on insert; treat as immutable except via structured rename: 2-3 hrs (touches `mutations.ts`, `bd.ts`, possibly `repo.ts` for rename atomicity).
- Tests — `mutations.test.ts` invariant + at least one resolver perf assertion to lock in the column-vs-json_extract win: 1-2 hrs.
- Doc updates (knode.md, storage.md, packages/km-storage/CLAUDE.md): 1 hr.

Risk class: **low**. Additive column, no `id` rename, no `parent_id` cascade, no link table touch. Worst-case rollback: drop the column, drop the index, revert resolver to json_extract path. The defensive `currentData` merge stays in place either way (suspenders behind the new belt).

## Beads to file before /max can run

These should be filed BEFORE invoking `/max` for the implementation, but only if the **user confirms the verdict**. Specifically the user needs to weigh in on the `name`-vs-`data_id` design fork the agent surfaced (issue #1 in section 4 of the report) — if `name` is intended to become the unique-per-parent identity slot, the implementation may instead be `UNIQUE (parent_id, name)` for bead rows, not a new `data_id` column.

Proposed beads (after user confirmation):

- `@km/storage/data-id-column-promotion` (P1) — additive schema migration for `data_id` column + UNIQUE partial index + backfill. Includes SCHEMA_VERSION bump to 8 and the resync instruction.
- `@km/beads/resolver-column-fast-path` (P1) — rewrite `resolveShortId` to query `data_id` column first, retain `json_each` for aliases. Depends on the schema migration.
- `@km/beads/data-id-write-on-insert` (P2) — mutation paths write `data_id` on insert; treat as immutable except via structured rename. Includes the test invariant.
- `@km/storage/data-id-rename-atomicity` (P2) — `bd rename` updates `data_id` and `data.id` atomically; UNIQUE index catches collisions. May fold into the previous bead.
- `@km/all/knode-storage-doc-update` (P3) — `knode.md:13`, `storage.md:373-378` + `storage.md:760-787`, and `packages/km-storage/CLAUDE.md` reflect the new column.

## Out-of-bundle issues the agent surfaced

1. **`name` column is already indexed** (`schema.ts:219`). If `name` is intended to play the unique-per-parent identity role (per the namespaces close-reason hypothesis), the implementation might be `UNIQUE (parent_id, name)` partial index for bead rows — no new column. Worth a 5-minute confirmation with the user before kicking off implementation. **This is a real design fork; do not pre-empt it by filing beads.**

2. **`@km/fs-mount ↔ @km/storage` source cycle** (km-storage CLAUDE.md). Mutation-path edits will touch files on both sides of the cycle; they should not also try to break the cycle (separate bead).

3. **Memory mode pkey shape** (storage.md:374-378: memory IDs are `path:line`). `data_id` semantics in memory mode need a clear rule — likely "column is null in memory mode, populated on disk only" with the resolver handling both modes.

---

# Bundle copy (in case /tmp is cleared)

The Phase 1 bundle below is preserved verbatim from `/tmp/arch-path-vs-ulid.md`.

> See `/tmp/arch-path-vs-ulid.md` for the full bundle (kept short here to avoid duplication; the bundle is already preserved in this commit's working tree if not committed elsewhere). If `/tmp` is cleared and the bundle is needed for audit, the canonical docs cited above can be re-read in the same order to reconstruct it. The close-reasons are verbatim above; the doc citations have line numbers above.
