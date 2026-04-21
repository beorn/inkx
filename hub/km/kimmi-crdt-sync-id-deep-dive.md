# Kimmi CRDT / Sync / Identity Deep-Dive (for km A-vs-C decision)

Research date: 2026-04-21. Source: `~/Code/pim/kimmi` docs + code.
All file paths below are absolute.

---

## ID SYSTEM

### Q1 — Identity primitive

Kimmi has **three layers of ID**, not one:

1. **Item ID** — UUID v4, user-space identifier, stable for the item's life.
   `/Users/beorn/Code/pim/kimmi/docs/design/kimmi-tree.md:10-12`:
   `id: string // UUID v4`.
2. **Automerge Document ID** — one per content doc, stable, cryptographic, opaque.
   `/Users/beorn/Code/pim/kimmi/packages/kimmi-repo/src/FSRepo.ts:178` stores `treeDocHandle.documentId` in `root.json`.
3. **`item_ref` URI** — the typed reference FROM the TreeDoc INTO content. URI scheme encodes what kind of thing is behind the id:
   `/Users/beorn/Code/pim/kimmi/docs/design/kimmi-tree.md:13-17`:
   `item_ref: string // URI determining content type: "automerge:abc..." → Content document; "file:sha256:def..." → Binary file; "item:uuid-789" → Link to another item; "https://..." → External URL`.

Blobs are SHA-256 content-addressed: `file:sha256:<hash>` (`kimmi-repo.md:19-22`).

So: item identity = UUID. Content identity = Automerge URL. Blob identity = hash.
ADR-001 is explicit ("Option 6B: URI Scheme (Current)", `decisions/001-repo-data-model-design.md:371-380`).

### Q2 — IDs surviving rename/move

Fully decoupled from path. `TreeDoc` has **only** `parent_id` + `parent_idx` (fractional index) — no path is stored on the item.
`/Users/beorn/Code/pim/kimmi/docs/design/kimmi-tree.md:34-40`:
> Items use `parent_id` to link to parent … `parent_idx` for ordering … To reorder: Update `parent_idx` only, no sibling updates needed.

Path is **derived** from tree position during markdown materialization; the mapping `itemId ↔ filename` is a cache in `items.db` (not the truth):
`/Users/beorn/Code/pim/kimmi/docs/design/kimmi-fsrepo.md:302-306`: "Track item ID → filename mapping in `items.db`."

### Q3 — Cross-repo references

**Not addressed.** Kimmi is designed as **one repo per device, fully replicated** (`kimmi-sync.md:14-30`, `kimmi-repo.md:160-170`). There is no per-repo federation scheme. `item_ref` URIs point only into the same repo's docs/blobs, or external HTTPS. No `repo:X/doc/Y#anchor` style.

### Q4 — Non-obvious identity issues kimmi hit

- **Title duplication** in TreeNode for performance (ADR-014 §Title Duplication, `decisions/014-unified-item-data-model.md:172-175`) — explicitly accepted to avoid N+1 lookups. Identity of "title" now lives twice; CRDT merging must be consistent across both.
- **URI + explicit `type` coexist** (ADR-014 §Type Field, `014:159-170`): `item_ref` URI in TreeDoc, but a separate `type` field on the Item itself, because URIs alone weren't enough for discriminated unions / querying.
- **No item_type field on items** — the URI scheme in `item_ref` is the discriminator (`ADR-001:338-340`).
- **UID matching across move**: ADR-003 notes the "moved item" problem is still an open question — "Should moved items be flagged to prevent re-parenting on sync?" (`decisions/003-import-parenting-strategy.md:173-177`).

---

## CRDT SPECIFICS (Automerge choices)

### Q5 — One doc or many

**Split: one TreeDoc + one Item doc per item + one blob per binary.** Direct quote, `kimmi-repo.md:11-23`:

> **Automerge Documents** (managed via automerge-repo Repo)
> - **Tree document**: Single doc with all items, hierarchy, properties
> - **Item documents**: One doc per item containing markdown text
> - Each accessed via `DocHandle` for automatic sync/storage

