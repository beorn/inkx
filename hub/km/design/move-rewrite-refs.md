# Move/Rename with Reference Rewriting — design

**Bead**: `km-storage.move-with-rewrite-refs` (claimed, P2)
**Owner package**: `@km/storage` (primitive) + thin wiring in `apps/km-cli` and `apps/km-tui`
**Status**: design only — no implementation yet
**Tracking**: this doc is the design source of truth; the bead's acceptance bullets are derived from §7 (test plan) and §4 (commands to wire).

## 0. Why this exists

Today there are two related but inconsistent operations:

- `repo.renameNode(id, newContent, onProgress)` — already rewrites incoming wiki-form references via the link-cache backlink index, plus `updateRenameReferences` for `add::` rules and `blocked-by::` props. It is the only op that touches incoming references at all.
- `repo.moveNode(id, newParentId, position)` — pure re-parent. The data-store updates `parent_id`/`parent_idx`. Nothing on disk moves; nothing referencing the old location is updated.
- `bd rename <old-id> <new-id>` (apps/km-cli/src/commands/bd.ts:948) — patches `data.short_id` on the issue node and walks `blocked-by` props on every other issue, but ignores wikilinks, transclusions, dep edges (`blocks::`/`related::`), inline mentions (`@km/old-path`), and frontmatter `aliases`.

This means the four common user actions — rename a node, move a node, rename a bd id, restructure a folder — each rewrite a different subset of incoming references, and none rewrite all of them. The new primitive collapses these three call sites onto one canonical reference rewriter so every move/rename is total by default.

## 1. API surface

A single primitive lives in `@km/storage`, mounted on `Repo` (so command code keeps using the existing `using repo = await loadRepo(...)` shape):

```ts
// packages/km-storage/src/repo/repo.ts (interface in §1.2 below)

interface Repo {
  /**
   * Move and/or rename a node, rewriting every incoming reference in
   * the same vault. Default behaviour of every move/rename command.
   *
   * The primitive is total: it folds the existing `renameNode` (content
   * change → name change → backlink rewrite) and `moveNode` (parent
   * re-parent) into a single transaction, plus the additional reference
   * forms that today neither covers (frontmatter aliases, frontmatter
   * `parent_id`, dep-edge wikilinks, bare bd-id mentions in prose, fs
   * path moves).
   */
  moveNodeWithRefs(
    id: NodeId,
    spec: MoveSpec,
    options?: MoveOptions,
  ): MoveResult | MoveHandle
}

interface MoveSpec {
  /** New display content (heading text). When set, drives a rename. */
  newContent?: string
  /** New parent id, or null for root. When set, drives a re-parent. */
  newParentId?: NodeId | null
  /** Insertion index inside newParentId. Default: end-of-list. */
  position?: number
  /**
   * For bd-id renames: explicit new short id (`@km/scope/slug`) when
   * the rename is not a name change but an id-canonicalisation.
   * If unset, the new short id is derived from newContent (when set)
   * and the resolved fs_path. See §3.2.
   */
  newShortId?: string
}

interface MoveOptions {
  /** Skip the rewrite walk entirely. Default: false. Wired to --no-rewrite. */
  noRewrite?: boolean
  /** Do everything except commit DB / disk writes. Default: false. */
  dryRun?: boolean
  /**
   * Run the rewrite walk on a worker-style background queue and return a
   * MoveHandle; the data-layer move/rename applies synchronously regardless.
   * The TUI sets this when impact > heuristic threshold (§6).
   */
  background?: boolean
  /** Progress callback for the rewrite walk. */
  onProgress?: (info: MoveProgress) => void
  /**
   * Filter incoming-reference forms. Defaults to all forms enabled.
   * Used by tests and by power-user opt-outs (e.g. preserve aliases).
   */
  rewriteForms?: Partial<Record<RewriteForm, boolean>>
}

type RewriteForm =
  | "wikilink"      // [[old]], [[old|alias]], [[old#sec]], [[old^block]]
  | "transclusion"  // ![[old]]
  | "depEdge"       // blocks::, blocked-by::, related:: (wikilink targets)
  | "blockedByProp" // frontmatter props["blocked-by"].target string form
  | "frontmatterId" // bd parent_id frontmatter field
  | "aliases"       // frontmatter aliases: list entries
  | "ruleQuery"     // km.add::, km.sync:: path queries (already covered)
  | "bareIdMention" // @km/old/path in prose (rewriteLegacyIdMentions)

interface MoveProgress {
  phase: "data-layer" | "rewrite-scan" | "rewrite-apply"
  /** Hosts visited so far. */
  visited: number
  /** Total hosts to visit (known after `rewrite-scan` completes). */
  total: number
  /** References already rewritten. */
  refsRewritten: number
}

interface MoveResult {
  oldId: NodeId
  /** Same as oldId — node ids are stable across moves and renames. */
  newId: NodeId
  /** Display name before/after, when content changed. */
  oldName: string | null
  newName: string | null
  /** Canonical short id (path-form) before/after, when it changed. */
  oldShortId: string | null
  newShortId: string | null
  /** Filesystem path before/after, when it changed. */
  oldFsPath: string | null
  newFsPath: string | null
  /** Number of host nodes touched by the rewrite. */
  rewroteHosts: number
  /** Number of individual reference occurrences rewritten. */
  rewroteRefs: number
  /** Hosts that the walker found but couldn't rewrite cleanly. */
  failedHosts: Array<{ id: NodeId; reason: string }>
}

interface MoveHandle {
  /** Synchronously available — data-layer move already applied. */
  result: Pick<MoveResult, "oldId" | "newId" | "oldName" | "newName" |
                          "oldShortId" | "newShortId" | "oldFsPath" | "newFsPath">
  /** Resolves when the background rewrite completes. */
  rewroteRefs: Promise<MoveResult>
  /** Cancel the background walk; partial state is durable. */
  cancel(): void
}
```

