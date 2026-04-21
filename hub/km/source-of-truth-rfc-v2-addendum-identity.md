# RFC v2 Addendum — Identity Model

**Status**: Addendum to `source-of-truth-rfc-v2.md` (2026-04-21). Refines §2.2's "Stable identity primitives" prerequisite after discussion of kimmi, decker's MURL, and FS-recovery robustness requirements.

**Decision**: **One ULID identity, defense-in-depth recovery, zero ID noise in markdown except where lazily needed.** See details below.

---

## 1. What changed from RFC v2 §2.2

v2 §2.2 proposed three new primitives: `DocId`, `BlockId`, `RepoId`. That framing was wrong. Revised:

| v2 proposal | Revised | Reason |
|---|---|---|
| `DocId` branded type | **Delete**. Use `NodeId`. | A file's root-node IS a KNode with `id: string` ULID today. No separate Doc concept needed. |
| `BlockId` branded type | **Delete**. Compute on demand. | Block refs in markdown are `^<hashBlockId(node.id)>` — a pure function of the ULID, not a separate field. |
| `KNode.block_id?` field | **Delete**. | Derived on serialize, reverse-scanned on parse. No storage needed. |
| `KNode.name?` field | **Keep as display cache**. | Not identity; a denormalized slug for fast wiki-link lookup. Regenerable. |
| `RepoId` branded type | **Keep**. | Required for federation; lives in `.km/config.toml`. User-facing `km:/` URLs use human-readable repo aliases mapped to RepoIds. |

**Net primitive inventory**: `NodeId` (brand the existing `KNode.id` ULID) + `RepoId` (for federation). That's it.

---

## 2. The core idea — defense-in-depth identity

km's identity problem is specifically "reconstruct which file is which, and which block is which, after arbitrary offline FS changes." No single signal is foolproof under adversarial edits; the UNION of signals is very robust.

### 2.1 Identity signals, ranked by confidence

| Rank | Signal | Source | Survives | Breaks on |
|---|---|---|---|---|
| 1 | Embedded `id:` in frontmatter | File itself | Rename, move, copy, cross-device, restore | User manually deletes the line |
| 2 | Inode (`fs_ino`) | stat() | Rename within same filesystem | Move across filesystems, some editors, restore from backup |
| 3 | Path (`fs_path`) | file location | Content edits | Rename, move |
| 4 | Body content hash | sha256 of content | Rename, move | Any content edit |
| 5 | Structural hash | Heading tree + block count + sizes | Minor text edits | Structural reorganization |
| 6 | Position + sibling context | Line number + surrounding content | Unchanged file layout | Reorder, major edits |

All six signals are **already available in km** — `KNode.fs_ino`, `KNode.fs_mtime`, `KNode.fs_path` exist today (see `packages/km-core/src/types.ts:289-291`). What's missing is systematic combined use during recovery.

### 2.2 File-level recovery cascade

```
for each fresh-scanned-file F:
  # Rank 1 — authoritative
  if F has frontmatter id → match by known[id]

  # Rank 2 — inode survives rename within FS
  elif F.inode matches known.fs_ino → match; update path
       
  # Rank 3 — previously-known path, no embedded id yet
  elif F.path matches known.fs_path → match; mint id; write back to frontmatter

  # Rank 4 — orphan candidate: content unchanged despite path change
  elif sha256(F.body) matches known[*].body_hash → surface as candidate
       → auto-adopt if the matched entry is otherwise missing (rename detection)

  # Rank 5 — structural similarity (low confidence)
  elif structural_hash(F) matches known[*] within threshold → suggest match

  # Rank 6 — new file
  else → mint NodeId, write frontmatter id:, store path/inode/mtime
```

Each pass narrows the unresolved set. Most files match at Rank 1 or 2. Rank 3 handles first-time indexing. Rank 4-5 catch unusual edge cases.

**Performance**: Rank 4+ require hashing body content. Lazy — only computed for unresolved files. For a vault of 10k files with 99% Rank-1/2 match, only ~100 files get hashed.

### 2.3 Block-level recovery cascade

```
for each `^<hash>` reference in body:
  # Rank 1 — hash lookup within file
  candidates = blocks-in-this-file where hashBlockId(b.id).startsWith(hash)
  if len(candidates) == 1 → match

  # Ambiguous — prefix-too-short
  elif len(candidates) > 1:
    auto-extend: log, tie-break by oldest, suggest user write more chars
  
  # No match — block may have been deleted or manually renamed
  else:
    # Rank 5/6 fallback: position + surrounding content context
    try to find a block at the reference's sibling/cursor position
    low confidence; log warning; allow manual resolution
```