Rationale (`kimmi-repo.md:29`): "Tree + items separation: Tree changes don't require syncing all text."
ADR-001 §Content Document Separation evaluates unified vs separate and chooses separate (`001:280-322`).

Operations are NOT reified into a separate stream — the mutation API is `DocHandle.change(doc => { ... })` directly (`kimmi-repo.md:123-150`; confirmed in code at `FSRepo.ts:329-340`, which does `itemHandle.change((doc) => deepMerge(doc, item))`).

### Q6 — Markdown fidelity

**Largely not addressed.** Kimmi has not seriously confronted markdown round-trip fidelity for PKM-style notes — its real-world testing is **all CardDAV/vCard** (3,724 iCloud contacts). For vCard it is explicit about round-trip:

`docs/decisions/014-unified-item-data-model.md:179-182`: round-trip preserved via `meta._vcard` / `meta._ical` raw-format blobs nested in `meta.*`.

For markdown:
- Materialization is described only at a structural level (`kimmi-fsrepo.md:213-313`) — title → heading, list items → children, frontmatter → props.
- No fidelity test corpus. No discussion of preserving YAML key ordering, comment preservation, whitespace, Obsidian-specific syntax (callouts, embeds, math).
- `ItemDoc.content` is a plain string in v0.7, parsed AST deferred to v3+ (`ADR-013:34`, `014:256`).

Markdown is described as "a _projection_ for editing, NOT the Repo itself" (`kimmi-fsrepo.md:224`) — the same "markdown is projection" posture as km-Family-C.

### Q7 — Structural concurrent edits

Addressed only in one spot — "Concurrent parent_id changes: Last-write-wins per Automerge semantics. Moving same item to different parents: Automerge resolves via timestamps" (`ADR-001:467-469`). **No discussion** of harder structural operations (moving a heading subtree vs concurrently editing a block inside it). No known-failure-mode catalog.

### Q8 — History compaction / storage overhead

Lean on automerge-repo's built-in **snapshot + incremental** pattern — no custom compaction. `research/automerge.md:299-312`:

> Every change writes to incremental/<change-hash>. When incremental size exceeds compressed doc size, create snapshot … Old incrementals can be deleted after new snapshot.

Kimmi adopts this without modification. Pruning / history truncation is an **open question** (`automerge.md:559-562`): "Document compaction strategy? … Archive old/deleted items vs keep in history?" — unresolved.

### Q9 — External edits during concurrent CRDT merges

**Does not arise in current kimmi scope.** Kimmi's external edits are CardDAV/CalDAV (structured pushes) not vim-edit-while-syncing. The CardDAV merge pipeline (`kimmi-sync.md:183-226`) is three-phase Remote↔Cache↔Repo with the `.vcf` cache as a well-defined middle layer — external edit = a new .vcf appearing in the cache directory, imported as `RepoOp`. The watcher-debounce / self-write-suppression problem for markdown is **not designed yet** — the file-watching section (`kimmi-fsrepo.md:308-313`) lists only editor swap file ignores, not echo suppression.

### Q10 — automerge-repo subset

Kimmi uses automerge-repo **as-is**, not a subset (`kimmi-repo.md:36-55`). Extensions are:
1. **Blob store** (content-addressed binaries, not in automerge-repo),
2. **Markdown materialization** (FS-only, optional),
3. **PIM connectors** (CardDAV/CalDAV/IMAP).

No custom storage adapter, no custom sync protocol. Uses `NodeFSStorageAdapter` directly.

---

## SYNC ARCHITECTURE

### Q11 — Topology

**Two distinct sync surfaces:**

1. **Repo-to-Repo replication** — Automerge-native, designed for **peer-to-peer + relays** via pluggable NetworkAdapters (WebSocket, MessageChannel, BroadcastChannel). `kimmi-sync.md:131-155`. Currently **aspirational** — status says "Peer-to-peer replicators (Repo-to-Repo over network)" is "Future (v0.7+)" (`kimmi-sync.md:766-770`). Implemented: **none**.

