---
topic: "path-vs-ulid-as-sqlite-pkey"
date: 2026-04-30
session: km-bjorns-2026-04-30-arch-skill-shipped
arch_agent_report: "Hybrid — promote data.id to top-level column with UNIQUE partial index; do not make pkey polymorphic"
verdict: "ADOPTED"
related_topics: ["storage", "identity"]
---

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