The function returns `MoveResult` synchronously when `background: false` and `MoveHandle` otherwise. CLI commands always pass `background: false`. The TUI passes `background: true` when the impact heuristic trips (§6).

### 1.2 Mounting on `Repo`

`renameNode` already exists on the Repo interface. The plan is:

- Keep `renameNode(id, newContent, onProgress)` as a thin shim that calls `moveNodeWithRefs(id, { newContent }, { onProgress })` and returns the synchronous `MoveResult.rewroteRefs` count for backward compat. (apps/km-tui/src/views/tree-node-edit.tsx:156 keeps working unchanged.)
- Keep `moveNode(id, newParentId, position)` as a thin shim that calls `moveNodeWithRefs(id, { newParentId, position })` with `noRewrite: false`. (apps/km-cli/src/commands/move.ts:107 keeps working — it just gains the rewrite for free.)
- The bare `dataStore.moveNode` underneath is unchanged. The new primitive sits one layer up, alongside the hooks, undo proxy, and link-cache invalidation. This matters because the existing undo proxy relies on intercepting `updateNode`/`moveNode` calls, and the rewrite walk emits a fan-out of `updateNode` calls that must all be inside the same undo batch.

### 1.3 Atomicity

The primitive runs inside a single SQLite transaction:

1. data-layer move/rename (one or both of `moveNode` + `updateNode`)
2. rewrite walk (many `updateNode` calls)
3. link-cache `href` patch (the existing `UPDATE links SET href` step)

If any step throws, the transaction rolls back; on-disk markdown writes are deferred to the storage→fs sync layer so they happen post-commit (see §3.5). On-disk renames (`fs.renameSync`) are the last step — if they fail after the DB commits, the next vault sync reconciles. We treat the DB as authoritative through the operation; an interrupted rewrite leaves the DB consistent but the on-disk markdown stale, recoverable by re-running the primitive (idempotent — see §3.4).

In `background: true` mode, only the data-layer phase is inside the synchronous transaction. The rewrite walk runs in subsequent transactions, one batch per ~50 hosts. This is the same shape as the existing `renameNode` background job in km-tui's `jobRunner`.

## 2. Reference inventory

Every form an incoming reference can take, where it is parsed today, and how the primitive must rewrite it.

### 2.1 Body content (markdown source — `node.content`)

All forms below live in `KNode.content`. The link-cache (`packages/km-storage/src/db/links.ts`) indexes wiki-form occurrences by canonical href, so we don't need to walk every node to find the candidate hosts — `getBacklinksByHref(db, oldHref)` returns the host_id list directly.

