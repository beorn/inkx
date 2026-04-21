# km Storage Architecture

Canonical design for km's storage + identity + adapter model. **Evergreen — describes current state, not decision history.** For research evidence underlying these decisions, see `hub/km/research/`.

Last consolidated: 2026-04-21.

---

## 1. Truth model

**Markdown files are authoritative for all user content.** SQLite, `changes.jsonl`, and every in-memory store are derived and rebuildable from `.md`. Session-local state (selection, fold, workspace layout, undo) lives in separate session storage (see §5.3), not scope debt under this contract.

**Tagline**: "If you can't read it with `cat`, km doesn't claim it."

Deferred: any move of canonical state off markdown. Reopen triggers:
- Multi-device concurrent editing becomes shipping-required
- Markdown fidelity corpus shows irrecoverable round-trip loss
- Plain-text portability axiom is explicitly negotiated away

---

## 2. Identity primitives

Two branded types total — everything else is derived.

```ts
type NodeId = string & { __brand: "NodeId" }  // brand the existing KNode.id ULID
type RepoId = string & { __brand: "RepoId" }  // per-mounted-repo, stored in .km/config.toml
```

`KNode.name?` stays but is **reclassified as display slug** (filename / heading-slug / embed-alias). Not identity. Regenerable from content.

`KNode.block_id?` field is **deleted**. Block references are derived via `hashBlockId(node.id)`.

### 2.1 File identity in markdown

Every indexed `.md` gets `id:` in YAML frontmatter on first scan:

```yaml
---
id: 01HKXB2W7K9M1X4Y2Z3ABCDEFG
---
# Note title
```

Obsidian-compat: if a file already has `id:` with a different value (e.g., from an Obsidian plugin), adopt it verbatim as the NodeId. User's file wins.

### 2.2 Block references in markdown

Lazy — only written when a block is actually referenced:

```markdown
Referenced paragraph. ^abc

Unreferenced paragraph. (no marker)

See also [[other-file^xyz]] for details.
```

Format: `^<hash>` where `hash = hashBlockId(node.id)`. Pure function of the ULID — no separate storage.

- Default length: **3 chars base62** (62³ ≈ 238K). Essentially zero collision at typical file sizes.
- **Per-ref auto-extend on collision**: new refs get N+1 chars if a shorter prefix would collide. Existing refs stay at their current length. No global file rewrite (preserves external backlinks).
- Parser uses **longest-prefix match** within the file's block pool. Ambiguous match → warning + tiebreak by oldest.
- Mixed-length refs in one file are supported.

### 2.3 Wiki-links

```
[[note-title]]                       — resolves via name-index
[[note-title#heading-slug]]          — scoped to file's children
[[note-title^abc]]                   — file + block ref
[[km:/vault/subfolder/note.md#abc]]  — cross-repo URL-addressable
```

`name` (filename/heading slug) is a **derived display cache**, not identity. A rename changes the slug but not the ULID. Wiki-links using `name` slugs resolve via the cache.

### 2.4 Cross-repo URLs

```
km:/vault/notes/foo.md#abc
km:/gdrive/projects/bar.md
```

Repo alias (`vault`, `gdrive`) is mapped to `RepoId` (UUID in `.km/config.toml`) by the workspace. Repo rename or mount-path change → workspace config updates; URLs remain valid. `RepoId` is stable across clones.

RepoId is never in markdown. Only human-readable aliases are user-facing.

---

## 3. Identity recovery cascade (Rank 1–6)

**No single offline FS change can cause identity loss.** km is robust when users edit files offline with vim / Obsidian / any external tool.

| Rank | Signal | Source | Survives | Breaks on |
|---|---|---|---|---|
| 1 | Embedded `id:` in frontmatter | file itself | rename, move, copy, cross-device, restore | user manually deletes the line |
| 2 | Inode (`fs_ino`) | `stat()` | rename within same filesystem | move across FS, restore from backup |
| 3 | Path (`fs_path`) | file location | content edits | rename, move |
| 4 | Body content hash | sha256 of body | rename, move | any content edit |
| 5 | Structural hash | heading tree + block count + sizes | minor text edits | structural reorg |
| 6 | Position + sibling context | line + surrounding content | unchanged file layout | reorder, major edits |