2. **Connectors** — external system sync (CardDAV today via vdirsyncer). Three-phase: Remote ↔ Cache ↔ Repo (`kimmi-sync.md:183-226`).

The Repo is explicitly described as a "**sync hub**" in the hub/spoke sense (`kimmi-sync.md:13-30`) but this is not a server-central topology — each device is a full replica.

### Q12 — CardDAV/CalDAV bidirectional?

Yes, **truly bidirectional**, via a loop-until-convergence algorithm. `ADR-013:41-44`:

> Implement bidirectional sync using unified Item type … Loop-until-convergence: Push → pull → diff → apply → repeat until no changes.

Typical convergence is 2–3 iterations because remotes normalize formatting on push (`ADR-013:237-240`). Max 10 iterations, throws if not converged (`ADR-013:222`).

Conflict resolution lives in two places: (a) Automerge CRDT for concurrent **local** edits to different fields, and (b) the three-level change-detection scheme (`ADR-013:46-157`): Level 1 "which items" via vdirsyncer, Level 2 "which fields" via `microdiff` against a baseline materialized from prior Automerge heads, Level 3 "which characters" via diff-match-patch (deferred).

Explicitly noted: **Automerge's sync protocol does NOT work for CardDAV** (`research/automerge-field-level-changes.md:178-195`): "Automerge sync protocol CANNOT be directly used for CardDAV/CalDAV sync. We need custom sync logic."

### Q13 — External vs internal edit distinction

External edits route through `RepoOp` operations with explicit provenance (`connector.syncOps(pushOps): RepoOp[]`, `ADR-013:270-292`). The idempotency cache (`item-cache`, `deleted-ids`) detects "we just pulled this" and prevents ping-pong (`ADR-013:208-218`). So not lossy — external edits become first-class Automerge changes, but the *parse/normalize* step can lose information (X-* extensions are preserved via `meta._vcard` round-trip).

For markdown `.md` files specifically (filesystem materialization), distinction is **not designed**. `kimmi-fsrepo.md:308-313` just says "file watcher debounces 100ms, ignores swap files" — no self-write suppression protocol described.

### Q14 — Sync dance Automerge ↔ markdown

Under-specified. The doc says (`kimmi-fsrepo.md:287-300`):

> - Repo → Files: Serialize items to `.md` files
> - Files → Repo: Parse `.md` files, update Automerge documents via DocHandle
> - Debounce rapid changes (100ms default)

That's it. No echo-suppression scheme, no reconcile strategy on divergence, no "which side wins if both changed" policy for markdown. This is the most under-designed part of kimmi's filesystem story.

---

## FILESYSTEM PROJECTION

### Q15 — Eager or lazy

Declared optional and lazy-capable: "Optional markdown materialization for human editing (v1+)" (`kimmi-repo.md:232`). Default is **not** to materialize. When enabled, it's watcher-driven both directions with debounce. Not currently implemented — v1+ future work.

### Q16 — If `.md` is deleted

**Rebuildable.** Explicit quote (`kimmi-fsrepo.md:40-42`): "`.kimmi/docs/` + `.kimmi/blobs/` = Repo Storage (required); … Workspace files (incl. markdown) = Filesystem Materialization (optional)." And `kimmi-fsrepo.md:338`: "Can be rebuilt from `.kimmi/docs/` if corrupted."

### Q17 — Markdown as git-working-directory

Yes, architecturally explicit. `kimmi-fsrepo.md:16`:
> Architecture analogy: Like Git - `.kimmi/` is the repository, workspace markdown files are the working directory.
And `kimmi-fsrepo.md:224`:
> Markdown files are a _projection_ for editing, NOT the Repo itself.

### Q18 — User style preferences in projection

**Not addressed.** No tabs-vs-spaces, no YAML style, no frontmatter ordering preferences. Materialization is greenfield.

---

## QUERY / INDEXING

### Q19 — Where queries run