| Form | Notation | Parser entrypoint | Index that finds it |
|---|---|---|---|
| Plain wikilink | `[[old]]` | `parseWikiLinks` (packages/km-markdown/src/parser.ts:117) | `links` table, rel=`link`, href=`km:old` |
| Aliased wikilink | `[[old\|Alias]]` | same | same href; alias lives in body, must be preserved |
| Section ref | `[[old#Heading]]` | same | href=`km:old#Heading`; **rewrite the path part only** |
| Block ref | `[[old^abc]]` | same | href=`km:old#^abc`; same |
| Transclusion | `![[old]]` | same | `links` table, rel=`embed`, href=`km:old` |
| Self-ref to old name | `[[#Heading]]` (when host is the moved node) | same | not in backlink index — covered by §2.7 |
| Logseq inline-property wikilink | `blocks:: [[old]], [[other]]` | `parseInlineProperties` (parser.ts:521) wraps `parseWikiLinks` | host's body has `[[old]]`, host's link row already exists — same backlink hit |
| Logseq inline-property single | `blocked-by:: [[old]]` | same | same |
| Bare bd-id mention in prose | `… see km-scope.slug for context …` | `rewriteLegacyIdMentions` regex (packages/km-beads/src/migrate.ts:235) | NOT in any index — requires content scan; gated by `bareIdMention` form (default off for non-bd renames) |

The bare-id mention case is the only body-content form not covered by the link cache. When `MoveSpec` indicates a bd id rename (i.e., `newShortId` is set), the primitive runs the `rewriteLegacyIdMentions`-style pass over every node's content; otherwise it skips. The cost is bounded — see §5.

### 2.2 Frontmatter

| Field | Where parsed | Example | Rewrite |
|---|---|---|---|
| `id` | km-markdown ast2nodes (sets `node.data.short_id`); km-beads/migrate.ts:149 emits it | `id: @km/scope/old-slug` | Update on the moved node (§3.2). On other nodes: appears only via `parent_id` (§2.5). |
| `aliases` | yaml list, consumed by name resolver | `aliases: [@km/scope/old-slug, km-scope.old-slug]` | When a host file's aliases list contains the old short id (path-form or bd-form), rewrite to the new short id. **Preserve other aliases.** Iterates the host's `node.data.aliases` array. |
| `parent_id` | km-beads/schema.ts:52 (bd v1.0 emits it) | `parent_id: @km/scope/old-slug` | Rewrite when it equals the old short id. |
| `created_by`, `created_at`, `closed_at`, `close_reason` | bd metadata | n/a | Never references other nodes; ignored. |
| Block-by prop string form | km-cli/src/commands/bd.ts:982 | `blocked-by: { type: "link", target: "km-scope.old-slug" }` | Already covered by `bd rename` today; the primitive subsumes it. The `target` field is a bare bd-id string, distinct from a wikilink. |

### 2.3 Heading rules (km.add, km.sync)

`updateRenameReferences` in repo.ts:620 already walks every node and rewrites path segments inside `node.data.rules.add` and `node.data.rules.sync` queries. The primitive keeps this code; the only change is that we move it from being a free function called only by `renameNode` to being a step in the unified rewrite walk.

### 2.4 Heading content side-effect

repo.ts:651 has a *broad* fallback that, when a rule changed in `node.data.rules`, also string-replaces `oldName` in `node.content`. This is overzealous (it runs the regex globally on `oldName` regardless of whether `oldName` appears in a rule context) but exists because the rule's `add::` heading is part of the content. The primitive keeps this behaviour to avoid regressing the existing rule rewrite, but **scopes** the regex to lines starting with `km.add::` or `km.sync::` rather than the whole content. (Listed in §8 as an open question — preserve as-is vs tighten now.)

### 2.5 The moved node's own writeable state

The node being moved has its own pile of fields that need updating in lock-step with the rewrite walk:

- `node.content` — the heading line, when `newContent` is set
- `node.name` — the canonical name field
- `node.title` — the display title
- `node.data.name` — the frontmatter title override
- `node.data.short_id` — the bd id (when `newShortId` is set)
- `node.data.aliases` — when promoting the old short id to an alias of the moved node (default: keep old short id as an alias when renaming, see §3.3)
- `node.parent_id` and `node.parent_idx` — the data-store re-parent
- `node.fs_path` — the on-disk path; may need to change when renaming or moving (§3.5)

All eight live in the `nodes` SQLite row and are updated in the data-layer phase before the rewrite walk starts. The rewrite walk reads `oldName`/`oldShortId`/`oldFsPath` from snapshots taken at the start of the transaction, never from the (already-mutated) row.

### 2.6 Code-block / verbatim skipping

`[[…]]` syntax is preserved verbatim inside fenced code blocks, indented code blocks, inline code, and HTML blocks — neither the parser nor the rewriter should touch them. The link-cache **does not** index occurrences inside fenced blocks (the mdast parse path strips them; only the body-text reaches `parseWikiLinks`). So the primitive's body-content rewrite is naturally code-block-safe **for indexed occurrences**.