All six signals are already available on `KNode` today (`fs_ino`, `fs_mtime`, `fs_path` in `packages/km-core/src/types.ts:273-295`). What was missing is **systematic combined use during recovery**.

### 3.1 File-level cascade

```
for each fresh-scanned file F:
  if F has frontmatter id              → match known[id]                         (Rank 1)
  elif F.inode matches known.fs_ino    → match, update path                      (Rank 2)
  elif F.path matches known.fs_path    → match, mint id, write frontmatter       (Rank 3)
  elif sha256(body) matches known[*]   → candidate-match; auto-adopt if missing  (Rank 4)
  elif structural_hash matches within threshold → suggest match                  (Rank 5)
  else                                 → new file, mint id, write frontmatter
```

### 3.2 Block-level cascade

For each `^<hash>` reference in body:
1. scan blocks-in-file, find one where `hashBlockId(b.id).startsWith(hash)` is unique
2. if ambiguous, auto-extend hash length on next write
3. if no match → position + sibling-context fallback (low confidence)

### 3.3 Performance

Ranks 1–2 are O(1) per file (index lookup). Rank 3 is first-time indexing. Ranks 4+ are lazy — only computed for unresolved files. For a 10k vault with 99% Rank-1/2 match, only ~100 files get body-hashed.

---

## 4. Adapter architecture

**Core km is unaware of filesystem / sync / external-protocol specifics.** Identity cascade, inode tracking, frontmatter write-back, markdown parsing, `^<hash>` block-ref encoding, CardDAV sync, Automerge peer protocol — all features of **adapters**, not of `@km/core` or `@km/storage`.

### 4.1 Adapter contract

```ts
interface Adapter {
  id: AdapterId
  kind: "fs" | "sync" | "connector" | "import"
  ingest(): AsyncIterable<Op[]>          // external → core
  egress(ops: Op[]): Promise<void>        // core → external
  reconcile(): Promise<ReconcileReport>   // detect + resolve divergence
  watch(): AsyncIterable<Op[]>            // continuous change stream (empty for one-shot adapters)
  start(): Promise<void>
  stop(): Promise<void>
}
```

Uniform contract borrowed from:
- **Kimmi's RemoteRegistry + Connector pattern** (`kimmi-sync.md:57-95`): Connector owns Cache + Lock + runs a three-phase sync against a pure Repo exposing `getOps(clock) / applyOp(op)`. Core has no CardDAV knowledge.
- **Cloudi's unstorage + driver pattern** (`cloudi/docs/architecture/overview.md:403-418`): `gmailDriver({ mailProvider })` adapts Gmail to a uniform KV-shaped interface. Core has no Gmail-API knowledge.

### 4.2 Adapter catalog

| Adapter | Kind | Mediates | Status |
|---|---|---|---|
| `FsAdapter` | `fs` | Filesystem ↔ core | **P1 — ships first, as `@km/fs-adapter`** |
| `SyncAdapter` | `sync` | Peer-to-peer ↔ core | Future |
| `CardDavAdapter` | `connector` | CardDAV server ↔ core | Future |
| `CalDavAdapter` | `connector` | CalDAV server ↔ core | Future |
| `NotionImportAdapter` | `import` | Notion export → core | Future |

### 4.3 Package layering

```
@km/fs-adapter   (+ future @km/sync-adapter, @km/carddav-adapter, ...)
   │ emits Op[]
   ↓
@km/storage      — RepoStore (atomic doc store) + AdapterRegistry
   │ defines ops
   ↓
@km/core         — NodeId, KNode, Op types. Pure domain. Zero FS imports.

@km/markdown     — parse/serialize. Consumed by adapters, NOT by core/storage.
```

**Build-enforced**: any FS import into `@km/core` or `@km/storage` fails typecheck.

### 4.4 FsAdapter scope