In-memory over the Automerge TreeDoc today. Pure helper functions (`kimmi-repo.md:148-157`): `queryItems(tree, filters)`, `findByUid`, etc. ADR-014 introduces a planned **ItemIndex layer** (SQLite, materialized) but defers implementation (`decisions/014-unified-item-data-model.md:184-212`):

> Status: Design complete, implementation deferred. … When to implement: Real repos exceed 5K items, query performance degrades, or complex queries (FTS, aggregations) needed.

### Q20 — Index build/invalidation

Design only. `kimmi-fsrepo.md:342-345`: "Updated when Repo changes (via DocHandle listeners). Incremental updates for performance." No implementation.

### Q21 — Query patterns

Planned (`kimmi-query.md` + ADR-002 deferred):
- **Backlink index** — wikilink graph (`kimmi-query.md:11-34`)
- **FTS5** full-text
- **Property index** — filter by doc_type / schema fields
- Graph queries (linked items)

None implemented; ADR-002 is in "design only" status.

---

## SCALE

### Q22 — Tested scale

**3,724–3,743 iCloud contacts** is the only real-world scale test (`ADR-007:310`, `roadmap.md:123`, `roadmap.md:466`). Throughput: `research/automerge.md:448-453` notes "~749 contacts/second for 3,737 contacts" during sync apply. No 20k or 100k test.

### Q23 — Acknowledged Automerge ceilings

Explicitly (`research/automerge.md:412-418`):

> Documents with large histories (>60k edits) can be slow to sync. Sync requires loading full document into memory. Sync server can struggle with high traffic on large docs. Currently in beta.

And (`ADR-001:462-466`):
> At what item count does single tree become slow? Plan sub-tree splitting when repos exceed 10,000 items.

### Q24 — Too-many-docs-to-load

Kimmi's mitigation (`automerge.md:421-428`): "Multiple smaller documents better than one huge document. Blob storage separate from CRDT documents. Lazy loading of body documents. Selective sync (only needed docs)." Lazy-load is implemented for Item docs (`FSRepo.ts:211-246` — `getDoc` loads on demand, cached in `itemDocHandles` Map). Sub-tree splitting is **future work** (`ADR-001:434`).

---

## LESSONS LEARNED / GOTCHAS

### Q25 — "We tried X and it didn't work" findings

- **Automerge doesn't have diff/patch APIs.** `research/automerge-field-level-changes.md:104-116`: "the JavaScript API does not expose a `getPatches()` or `diff()` function for extracting patches between document states. … ❌ doc.diff(oldHeads, newHeads) — NOT AVAILABLE." Kimmi built custom field-level comparison on top (using `microdiff`).
- **Automerge sync protocol can't talk to CardDAV/CalDAV.** `automerge-field-level-changes.md:190-195` (quoted Q12).
- **Raw vCard text as internal format rejected** (ADR-007 Alternative A: no queryability).
- **jCard rejected** (ADR-007 Alternative B: poor ergonomics, 33% larger, array-mutation CRDT unfriendliness).
- **JSContact rejected for v0-v2** (ADR-007 Alternative C: "Zero JavaScript/TypeScript implementations … Standard age: 6 months old (May 2024 publication)").
- **Text type rejected for most fields** (`automerge-field-level-changes.md:364-389`): hybrid — Text only on `.content`, plain strings elsewhere. "Since we don't need character-level merging, string type is vastly more efficient."
- **Text type entirely removed in Automerge 3.0** upstream — kimmi's docs are freshly aware of this (`research/automerge.md:26-51`).
- **Custom Cache interface replaced by AsyncMap** after architecture review (`ADR-015:40-60`): "Inflexible - Adding new state (e.g., `unappliedOps`) requires new methods. Not reusable."

### Q26 — Deferred under scale pressure