The unsafe case is the `bareIdMention` pass (§2.1): bare-id mentions in code blocks must be skipped. `rewriteLegacyIdMentions` already does this — its pattern has explicit `\[\[…\]\]` and `\`…\`` capture groups that pass through verbatim. The primitive reuses that helper unmodified.

### 2.7 Out-of-scope reference forms (won't touch)

- Self-references inside the moved node's own content (`[[#Section]]` in the file being moved). These don't reference the old name, only a heading inside the same file. Re-parenting or renaming the file doesn't invalidate them.
- External URL links (`[link](https://…)`) — never name-based.
- mdlink / autolink wiki-style hrefs (`[link](old-path.md)`) — the link cache stores them under their literal href (no `km:` prefix); `getBacklinksByHref` finds them only if we also query by the path-form variants from `computeHrefsForNode`. This is wired into the existing backlink path, so it works automatically.
- Search rules / saved queries that match on body-text terms rather than node identity — Phase 2.

## 3. Rewrite ordering

Order matters because some rewrites would otherwise double-apply. The primitive runs phases in this fixed order, each phase fully completing before the next starts:

```
0. snapshot oldName, oldShortId, oldFsPath, oldHrefs[]   (read-only)
1. data-layer mutations on the moved node
   - dataStore.moveNode(id, newParentId, position)        (when re-parenting)
   - mutations.updateNode(id, { content, name, title,
                                data.name, data.short_id,
                                data.aliases })            (when renaming)
   - cache busts: childrenCache, nameIndex, resolveCache
2. rewrite walk — find candidate hosts via the link cache
   2a. wikilink + transclusion in body content
   2b. dep-edge inline properties in body content
   2c. ruleQuery rewrite in node.data.rules + line-scoped content rewrite
3. rewrite walk — find candidate hosts via frontmatter scans
   3a. blockedByProp string targets in node.data.props
   3b. frontmatterId / aliases scan over getAllNodes
4. bare-id mention pass (only when newShortId set)
   - one pass over getAllNodes, content-only
5. link-cache href update — UPDATE links SET href = ? WHERE href = ?
6. fs sync — rename .md file on disk, write new content
```

### 3.1 Why this order

- (1) before (2) so the rewrite walk reads the new state from the row when it needs to (e.g., re-querying backlinks after the rewrite to verify the count).
- (2a) before (2b): a single host may have both a `[[old]]` body link and a `blocks:: [[old]]` line. (2a) rewrites the body globally; (2b) is a no-op because the inline-property line was already touched. Idempotent — safe.
- (5) last because backlinks are queried by old href in (2a) — running (5) first would empty the index and prevent the walk from finding hosts.
- (6) last because we want the DB transaction to commit before any on-disk write. If fs rename fails, the next sync reconciles using the updated DB.

### 3.2 Deriving the new short id

Three input modes:

- **Pure rename** (`newContent` only): new name = `normalizeNodeName(newContent)`. New short id = old short id with the trailing slug rewritten to the slugified new name, **only when** the old short id's leaf is a slug (matches `/^[a-z0-9][a-z0-9-]*$/`). Otherwise the short id is unchanged. (Bd-id-shaped paths like `@km/scope/old-slug` get the leaf rewritten; numeric leaves like `@km/scope/3-old-slug` get the slug part rewritten while preserving the numeric prefix. Use `bdIdToPathFormWithSlug` semantics.)
- **Pure move** (`newParentId` only): new short id = `<new-parent-short-id>/<existing-leaf>` when the parent has a sigil-anchored short id; otherwise unchanged.
- **Bd id canonicalisation** (`newShortId` explicit): use as given. Caller knows what they want.

When the short id changes, both old forms (path-form `@km/scope/old-slug` and bd-form `km-scope.old-slug`) become aliases of the moved node by default — preserves existing prose mentions. (Toggle via `rewriteForms.aliases: false`.)

### 3.3 Avoiding double-rewrite

The rewrite walk maintains a per-host "already touched" set inside the transaction. When phase 3 considers a host that phase 2 already updated, it merges its changes into the existing pending content rather than re-running the regex on stale content. This prevents the case where (2a) rewrites `[[old]] → [[new]]` and (3a) sees the updated body and tries to re-match.

### 3.4 Idempotence

Re-running `moveNodeWithRefs` with the same (already-applied) spec is a no-op:

- Data-layer (1) detects no-op via `oldName === newName && oldParentId === newParentId`.
- Rewrite walk (2-4) reads `oldName/oldHrefs/oldShortId` from the post-rename row, finds zero backlinks because the index is already on the new href, exits with `rewroteHosts: 0`.

