# /arch bundle — path-vs-ULID-as-SQLite-pkey

## Question

Should the SQLite primary key on `nodes.id` for **bead nodes** be:

- **(A) Path-form** (e.g. `@km/beads/foo`) — making the canonical user-visible identity the database primary key directly
- **(B) ULID, status quo** — keeping a synthetic ULID as primary key with the path-form stored in `data.id` (JSON column) and resolved via `json_extract`
- **(C) Hybrid** — keep ULID as primary key but **promote `data.id` to a top-level column** with a `UNIQUE` index, killing the json_extract scan path
- **(D) Unify all node IDs (not just beads)** to path-form (`@km/beads/foo`, `repo-root/.`, `file.md/section/li-3`) — a deeper redesign

This decision unblocks `@km/beads/directory-nesting-bd-create` (item #4 of the suggested next-session list) which wants `bd create @km/beads/foo` to land directly under `@km/beads`. That feature is design-neutral if pkey stays ULID; if pkey becomes path-form, the feature becomes "pkey = path-form, parent inferred from leading segments."

## Canonical docs read (in full)

- `docs/design/model/storage.md:1-928` — full read. Canonical for SQLite schema, ID strategy, the two modes (memory: `path:line`, disk: ULID), the `nodes` table layout, change events, the names-vs-paths-vs-IDs section (line 760-787).
- `docs/design/model/knode.md:1-345` — full read. KNode shape, `id: string (ULID)` line 13, three-layer predicate taxonomy, invariants (#3: `parent_id "."` means root).
- `docs/design/model/repo-api.md:1-336` — full read. `getNode(id: string) → KNode | null` (line 78) — the API is identity-form-agnostic; just expects strings.
- `docs/architecture.md:39-148` — KNode + Repo API surface. `addNode(parentId, node): string` returns the new id; the type signature is generic `string`.
- `packages/km-storage/CLAUDE.md` (read via system reminder) — "Storage functions are pure over the passed-in `Database` handle"; "Filesystem remains the source of truth for content; storage is a cache + index"; "Event-sourcing-lite is the direction for CRDT compatibility" (memory `storage-crdt-direction.md`).
- `packages/km-storage/src/db/schema.ts:152-220` — actual schema. Line 155: `id TEXT PRIMARY KEY`. Line 219: `CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name)` — `name` (slug) is already indexed. SCHEMA_VERSION is 7; current data shape supports any `TEXT` value as pkey.
- `packages/km-beads/src/short-ids.ts:1-127` — `resolveShortId` does THREE `rawQuery` json_extract scans (`data.id`, `data.short_id`, `data.aliases` via `json_each`) — line 95-127.
- `packages/km-beads/src/migrate.ts:148-470` — migration writes path-form filenames + frontmatter `id: <scope>/<slug>`, aliases include bd-form. `bdIdToPathForm` (line 376) is the canonical conversion.

## Excluded from authority (per CLAUDE.md promotion flow)

- `hub/km/design/tribe-matrix.md` — cited in `@km/infra/namespaces` close-reason as authority for "name = short_id = identity under the new model", but per `feedback-hub-docs-are-drafts-not-canonical.md` and the user's explicit pushback in the 2026-04-30 origin session, this doc is **not vetted**. The close-reason inherits draft authority.
- `hub/km/storage-architecture.md` (cited from schema migration history) — contains §3.2 reconciliation cascade design. Not loaded; per-doc judgment required before treating as authority.

## Close-reasons (verbatim) — most relevant first

### `@km/infra/namespaces` — closed 2026-04-20 18:46 UTC

> Dissolved. name = short_id = identity under the new model
> (hub/km/design/tribe-matrix.md). No separate namespace facet needed;
> name-minting per parent remains in km-beads.

**Authority caveat**: cites a `hub/` doc that may not be vetted. Treat the design-intent statement ("name = short_id = identity") as a working hypothesis, not a binding rule.

### `@km/beads/path-ids` — closed 2026-04-28 02:53 UTC

> Shipped in commit ede04bd5a (staged work was bundled into a peer
> agent's commit by concurrent git activity, but all code is present in that
> SHA).

Bead body: "migrate.ts writes issue/<scope>/<slug>.md instead of issue/<id>.md, with frontmatter id: <scope>/<slug> and aliases: [<legacy-id>]." This established that **`data.id` (JSON, path-form)** is the canonical id for the markdown layer; the SQLite `nodes.id` (ULID) is internal.

### `@km/beads/aliases-resolver` — closed 2026-04-28 02:53 UTC

> Shipped in commit ede04bd5a [...]

Bead body: "short-ids.ts resolveShortId checks data.aliases (array) in addition to data.short_id. queries.ts respects aliases. Acceptance: km bd show <legacy-id> resolves to new file; km bd show @km/scope/slug also resolves; tests cover both paths." → resolution accepts **path-form OR bd-form**; both reach the same row via `json_extract` lookups.

### `@km/beads/claim-loses-issue` — closed 2026-04-28 02:29 UTC

> Fixed in commit d14054dd6 (preserve data blob on update; remove
> obsolete assignee mirror). updateIssueFields now merges currentData when
> priority/type change, preserving id/aliases/short_id. Verified by inspecting
> packages/km-beads/src/mutations.ts:142-183 and
> apps/km-cli/src/commands/bd.ts:340-341 caller passing node.data through.
> Sister fix for close/drop in commit 3309b3512.

**Critical signal**: the JSON-blob storage of `data.id` produced a CLASS of bugs where partial JSON updates wiped the canonical id. Required a defensive merge on every mutation path. This is a structural cost of "canonical id lives in JSON, pkey is ULID."

### `@km/beads/close-drop-data-wipe` — closed 2026-04-28 02:29 UTC

> Fixed in commit 3309b3512. closeIssueFields/dropIssueFields now
> accept currentData and merge it into the data write, preserving
> id/aliases/short_id/mentions/tags when a reason is set. CLI callers in
> apps/km-cli/src/commands/bd.ts read node.data and pass it through. 3 new tests
> in packages/km-beads/tests/mutations.test.ts pin the invariant.

Same structural issue as claim-loses-issue. Two fixes for the same root cause: identity in JSON is fragile.

## Current code state (cited)

- `packages/km-storage/src/db/schema.ts:155` — `id TEXT PRIMARY KEY` — schema accepts any TEXT value; pkey shape is a policy decision, not a schema constraint.
- `packages/km-storage/src/db/schema.ts:172` — `name TEXT` (separate column from `id`).
- `packages/km-storage/src/db/schema.ts:219` — `CREATE INDEX idx_nodes_name ON nodes(name)` — slug is already O(log N) lookup-able.
- `packages/km-beads/src/short-ids.ts:95-126` — `resolveShortId` runs 3 sequential `json_extract` scans: `data.id` (line 98-104), `data.short_id` (109-112), `data.aliases` (116-122). Each scan is O(N) over all bead nodes unless the JSON expression is indexed (it isn't).
- `packages/km-beads/src/migrate.ts:148-149` — migration writes `data.id = <path-form>` (e.g. `@km/beads/foo`) into the JSON column. The SQLite `nodes.id` is whatever ULID `addNode` produces.
- `docs/design/model/storage.md:374-378` — "ID Strategy" table: Disk = ULID, Memory = `path:line`. **No mention of beads-specific ID policy** — beads inherit the generic policy.
- `docs/design/model/storage.md:760-787` — "Names, Paths, and IDs" section: ID = "Internal reference, stable across renames." Path = "Filesystem location, composed of names." Currently distinct concepts.
- `packages/km-storage/CLAUDE.md` invariant: "Event-sourcing-lite is the direction for CRDT compatibility (see memory `storage-crdt-direction.md`). Don't bake in assumptions that block that path."

## Pre-arch hypotheses (lead's framing — NOT decisions)

1. **(A) Path-form pkey for beads only**: `nodes.id` for bead-typed nodes = `@km/beads/foo`. Non-bead nodes (paragraphs, files, sections) keep ULID.
   - Cost: schema asymmetry; mutations need to know which form to mint; renames cascade through pkey + parent_id of children.
   - Benefit: native pkey lookup; eliminates the json_extract path entirely.

2. **(B) Status quo**: ULID pkey + `data.id` (path-form) in JSON.
   - Cost: 3 json_extract scans per resolve (O(N) each unless we add JSON expression indexes); fragile mutation path (claim-loses-issue, close-drop-data-wipe class).
   - Benefit: zero migration; works for non-bead nodes too.

3. **(C) Hybrid: ULID pkey + promote `data.id` to top-level column with UNIQUE index**.
   - Cost: schema migration (additive); duplicate canonical id on every node row (12 bytes for `@km/beads/foo`).
   - Benefit: native O(log N) lookup; survives partial JSON updates because the column is independent of `data`; same pkey for all node types; minimal blast radius.

4. **(D) Unify all node IDs to path-form**: Every node's `id` is its path. File `repo/foo/bar.md` → `id = "repo/foo/bar.md"`. Section "## Goals" inside it → `id = "repo/foo/bar.md/goals"`. Deeper redesign with cross-cutting effects (links table `host_id`, `parent_id`, `embed_of`, `version`).
   - Cost: very large; touches everything that holds an id; rename cascades affect every link/dep/parent reference.
   - Benefit: collapses the path/id distinction; storage.md:760-787's careful three-concept distinction (Name, Path, ID) becomes two (Name, Path=ID).

5. **(E) Do nothing now**: Defer the question; the json_extract resolve path has been live for 2 days (since ede04bd5a, 2026-04-28) with no perf complaints. The class of mutation bugs is fixed (currentData-merge pattern). Wait until a forcing function appears (perf at scale, second-consumer of the resolution code).

The correct verdict among (A) / (B) / (C) / (D) / (E) is the question for the arch agent.

## What's NOT being asked (note for arch agent)

- Whether `data.aliases` should be eliminated — that's a separate forward-compat question.
- Whether memory mode should switch from `path:line` to something else — out of scope.
- Whether KNode should add a separate `path_id` field even on non-bead nodes — only if option (D) is recommended.