`@km/fs-adapter` owns:
- File watcher (chokidar / node:fs.watch)
- Markdown parser integration (`@km/markdown`)
- Markdown serializer integration
- Inode tracking (fs_ino, fs_mtime, fs_path → Op metadata)
- Identity recovery cascade (§3)
- Frontmatter `id:` write-back on first index
- `^<hash>` block-ref encoding (default 3 chars, per-ref auto-extend)
- Self-write suppression (don't re-ingest own writes)
- Markdown fidelity preservation

Does NOT own:
- Repo / doc store — `@km/storage`
- Node types / KNode shape — `@km/core`
- Op types — `@km/core`
- Parsing algorithm itself — `@km/markdown`

---

## 5. Federation

### 5.1 Per-repo state

One `.km/state.db` per mounted repo. Workspace = set of mounted adapter instances.

`.km/config.toml`:
```toml
repo_id = "01HKXB2W7K9M1X4Y2Z3"
block_hash_length = 3        # optional; default 3
```

### 5.2 Workspace composition

```ts
interface AdapterRegistry {
  mount(instance: Adapter): Promise<void>
  unmount(id: AdapterId): Promise<void>
  list(): Adapter[]
  get(id: AdapterId): Adapter | null
  federatedQuery(q: Query): Result[]  // map-reduce across adapters
}
```

Workspace config example:
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
```

### 5.3 Three durability tiers

| Tier | Example | Store |
|---|---|---|
| Content (per repo) | Nodes, bodies, links | RepoStore + MarkdownAdapter |
| Session (per workspace) | Workspace layout, undo, recently-opened | `~/.km/session.db` |
| Ephemeral (memory) | Cursor position, hover, transient focus | In-memory only |

### 5.4 Memory-only mode preserved

Current km mode where you point at a directory, crawl `.md` files, build in-memory SQLite, no `.km/` written — **works unchanged under federation**. `FsAdapter` picks memory-mode vs disk-mode based on presence of `.km/config.toml`. `bun km view /tmp/some-dir` still works exactly as today.

---

## 6. Cross-cutting concerns

### 6.1 Path is not identity

Rename / move / copy never break identity. Wiki-links within-vault resolve via `name`-index (derived). Cross-repo refs carry `RepoId` scope.

### 6.2 Watchers are hints, not truth

File watcher events are unreliable (debounce races, swap files, partial writes). Under any adapter:
- watcher event → hint that a file *may* have changed
- hash/stat reconcile → determines if it *actually* changed
- periodic / full reconcile on focus regain

Lives under `FsAdapter.scanExternal()`.

### 6.3 Markdown fidelity test corpus

Regardless of adapter, km needs a fidelity corpus for import/export round-trip. Gate: round-trip preserves
- whitespace (tabs vs spaces, trailing, indentation)
- frontmatter ordering + nested YAML
- HTML comments (Obsidian-style `<!-- -->`)
- code fences with exotic language IDs
- wiki-links with display text + embeds
- `^blockid` preservation
- broken/incomplete markdown
- large notes (>100KB)

### 6.4 Internal modules ≠ external plugins

If km ever gets third-party extensions, the extension model is **capability-based** (contribute command / keybinding / panel / query provider), NOT "arbitrary state with effects." Internal composition (silvery's `pipe()` + `with*()`) stays separate from any future extension API.

---

## 7. Implementation sequence

Five work packages, roughly chronological. Each is one focused sprint.

### P1. Identity primitives + recovery cascade (`km-storage.identity-recovery-cascade`)
- Brand `NodeId` + `RepoId` types in `@km/core`
- `hashBlockId()` pure function + auto-extend serializer + longest-prefix parser
- Frontmatter `id:` backfill migration (one-shot background job, idempotent)
- Rank 1-6 recovery cascade in-file (lives inside FsAdapter once split)
- Delete `block_id?` field after grace period
- Tests: property-based offline-edit + recovery scenarios

**Why first**: every other layer reads identity. Unblocks everything.

### P2. `@km/fs-adapter` package split (`km-storage.adapter-architecture`)
- Define `Adapter` contract + `AdapterRegistry` in `@km/storage`
- Extract watcher/parser/serializer/cascade into new `@km/fs-adapter` package
- Build-fail any `fs` import into `@km/core` or `@km/storage`
- Integration test with mock adapter proving swappability
- Migrate all existing FS code behind the boundary

**Why second**: locks in the decoupling so future adapters are additive, not refactor.

### P3. Federation (`km-storage.federation`)
- `.km/config.toml` per repo with stable `RepoId`
- Per-repo `.km/state.db` (not monolithic workspace DB)
- Workspace composition layer mounts multiple FsAdapter instances
- Cross-repo URL resolution (`km:/<alias>/<path>`)
- Workspace config (aliases → RepoIds)
- Memory-mode preserved

**Why third**: addresses scale-bench 2x failure via per-repo scope. Enables future cross-device sync.

### P4. Lazy hydration (`km-storage.lazy-hydration`, P0)
- `RepoStore` implements demand-driven hydration of subtree / query results
- `FsAdapter.ingest()` yields chunked Op streams
- Viewport-aware loading (not load-all-then-render)
- Benchmark target: <500ms cold start on 10x vault

**Why fourth**: now lives inside `RepoStore` semantics (not a parallel port) because §4 landed.

### P5. Markdown fidelity corpus (`km-storage.markdown-fidelity-corpus`)
- Test corpus covering every round-trip case (§6.3)
- CI gate on regressions
- Required before any future truth-model re-evaluation

**Parallel track**: `km-storage.session-state-split` (P2) — move undo + workspace layout to `~/.km/session.db`. Not blocking.

---

## 8. Key evidence underlying the design

- **Scale bench** (`hub/km/research/scale-bench-results-2026-04-21.md`): full-load-into-memory fails at 2x (20k files, 102s cold-load). Per-query perf is fine at 10x. Bottleneck is load, not query. Federation + lazy hydration = direct fix.
- **Kimmi deep-dive** (`hub/km/research/kimmi-crdt-sync-id-deep-dive.md`): architectural wins come from stable IDs + op-based reconciliation + materialized indexes — NOT from Automerge specifically. Automerge has concrete gaps (no diff API, sync broken for CardDAV, Text type churned v1→v3).
- **Cloudi deep-dive** (`hub/km/research/cloudi-architecture-deep-dive.md`): Gmail-as-truth has critical ID instability + ~500-item ceiling. F378 cautionary tale: built audit-log-in-external-system, realized reinventing external feature, deleted.
- **Dual-pro review** (GPT-5.4 Pro + Kimi K2.6, 2026-04-21): convergent on stable-IDs as highest-leverage move + three-seam (→ adapter) boundary + federation-now + defer-CRDT.
- **User pushbacks** (this session): (a) FS is inherently messy — solve the boundary lower down; (b) federation is eventually necessary; (c) identity must be recoverable from FS changes alone; (d) core must be unaware of FS specifics.

---

## 9. Explicit non-decisions (out of scope until reopened)

- **CRDT substrate**: kimmi's Automerge experience + cloudi's Gmail-as-truth cracks both argue against. Reopen only when multi-device sync is shipping-required.
- **Sync protocol**: only after CRDT question is reopened.
- **Undo / event-sourcing**: separate concern. Session-state split (§5.3) provides a durable-undo foundation; semantic undo design stays open.
- **Cross-machine name resume**: tribe's F1-D covers local case. Cross-machine = future `km-bearly.tribe-session-resume` re-open.
- **Second RepoStore implementation**: the `Adapter` contract exists; SQLite is the only `FsAdapter` backend today. A second backend (Automerge, LMDB, native indexer) is a scale-architecture outcome, not this phase.

---

## 10. Bead tracking (current state)

Active beads for this design:

| Bead | Priority | Scope |
|---|---|---|
| `km-storage.adapter-architecture` | P1 epic | §4 full arc |
| `km-storage.identity-recovery-cascade` | P1 | §2 + §3 — NodeId/RepoId + Rank 1-6 + block-hash + frontmatter backfill (all folded here) |
| `km-storage.fs-adapter` | P1 | §4.4 — package split, Adapter contract, FsAdapter impl |
| `km-storage.federation` | P1 | §5 |
| `km-storage.markdown-fidelity-corpus` | P1 | §6.3 |
| `km-storage.lazy-hydration` | P0 | §7.P4 |
| `km-storage.session-state-split` | P2 | §5.3 |
| `km-all.shared-substrate-review` | P0 | cross-project extraction review (due 2026-05-05) |

Closed as superseded: `km-storage.source-of-truth-contract`, `km-storage.stable-ids`, `km-storage.three-seam-boundary`, `km-storage.scale-benchmarks` (shipped), `km-storage.scale-architecture` (superseded by adapter-architecture + lazy-hydration + federation).