Re-running with a *partial* prior application (e.g., DB committed but fs rename failed) repairs it: phases 1-5 are no-ops; phase 6 retries the fs rename.

### 3.5 Filesystem path moves

The data-store `moveNode` doesn't touch `fs_path`. The fs-sync layer (storage→fs, the watcher loop) is what writes nodes back to disk. For the `moveNodeWithRefs` primitive to work end-to-end (including the on-disk rename), the primitive needs to:

- Compute the new `fs_path` from the new parent and new name. Hierarchy mirrors the path-form short id when one exists; otherwise re-uses the old fs_path's directory structure with the new leaf.
- Write `fs_path` into the row in phase (1).
- In phase (6), call `fs.renameSync(oldFsPath, newFsPath)` and then write the rewritten content of every touched host. The watcher should be paused during this (existing pause hook in the sync layer) and resumed after, otherwise the watcher will see N+1 file changes and rebuild the cache for each.

Open question (§8): can we drive (6) through the existing sync layer queue rather than calling `fs.renameSync` directly? The sync layer already has the move-pause-resume dance for other writes.

## 4. Commands to wire

### 4.1 `km move <node> <parent>` — apps/km-cli/src/commands/move.ts

Replace the bare `repo.moveNode(node.id, targetParentId, Date.now())` (line 107) with:

```ts
const result = repo.moveNodeWithRefs(node.id, {
  newParentId: targetParentId,
}, { noRewrite: options.noRewrite })
console.log(term.green("→"), `Moved ${nodeName} to ${targetName}` +
  (result.rewroteRefs > 0 ? ` (rewrote ${result.rewroteRefs} ref${result.rewroteRefs === 1 ? "" : "s"} in ${result.rewroteHosts} file${result.rewroteHosts === 1 ? "" : "s"})` : ""))
```

Add `--no-rewrite` to the option set. Default behaviour is `noRewrite: false`.

### 4.2 `bd rename <old-id> <new-id>` — apps/km-cli/src/commands/bd.ts:948

Replace the hand-rolled `data.short_id` patch + the `blocked-by` property loop (lines 964-997) with:

```ts
const result = repo.moveNodeWithRefs(issue.id, {
  newShortId: opts.newId,
}, { noRewrite: opts.noRewrite })
console.log(term.green(`Renamed ${opts.oldId} → ${opts.newId}` +
  (result.rewroteRefs > 0 ? ` (${result.rewroteRefs} refs in ${result.rewroteHosts} files)` : "")))
```

This is a strictly broader rewrite than today's hand-rolled walk — it also covers wikilinks, transclusions, dep-edge wikilinks, frontmatter aliases, frontmatter `parent_id`, and bare-id prose mentions.

Add `--no-rewrite` to the option set.

### 4.3 Future / latent call sites

- A future `bd promote <id> <new-scope>` (move a bead between scopes) — same primitive, same wiring.
- A future `km rename <old> <new>` CLI — currently rename happens only via the TUI editor; once we add a CLI rename, it calls the same primitive.
- The TUI rename path (`apps/km-tui/src/views/tree-node-edit.tsx:156`) — already calls `repo.renameNode`, which (per §1.2) becomes a shim over the primitive, so it gets the broader rewrite for free.
- The TUI inline-edit on column header — same.

The CLI flag spelling is `--no-rewrite` everywhere. The primitive's `MoveOptions.noRewrite` is the canonical name.

## 5. Performance

Cost analysis on a 5000-file vault:

### 5.1 Indexed phases (2a, 2b, 3a)

`getBacklinksByHref(db, oldHref)` is O(matching rows) — typical move/rename touches 0-50 hosts. SQLite indexed lookup, sub-millisecond at this scale. The rewrite is `host.content.replace(pattern, …)` for each host — string ops on ~10KB strings, ~10µs each. Aggregate: **<10ms for the indexed phases**, regardless of vault size.

### 5.2 Frontmatter scan (3b) and rule scan (2c)

`updateRenameReferences` already walks `dataStore.getAllNodes()` once. For 5000 nodes with average `node.data` ~1KB this is ~5MB of object traversal. Existing benchmark (renaming a project node in a large vault): ~50-100ms. Acceptable.

We can short-circuit by adding a SQLite query that pre-filters: `SELECT id FROM nodes WHERE data LIKE '%"parent_id":"@km/scope/old%' OR data LIKE '%"aliases":[%' …`. Defer to phase 2 unless profiling shows it matters.

### 5.3 Bare-id mention pass (4)