### 2.4 Combining signals for cross-file block refs

`[[other-file^abc]]` resolution:
1. Resolve `other-file` via file-cascade (rank 1-6 above).
2. Resolve `^abc` via block-cascade within that file's block pool.
3. If either fails → "dormant" or "unresolved" status; show in backlinks panel.

---

## 3. Serialization contract

### 3.1 File frontmatter

On first index of any `.md` file, km writes:

```yaml
---
id: 01HKXB2W7K9M1X4Y2Z3ABCDEFG
---
# Note title
```

Existing Obsidian frontmatter is preserved; `id:` is added as a new field. If the user has ANY existing `id:` field, km uses that as the NodeId verbatim (opaque — doesn't require ULID format). Users migrating from tools with different ID schemes keep their IDs.

### 3.2 Block references

Written only when referenced (Obsidian-style lazy):

```markdown
Referenced paragraph. ^abc

Unreferenced paragraph. (no marker)

See also [[other-file^xyz]] for details.
```

- Format: `^<hash>` where `hash = hashBlockId(node.id)` (stable prefix of a hash function applied to the ULID).
- Default length: **3 chars base62** (62³ = 238,328). Essentially zero collision probability for typical files.
- **Per-ref auto-extend on collision**: if writing a new ref at 3 chars would collide with an existing ref in this file, write THIS ref at 4 chars. Existing refs stay at their current length. No global file rewrite. No cross-file backlink invalidation.
- **Parser uses longest-prefix match**: `^ab` matches any block whose hash starts with `ab` provided that prefix is unique in the file.
- **Mixed lengths in one file are explicitly supported**.
- **Optional** `block_hash_length:` in frontmatter — advisory hint to the parser; not authoritative.

### 3.3 Wiki-links

Unchanged from Obsidian convention:

```markdown
[[note-title]]                       — resolves via name-index
[[note-title#heading-slug]]          — scoped to file's children
[[note-title^abc]]                   — file + block ref
[[km:/vault/subfolder/note.md#abc]]  — cross-repo URL-addressable
```

`name` (filename slug / heading slug) is a **derived display cache**, not identity. A rename changes the slug but not the ULID. Wiki-links using `name` slugs resolve via the cache.

### 3.4 Cross-repo URLs

Human-readable:

```
km:/vault/notes/foo.md#abc
km:/gdrive/projects/bar.md
```

- Repo alias (`vault`, `gdrive`) is mapped to `RepoId` (UUID in `.km/config.toml`) by the workspace.
- Repo rename or mount-path change: workspace config updates; URL remains valid.
- RepoId is stable across clones (preserved in `.km/config.toml`).
- RepoId is NOT in markdown. Only human-readable aliases are user-facing.

---

## 4. What gets stored where

| Storage | What | Stable across |
|---|---|---|
| `.md` frontmatter | `id: <ULID>` per file | Everything except manual deletion |
| `.md` body | `^<hash>` for referenced blocks (lazy) | Content edits to other blocks |
| `.km/state.db` → `nodes.id` | ULID per node (files AND blocks) | Schema migrations |
| `.km/state.db` → `nodes.fs_ino / fs_path / fs_mtime` | Location-tracking metadata | N/A — always re-derived from FS |
| `.km/state.db` → `nodes.name` | Denormalized slug cache (filename / heading slug) | Regenerable from content |
| `.km/config.toml` | `repo_id: <ULID>` + `block_hash_length: <N>` | Repo clone/move |

**No `block_id` field anywhere.** Derived on serialize, reverse-scanned on parse.

---

## 5. Migration from today's km

### 5.1 Backfill migration

On first startup post-upgrade, a background job writes `id:` to the frontmatter of every indexed file. Uses the existing ULID from the DB — no new ID generation needed. Preserves all other frontmatter, no reformatting.

Scope: one ULID per file (the root-node's ID) written into YAML frontmatter. Blocks don't get any written ID.

Collision: if a file already has a conflicting `id:` frontmatter field (e.g., from Obsidian plugin), km adopts that value as the authoritative ID and updates its DB. User's ID wins.

### 5.2 `KNode.block_id` field deletion

Sequential:
1. Stop writing to `block_id` field anywhere.
2. Migrate any existing reliance (grep `node.block_id`) to use `hashBlockId(node.id)`.
3. Migrate DB schema (drop column / ignore field).
4. Deprecation period: one release.
5. Delete field from `KNode` type.

### 5.3 `name` field remains (but no longer treated as identity)

No type-level changes. Documentation and tests are updated to reflect `name` as a display cache, not identity. Any code using `name` for identity matching (beyond slug lookup) is audited and migrated.

---

## 6. What we gain vs what we pay

**Gain**:
- File identity survives all offline FS operations (rename, move, cross-device, restore).
- Block identity survives content edits (ULID stored in DB; hash is computed).
- Robust recovery after ANY single signal fails — defense in depth.
- Zero markdown-surface ID noise: `id:` in frontmatter is 3 lines per file; `^abc` only at referenced blocks; wiki-links use human-readable slugs.
- Future-compat with multi-device sync — ULIDs are a stable substrate.
- Cross-repo URLs are human-readable (`km:/vault/notes/foo.md`) not opaque.

**Cost**:
- `id:` line in every indexed file's frontmatter (3 lines, but Obsidian-compat).
- Backfill migration on first upgrade (~seconds per thousand files).
- `^<hash>` markdown noise at referenced blocks only — Obsidian-equivalent.
- Collision auto-extend logic in the block-ref serializer (~20 LOC).
- Recovery cascade implementation (~200 LOC — Rank 1-6 scans).

---

## 7. Architectural placement — the adapter model

**Core km is unaware of filesystem-specific concerns.** The identity cascade, frontmatter serialization, inode tracking, content hashing, and `^<hash>` block-ref encoding are ALL features of an **FS adapter**, not of `@km/core` or `@km/storage`.

This matches the patterns kimmi + cloudi arrived at independently:

- **Kimmi** (`docs/design/kimmi-sync.md:57-95`): `RemoteRegistry` catalogs `Connectors` (CardDAV, CalDAV, future Replicators for peer-to-peer). Each Connector owns Cache + Lock + runs a three-phase sync algorithm against a pure `Repo` that exposes `getOps(clock) / applyOp(op)`. Core repo has no CardDAV knowledge.
- **Cloudi** (`docs/architecture/overview.md:403-418`): uses `unstorage` + custom drivers (`gmailDriver({ mailProvider })`). Each driver adapts an external system (Gmail, Calendar) to a uniform KV-shaped interface. Core app has no Gmail-API knowledge.

**km must follow the same pattern.** `@km/storage` defines an **Adapter contract**; FS-specific behavior lives inside one adapter instance.

### 7.1 Adapter contract (target for v3)

```ts
interface Adapter {
  /** Instance name — e.g., "vault-fs", "icloud-carddav". */
  id: AdapterId

  /** Adapter kind — dispatches to the right lifecycle handler. */
  kind: "fs" | "sync" | "connector" | "import"

  /**
   * Pull external state → core ops stream. Async iterator so large
   * sources (FS scan, CardDAV paginated feed) can be chunked.
   */
  ingest(): AsyncIterable<Op[]>

  /**
   * Push core ops → external state. Batched.
   */
  egress(ops: Op[]): Promise<void>

  /**
   * Detect + reconcile divergence. Returns report of what changed.
   */
  reconcile(): Promise<ReconcileReport>

  /**
   * Watch for external changes and emit ops as they're detected.
   * Adapters that can't watch (one-shot imports) return empty.
   */
  watch(): AsyncIterable<Op[]>

  start(): Promise<void>
  stop(): Promise<void>
}
```

### 7.2 Adapter catalog (present + future)

| Adapter | Kind | What it mediates | Owns |
|---|---|---|---|
| `FsAdapter` | `fs` | Filesystem ↔ core | Watcher, parser, serializer, inode tracking, **identity cascade**, frontmatter write-back, `^<hash>` block-ref encoding, markdown fidelity |
| `SyncAdapter` (future) | `sync` | Peer-to-peer ↔ core | Automerge-repo-style network adapter, conflict merge |
| `CardDavAdapter` (future) | `connector` | CardDAV server ↔ core | vCard ingest/egress, cache, auth |
| `CalDavAdapter` (future) | `connector` | CalDAV server ↔ core | iCal ingest/egress, cache, auth |
| `NotionImportAdapter` (future) | `import` | Notion export → core | One-shot ingest; no egress; no watch |

Everything in the identity addendum above (Ranks 1-6, frontmatter `id:`, block hash refs, inode tracking) belongs to `FsAdapter`. Core never sees a path or an inode.

### 7.3 Package layering

Proposed after-state (supersedes RFC v2 §2.2 "three-seam boundary"):

```
Layer 4  @km/fs-adapter, @km/sync-adapter, @km/carddav-adapter, ...
         (one package per adapter kind)
             │
             ↓ emits Op[]
Layer 3  @km/storage          — RepoStore (atomic doc store) + AdapterRegistry
             │                  (orchestrates adapters; owns ops pipeline)
             ↓ defines ops
Layer 2  @km/core              — NodeId, KNode, Op types, pure domain
             │
             ↓ depends only on @km/infra types
Layer 1  @km/markdown          — parse/serialize mdast ↔ KNode
         (consumed by @km/fs-adapter, @km/import-adapter, etc.;
          NOT by @km/core or @km/storage)
```

Key moves from today:

- `@km/storage` loses all FS code (watchers, reconcile loops, path tracking). Those migrate to `@km/fs-adapter`.
- `@km/storage` gains `AdapterRegistry` (kimmi's `RemoteRegistry` equivalent) — registers adapter instances, orchestrates lifecycle, routes ops.
- `@km/core` gets `NodeId` branded type + `Op` types. No FS imports.
- `@km/markdown` becomes a dependency of adapters (FS + import), not of core.
- `@km/fs-adapter` is a new package — hosts the identity cascade, frontmatter write-back, watcher, parser integration.

### 7.4 Workspace = set of adapter instances

`WorkspaceFederation` (RFC v2 §2.2) is replaced by `AdapterRegistry`:

```ts
interface AdapterRegistry {
  mount(instance: Adapter): Promise<void>
  unmount(id: AdapterId): Promise<void>
  list(): Adapter[]
  get(id: AdapterId): Adapter | null
}
```

A workspace config might look like:

```toml
[[adapters]]
id = "vault"
kind = "fs"
path = "~/Bear/Vault"

[[adapters]]
id = "gdrive"
kind = "fs"
path = "~/gdrive-mirror"

[[adapters]]
id = "icloud-contacts"
kind = "connector"
protocol = "carddav"
url = "https://contacts.icloud.com"

[[adapters]]
id = "device-laptop"
kind = "sync"
protocol = "automerge-repo"
peer = "ws://my-server/km"
```

Cross-repo links (RFC v2 §2.2) are now cross-adapter-instance: `km:/vault/notes/foo.md#<hash>` resolves via `registry.get("vault").resolveRef(...)`.

### 7.5 Why this is the right shape now, not later

- **Clean package boundaries**: `bun fix` + typecheck catch any FS import into `@km/core` or `@km/storage` as a build error.
- **Future-proof without speculative scope**: only `FsAdapter` needs to ship today. Other adapter kinds are new packages later — additive, not refactor.
- **Testability**: Mock `Adapter` implementations for unit tests; no FS required.
- **Aligns with pro's three-seam recommendation** (RFC v2 §2.2) but under a uniform adapter contract instead of three bespoke interfaces.

---

## 8. Follow-up beads

After the adapter-architecture reframe in §7, bead structure becomes:

| Bead | Status | Action |
|---|---|---|
| `km-storage.adapter-architecture` | NEW P1 (parent) | Defines Adapter contract + AdapterRegistry. Replaces `km-storage.three-seam-boundary`. |
| `km-storage.fs-adapter` | NEW P1 (sub of adapter-architecture) | New package `@km/fs-adapter`. Owns: watcher, parser integration, serializer, inode tracking, identity cascade. |
| `km-storage.identity-recovery-cascade` | NEW P1 (sub of fs-adapter) | Implements Rank 1-6 cascade. Replaces `km-storage.stable-ids`. |
| `km-storage.block-hash-refs` | NEW P1 (sub of fs-adapter) | `hashBlockId()` + auto-extend + markdown parser/serializer integration. |
| `km-storage.frontmatter-id-migration` | NEW P1 (sub of fs-adapter) | Backfill `id:` into existing vault files. One-time migration. |
| `km-storage.three-seam-boundary` | close (superseded) | Replaced by adapter-architecture. |
| `km-storage.stable-ids` | close (superseded) | Replaced by identity-recovery-cascade. |
| `km-storage.federation` | update | Redefine as AdapterRegistry — workspace = set of adapter instances. |
| `km-storage.lazy-hydration` | update | Depends on adapter-architecture; RepoStore lives in @km/storage, FS concerns delegated to fs-adapter. |
| `km-storage.markdown-fidelity-corpus` | unchanged | Lives under fs-adapter, since fidelity is an FS-adapter concern. |
| `km-storage.scale-architecture` | update | Adapter-architecture is the path forward; scale-benchmarks feed adapter-specific tuning. |

---

## 9. What this doesn't decide

- **Whether to ever flip A → C-federated**. Deferred to RFC v2 §2.4 reopen triggers.
- **Sync protocol design**. Multi-device sync is still out of scope; the identity model is *compatible* with it (ULIDs are sync-friendly), but no sync implementation is implied.
- **Undo / event-sourcing semantics**. Separate concern.
- **Markdown fidelity corpus** (RFC v2 §4.3) — still required, separate bead (`km-storage.markdown-fidelity-corpus`).