- Sub-tree splitting (`ADR-001:434-437`): "For large repos (10,000+ items), implement sub-tree documents with lazy loading."
- ItemIndex / SQLite layer (`ADR-014:184-212`).
- Query engine (ADR-002 deferred entirely).
- Compaction / history pruning (`automerge.md:559-562`).
- Blob GC (`kimmi-fsrepo.md:205-209`: "Track blob references from items. Periodically scan for unreferenced blobs. Configurable retention period" — design only).
- Markdown materialization (v1+, not implemented).
- File-watcher self-write suppression / echo-loop handling (absent).
- Crash-safe sync queues (`ADR-013:525-567` — "Planned for v0.8.5 (T806-T809)", `in-memory cache doesn't survive crashes`).

### Q27 — Explicit "not ready / haven't figured out"

- `ADR-013:231`: "Limitations: Idempotency cache … is not crash-safe across iterations."
- `ADR-003:173-178` — four open questions unresolved on moved-item re-parenting and cascade behaviors.
- `kimmi-sync.md:761-762`: "Delete detection in FSCache (T656 deferred). Additional vCard properties during sync (T657 deferred)."
- `research/automerge.md:547-578` — 6 numbered open questions including SyncItem necessity, blob sync coordination, document granularity, compaction, adapter selection, lazy loading.
- `kimmi-fsrepo.md:199,209`: "`data: string // "blob:ab/cd1234..." or "inline:base64..." (TBD) … TBD: Threshold for inlining small blobs."
- `kimmi-query.md:47-49`: "Query syntax and execution details are still being designed."

---

## Synthesis for km

1. **Adopt**: URI-scheme identity (`automerge:`, `file:sha256:`, `item:`, `https:`) + stable UUID item IDs + fractional-index ordering. The ADR-001 design is clean, battle-tested at 3,700 items, and zero-friction to retrofit onto km's current path-based identity. The **three-level change detection** split (items / fields / characters) via `microdiff` is the right frame for km's "what changed?" question — keep it even if we don't adopt Automerge.

2. **Avoid / cautionary**: Kimmi quietly proves that **Automerge does not solve the hard problems** we think it does — no diff API, no sync to external systems, sync-protocol limits >60k edits, Text type thrash across versions, mandatory custom field-comparison code anyway. The per-item Automerge-doc explosion (one DocHandle per note) is untested at 20k notes and its scale ceiling is acknowledged but not measured. The **markdown fidelity / echo-suppression** gap is massive in kimmi — we should not assume "Family C" automatically solves round-trip.

3. **Still unknown in kimmi**: cross-repo federation (Q3 — kimmi is explicitly single-repo), block-level IDs inside markdown (kimmi has item-level only; `.content` is a plain string), structural concurrent-edit semantics beyond last-write-wins on `parent_id`, file-watcher self-write suppression, markdown round-trip fidelity corpus, compaction/GC policy, ItemIndex materialization timing. km's problem surface is larger than kimmi has confronted.

4. **A vs C tip**: **Neither side is conclusively pushed by kimmi.** Kimmi's design shows that (a) DB-as-truth is *buildable* and the markdown-as-projection posture is defensible, BUT (b) the atomic layer doing real work is **stable IDs + SQLite-style indexes + custom field diffs** — Automerge is, in practice, a *storage substrate* kimmi could have swapped for SQLite + event log without losing most of its design. That weakens the "C requires CRDT" framing. Since stable IDs + federation are already decided, and those are the load-bearing wins, km can move toward C's *identity discipline* without committing to Automerge. kimmi's experience suggests **C-without-CRDT** (SQLite + stable DocId/BlockId + operation log) is the pragmatic middle.

5. **Validating experiment**: Take km's current vault, generate stable DocIds (UUID) + BlockIds per paragraph/heading, store them in a `.km/state.db` SQLite with `(doc_id, block_id, content_hash)` rows + an operation log table, and implement kimmi's `microdiff`-based Level-2 change detection to reconcile `.md` file changes against the DB. Success criterion: rename a file, move a heading between files, edit a block — all three preserve identity across the round-trip, with the `.md` remaining human-readable and git-diffable. This proves the "identity + diff" core without Automerge, and if it works, we've gotten 80% of Family C's value with 20% of kimmi's complexity.