This is the only pass that scans `node.content` of every node. At 5000 nodes × ~10KB content = ~50MB string ops. The regex is moderate (3 alternation groups, no backtracking). Estimated: **~200-400ms** with naive sequential scanning.

Optimisations available if needed:

1. Pre-filter via SQLite FTS5: `SELECT id FROM nodes_fts WHERE nodes_fts MATCH 'km-scope'`. Cost: ~5-10ms; reduces the scan set to hosts that contain the prefix at all. Probable order-of-magnitude win.
2. Run only when `MoveSpec.newShortId` is set (the primitive already gates this).
3. Worker pool: Bun `Worker` with shared mmap of content. Probably overkill; start without it.

### 5.4 Glob fallback (not used)

The bead description suggests `Bun.glob` over `*.md`. That's the wrong primitive — the link cache already indexes everything we need. We avoid the glob walk entirely; the primitive reads from the DB. The only fs traversal is the final rename in phase 6.

### 5.5 Estimate summary

| Operation | Hosts touched | Time | Notes |
|---|---|---|---|
| Pure re-parent of a leaf node, no incoming refs | 0 | <5ms | Data-layer only. |
| Pure re-parent with 5 backlinks | 5 | <10ms | Indexed. |
| Rename of a project node with 50 backlinks | 50 | ~50ms | Indexed + rule scan. |
| Bd id canonicalisation with 200 inline mentions | ~50 | ~300ms | Bare-id pass dominates. |
| Restructure a folder with 500 incoming refs | ~500 | ~500ms | Indexed; multiple href variants. |

The 200ms threshold for "go background" (§6) is calibrated against this — anything that scans `getAllNodes` for the bare-id pass crosses it.

## 6. Background-task variant

In TUI sessions (`bun km view …`) the user expects move/rename to feel instant. The primitive's `background: true` mode keeps the data-layer move synchronous (sub-10ms) and defers the rewrite walk to a background queue.

### 6.1 Threshold heuristic

Before invoking the primitive, the TUI calls a cheap impact estimator:

```ts
interface MoveImpact {
  /** Backlink count from the link cache. Cheap. */
  backlinkCount: number
  /** Will the bare-id pass need to run? */
  requiresBareIdPass: boolean
  /** Estimated milliseconds. */
  estimatedMs: number
}

repo.estimateMoveImpact(id, spec): MoveImpact
```

`estimateMoveImpact` runs `getBacklinksByHref` + `getAllNodes().length` to compute `estimatedMs` via the same model as §5.5. The TUI passes `background: true` when `estimatedMs > 200` OR `backlinkCount > 100`.

### 6.2 Integration with km-tui's `jobRunner`

The TUI already has `jobRunner.submit({ description, impact, countdownMs, execute })` (apps/km-tui/src/views/tree-node-edit.tsx:149). The same shape works:

```ts
const impact = repo.estimateMoveImpact(node.id, { newParentId })
const handle = repo.moveNodeWithRefs(node.id, { newParentId }, { background: true, onProgress })
// data-layer move is already done — UI updates immediately
jobRunner.observe({
  description: `Rewriting refs to '${node.name}'`,
  impact: `${impact.backlinkCount} ref${impact.backlinkCount === 1 ? "" : "s"} in ${impact.estimatedMs}ms`,
  promise: handle.rewroteRefs,
  cancel: () => handle.cancel(),
})
```

The TUI's status-bar primitive (the same one used by `renameNode` today) renders progress; nothing new here. The handle is cancellable — important when the user kicks off another move while the first is still running.

### 6.3 Progress reporting

The primitive emits `MoveProgress` events at:

- Once per phase transition (`data-layer` → `rewrite-scan` → `rewrite-apply`).
- Every 25 hosts during `rewrite-apply`.

This is identical to the existing `renameNode(onProgress)` shape, so the TUI's existing job-progress UI consumes it without changes.

## 7. Test plan

Tests live in `packages/km-storage/tests/move-with-refs.test.ts` and `apps/km-cli/tests/commands/move.test.ts`. Use the existing test-env harness (`createTestEnvRepo` in packages/km-storage/src/testing/env.ts).

### 7.1 Unit — primitive surface

- **Pure rename, no backlinks.** `result.rewroteHosts === 0`, `result.rewroteRefs === 0`, name updated.
- **Rename with 1 wikilink backlink.** Host's content gets `[[old]]` → `[[new]]`. `rewroteRefs === 1`.
- **Rename with aliased wikilink.** `[[old|Display]]` → `[[new|Display]]` (alias preserved).
- **Rename with sectioned wikilink.** `[[old#Heading]]` → `[[new#Heading]]`.
- **Rename with block ref.** `[[old^abc]]` → `[[new^abc]]`.
- **Rename with transclusion.** `![[old]]` → `![[new]]`.
- **Rename with dep edge.** `blocks:: [[old]], [[other]]` → `blocks:: [[new]], [[other]]`.
- **Rename with frontmatter aliases.** Host with `aliases: [old-id, foo]` → `aliases: [new-id, foo]`.
- **Bd-id rename with bare prose mention.** `… see km-scope.old for context …` → `… see @km/scope/new for context …`. Verify code-block skip: `\`km-scope.old\`` stays as-is; ```` ```\nkm-scope.old\n``` ```` stays as-is.
- **Pure move (re-parent), no name change.** Backlinks unchanged (still match on name); only `parent_id` changes.
- **Move + rename in one call.** Both effects applied, transaction-atomic.
- **No-op move (current parent).** Returns synchronously, `rewroteHosts === 0`.
- **No-op rename (same content).** Same.
- **Idempotence.** Run the primitive, run it again with the *same* spec — second call is a no-op.
- **Idempotence under partial failure.** Manually corrupt the fs_path post-DB-commit; re-run repairs.

### 7.2 Unit — opt-out and rewrite forms

- **`--no-rewrite` / `noRewrite: true`.** Data-layer move applies; backlinks untouched. Verify `rewroteHosts === 0`. Verify the link-cache `href` column is also untouched (so subsequent backlink queries still return the host with the stale ref).
- **`rewriteForms: { aliases: false }`.** Frontmatter aliases not rewritten; everything else is.
- **`rewriteForms: { bareIdMention: false }` on a bd rename.** Wikilinks rewritten; bare-id mentions stay.

### 7.3 Integration — backlink count parity

- **Backlink count before/after matches.** `getBacklinksByHref(db, oldHref).length === getBacklinksByHref(db, newHref).length` post-rewrite. Catches the case where the rewrite missed an occurrence.
- **`getRenameImpact(id)` after rewrite reports zero backlinks.** Same invariant.

### 7.4 Integration — CLI wiring

- **`km move A B` rewrites refs by default.** Run command, assert exit message includes "rewrote N refs".
- **`km move A B --no-rewrite`.** Move applied; refs untouched.
- **`bd rename old-id new-id` rewrites refs.** Verify wikilinks, dep edges, frontmatter aliases, frontmatter parent_id, bare-id mentions all updated.
- **`bd rename old-id new-id --no-rewrite`.** Only `data.short_id` updates (legacy behaviour).

### 7.5 Integration — TUI background variant

- **TUI rename below threshold runs synchronously.** Smoke test via termless: type new name, assert progress UI never appears.
- **TUI rename above threshold runs in jobRunner.** Synthetic vault with 200 backlinks; assert progress UI appears, completes, status bar reports refs rewritten.
- **TUI rename cancel mid-walk.** Kick off above-threshold rename, cancel; assert: data-layer move stuck, partial rewrite committed, no exception, no zombie progress.

### 7.6 Edge cases

- **Concurrent move from same vault.** Two `repo.moveNodeWithRefs` calls in quick succession on disjoint nodes — both succeed; no transaction interleaving.
- **Concurrent move on overlapping refs.** Move A and B where some host references both. Whichever wins second sees the post-first state; final content has both rewrites applied.
- **Rename to a name that collides with an existing node.** Define semantics: error vs allow (and let the name index resolve to the more-recent node). Recommendation: error by default, override with explicit `MoveOptions.allowNameCollision: true` (added in §8).
- **Rename a node that's the target of a circular ref.** Self-link `[[self]]` in the moved node's own content. The rewrite walk skips the moved node itself (its content was already updated in phase 1).
- **Frontmatter `aliases` containing the new name.** No-op — already canonical.
- **Code-block fenced wikilink `\`\`\`md\n[[old]]\n\`\`\``.** Stays verbatim. (Already enforced by the link-cache: fenced-block contents aren't indexed, so `getBacklinksByHref` doesn't find them.)
- **Inline code wikilink `\`[[old]]\``.** Same.

### 7.7 Fuzz / property tests

Add to the existing slow-test fuzz suite (under `packages/km-infra/tests/fuzz` if that's where it lives, or `*.slow.test.ts`):

- **Round-trip:** for a random vault, pick a random node, rename via primitive, re-parse all touched files, assert link cache rebuilt from disk matches the in-memory cache.
- **Idempotence:** any move spec applied twice has no extra effect.

## 8. Open questions

1. **fs sync coupling.** Should the primitive call `fs.renameSync` directly in phase 6, or enqueue the rename through the existing storage→fs sync layer? Direct is simpler; via sync layer respects watcher pause/resume. **Recommendation: direct, after a `repo.pauseSync()` / `repo.resumeSync()` bracket.** Needs design input from whoever owns the sync layer.
2. **Default for `--no-rewrite` on `bd rename`.** Today `bd rename` rewrites only `blocked-by` props. The primitive rewrites everything. Is that an acceptable behaviour change, or do we want a deprecation period where `bd rename` requires `--rewrite` to opt in for one release? **Recommendation: rewrite by default — today's `bd rename` is undocumented as "limited", and the fuller rewrite is the intuitive behaviour. Mention in the release note.**
3. **Rule rewrite scope tightening (§2.4).** The existing `updateRenameReferences` does a broad `node.content.replace(/oldName/g, newName)` whenever a rule changes. Should the primitive tighten this to lines matching `^(km\.add|km\.sync)::` only, or preserve the broad behaviour? **Recommendation: tighten — but ship behind a feature flag for one release so we can revert if a vault breaks.**
4. **Name collision semantics.** When renaming to a name another node already owns, error or allow? **Recommendation: error by default; provide `MoveOptions.allowNameCollision: true` for power users.**
5. **`bareIdMention` pass cost on huge vaults.** §5.3 estimates ~300ms for 5000 nodes. If profiling shows it's worse, add an FTS5 pre-filter. **Recommendation: ship without the pre-filter; add it in a follow-up bead if real vaults hit the threshold.**
6. **Aliases promotion policy.** When the short id changes, do we always add the old short id to the moved node's `aliases` list? Or only when the rename came from `bd rename`? **Recommendation: always add — old prose mentions stay resolvable. User can `--rewriteForms='{aliases:false}'` to opt out.**
7. **CRDT compatibility.** The primitive emits a fan-out of `updateNode` events. Memory `storage-crdt-direction.md` flags event-sourcing-lite as the direction. Does this primitive emit one composite event (`move-with-refs`) or N individual events (`update-node` × N)? **Recommendation: one composite event with the full diff payload — easier to replay, easier to invert for undo.** Coordinate with `km-storage` event design.
8. **Undo semantics.** A composite move-with-refs op should undo as one unit. Verify with the undo proxy that the existing `updateNode`-fan-out shape produces a single undoable batch (the existing `renameNode` wraps the loop in `startBatch`/`endBatch`). The primitive does the same.

---

## Appendix — file-path index

Code paths referenced in this design (file:line for traceability):

- `apps/km-cli/src/commands/move.ts:107` — current `repo.moveNode` call site
- `apps/km-cli/src/commands/bd.ts:948-1000` — current `bd rename` implementation
- `apps/km-tui/src/views/tree-node-edit.tsx:153-167` — TUI rename via `jobRunner.submit`
- `apps/km-tui/src/views/CardColumn.tsx:928-934` — TUI rename via `jobRunner.submit` (column header)
- `packages/km-storage/src/repo/repo.ts:438-447` — current `moveNode` implementation
- `packages/km-storage/src/repo/repo.ts:509-575` — current `renameNode` implementation
- `packages/km-storage/src/repo/repo.ts:620-673` — `updateRenameReferences` (rule + blocked-by prop rewrite)
- `packages/km-storage/src/db/links.ts:90-99` — `getBacklinksByHref`
- `packages/km-storage/src/db/links.ts:124-132` — `computeHrefsForNode` (multi-href backlink resolution)
- `packages/km-storage/src/db/links.ts:155-168` — `getBacklinksForNode`
- `packages/km-markdown/src/parser.ts:41-47` — `WIKILINK_REGEX`, `HAS_WIKILINK`
- `packages/km-markdown/src/parser.ts:117-150` — `parseWikiLinks`
- `packages/km-markdown/src/parser.ts:450-455` — `normalizeNodeName`
- `packages/km-markdown/src/parser.ts:521-536` — `parseInlineProperties`
- `packages/km-markdown/src/link-href.ts:25-39` — `normalizeLinkHref`
- `packages/km-beads/src/migrate.ts:235-257` — `rewriteLegacyIdMentions` (reused for the bare-id pass)
- `packages/km-beads/src/migrate.ts:309-319` — `bdIdToPathForm`
- `packages/km-beads/src/migrate.ts:362-371` — `bdIdToPathFormWithSlug`
- `vendor/bearly/tools/lib/backends/wikilink/index.ts` — refactor.ts wikilink backend (NOT reused; the link cache is faster)
