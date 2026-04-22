# km Storage Architecture

Canonical design for km's storage, identity, reconciliation, and markdown writeback. **Evergreen — describes current state, not decision history.** For research evidence, see `hub/km/research/`.

Last revised: 2026-04-22 (v3, round-4 polish). Key shifts vs. earlier drafts: inode primary + path-of-`.name` secondary; ULIDs never generated into markdown but resolved if seen; Phase A→E pathway named (FS-truth → op log → DB-truth → CRDT → sync platform); multi-file journal dropped for Phase A; op-vocabulary audit flagged as Phase B prereq; work packages labelled WP0-WP4 (distinct from bead priorities P0-P4). Change log archived in commits and `research/storage-arch-pro-review-round-{2,3,4}-2026-04-22.md`.

---

## 1. Truth model

### 1.1 The dual mental model

**Externally, km lives in Obsidian's world.** Users edit `.md` files. Obsidian reads/writes them. Git tracks them. vim works. Wiki-links, block anchors, tags, frontmatter — all the Obsidian vocabulary, all Obsidian-compatible semantics. If you only ever use km through the command line and read markdown elsewhere, km looks like "a TUI that edits my vault."

**Internally, km is a hierarchical database of typed nodes.** Files, headings, paragraphs, list items, tags, references — each is a node with a stable internal ID, a kind, a parent, children, relations, indexes. Queries traverse the node tree; backlinks, FTS, typed lookups, fold state, selection, undo all operate against this model. If you opened the SQLite file and peered in, you'd see a graph database, not markdown.

**The storage architecture's job is to bridge these two views without compromising either.** Markdown stays legible to humans and compatible with Obsidian; the internal node tree stays rich enough for fast queries and stable session state. The AST is the bridge — parsing markdown yields the node tree; serializing the node tree produces Obsidian-compatible markdown.

Everything that follows (truth model, identity, recovery cascade, adapter architecture) serves this bridge: let the two worlds coexist cleanly, with the markdown being legible + Obsidian-faithful, and the internal model being rich + queryable.

### 1.2 What km actually guarantees

km's write path parses any `.md` file to an AST, mutates the AST, then serializes back. The AST is intentionally a **curated subset of markdown** — it covers what Obsidian-typical vaults use, not the full universe of markdown.

What round-trips losslessly (within the AST's coverage):
- Headings, paragraphs, lists (incl. nested + task lists)
- Wiki-links (`[[note]]`, `[[note#heading]]`, `[[note^anchor]]`), regular links, images
- Frontmatter YAML (values preserved; key order is normalized, not preserved)
- Tags (`#tag`, `@sigil`)
- Block anchors (`^abc`)
- Code blocks (fenced + inline), emphasis, blockquotes, horizontal rules, tables

What does NOT round-trip cleanly:
- Exotic markdown extensions (Pandoc footnotes, definition lists, custom attribute syntax)
- Plugin-specific syntax km doesn't know about (Dataview queries, math rendering, callouts without a first-class form)
- Raw embedded HTML in non-trivial forms
- Byte-level formatting choices (whitespace, list marker selection, blank-line counts, frontmatter key order) — normalized by AST serialization

**What this means practically**:
- `cat foo.md` shows human-readable, Obsidian-compatible markdown — always
- External tools (grep, git, vim, Obsidian, LSP) work — always
- The user's custom formatting and edge-case-markdown choices are lost on first km-write; known syntax round-trips fine
- Feature design is constrained by **the AST's coverage**, not by markdown's full grammar. If a feature needs syntax the AST doesn't understand, either (a) extend the AST, or (b) store it as DB-only state (never serialized to `.md`).

The practical rule: **"supports most of markdown"** — tuned for Obsidian-typical usage. Edge-case fidelity is a cost the user accepts in exchange for km's structural understanding of the vault.

### 1.3 FS-truth today; pathway to DB-truth + CRDT

**FS is truth, DB is a derived cache** — for Phase A (today). Not a permanent architectural claim. The full pathway with value unlocks lives in §9:

- **Phase A (current)** — FS-truth + git sync. Ships a working Obsidian-compatible km.
- **Phase B** — semantic op log alongside FS. Unlocks semantic undo/redo + multi-file atomicity via replay. FS still truth.
- **Phase C** — DB-as-truth flip. Unlocks versioning/snapshots/rollback, typed queryable metadata, agent state as first class.
- **Phase D** — CRDT substrate under DB. Unlocks real-time collaboration and clean offline-online merge. Likely paired with a Rust/Zig native-storage rewrite for perf.
- **Phase E** — km as a large-scale file sync platform (Dropbox/gdrive/iCloud-class). Built on Phase D's CRDT substrate; adds binary blobs, selective sync, sharing, cloud infra.

Each phase is a shippable product on its own; each unlocks real user value; each requires the prior phase's artifacts. We're not scheduling B/C/D today, but we're naming them so today's decisions don't rule them out.

**Why FS-truth for Phase A**: (a) simpler implementation (no ingest pipeline / regen loop), (b) catastrophic-failure blast radius is smaller (DB corruption → rebuild from FS, contained), (c) no beyond-AST features shipping yet to force the issue, (d) matches today's code path.

**What today's work contributes to later phases** (all already in §8):
- Stable internal ULIDs → used in every phase
- AST round-trip fidelity corpus → needed for any FS↔DB mapping
- Content-as-CAS writeback → required for Phase C's "FS is a projection" semantics
- Op-vocabulary shape (edits are ops, not text diffs) → this is the Phase B prerequisite most worth keeping in mind during P2/P3 implementation

See §9 for the full pathway, triggers, and gaps-to-be-specified.

### 1.4 Policy statement (Phase A)

For the current implementation phase:

- **FS is the canonical storage for user content.** `.md` files are where the data lives.
- **DB is a derived cache** over the FS. Everything in DB can be regenerated from FS (modulo session state — see §1.7).
- **Internal ULIDs are join keys, not identity.** km never *generates* a ULID into markdown during writeback — new content that km authors has no ULIDs, because it doesn't need them (reconciliation handles identity via inode + `.name`). If a user or external tool writes a ULID-shaped reference (e.g., `[[01HKXB2W...]]`) by hand, km will recognize and resolve it directly as a NodeId lookup — they are permissible, just not produced. Markdown stays as pure as it can without actively rejecting input.
- **On conflict, FS wins.** External edits (vim, Obsidian, git pull) are trusted; km's in-flight DB state is disposable.
- **Zero metadata injection into user files.** km writes no hidden IDs, no frontmatter additions, no inline ID tags, no HTML comments.
- **Obsidian interop preserved.** Wiki-links, block anchors, headings, tags all work as Obsidian expects.

**Tagline (Phase A)**: "If you can't read it with `cat`, km doesn't claim it."

**Tagline (Phase C onward)**: "If km shows it, it's real — regardless of whether `cat` can reach it." The flip happens when product value unlocks outweigh the cost; see §9 for the pathway.

### 1.5 The load-bearing invariant

**Every DB column must be computable from (FS content + optional session.db).** If a column can't be derived from the FS, it's either a bug or a scope expansion that needs explicit justification.

Consequences:
- `km doctor rebuild` deletes `.km/state.db` and reconstructs from a fresh FS crawl. **No user-visible data loss** beyond session state.
- Internal ULIDs (`KNode.id`) get freshly minted on rebuild. No external reference uses them, so no breakage crosses the FS boundary.
- Backlinks, FTS, anchor index, structural metadata — all derived. Rebuild is deterministic from content.

### 1.6 What "identity" means at each layer

| Domain | Truth source | Identity form | Failure mode of a mistake |
|---|---|---|---|
| **External** (links users type, Obsidian sees, git tracks) | FS | paths + `.name` strings | Broken link — visible to user, user-fixable |
| **FS→DB sync** (rename detection, dupe handling) | FS wins | inode primary, path/`.name` fallback, content-hash+position last resort (§3) | Wrong ULID attributed internally — cosmetic, self-healing on next scan |
| **Internal** (queries, joins, session references) | DB | ULIDs (stable within a DB lifetime) | Wrong join or lost session — cosmetic; session rebuild fixes |

The "identity" users care about (`[[foo]]`, `@inbox`, `^rec`) lives entirely in the FS domain. ULIDs are never *emitted* to the FS; they are resolved if a user hand-writes one (§2.1).

### 1.7 Session state is durably-best-effort

`~/.km/session.db` (§5.3) stores undo, workspace layout, last-opened. It references NodeIds where pragmatic, paths where safe. On `km doctor rebuild`:
- entries whose NodeIds no longer resolve are silently pruned
- path-anchored entries keep working
- user-visible cost: cosmetic (cursor-was-here lost, recently-opened list shorter)

Session state is **not authoritative**. It's a fast-path for convenience. FS is always the floor.

---

## 2. Identity model

### 2.1 Two layers — external vs internal

| Layer | Where | Who sees it | Purpose |
|---|---|---|---|
| **External** | `.md` on disk | users + other tools (Obsidian, nvim, git) | wiki-links, anchors, tags — human-readable, Obsidian-native |
| **Internal** | `.km/state.db` | km only | DB joins, indexes, session state — opaque ULID handle |

**Internally, the DB resolves paths-of-`.name` to ULIDs.** Externally, markdown normally contains only `.name` values. km never emits ULIDs during writeback — the identity mechanism doesn't need them in the file. But if a user writes a ULID-shaped reference by hand (`[[01HKXB2W...]]`), km recognizes and resolves it as a direct NodeId lookup. The rule is "don't generate them; handle them when seen; keep markdown pure by default," not "reject them."

### 2.2 Tree-of-names model

A markdown file is a tree of named nodes. Every external reference in markdown is a **path through that tree** where each segment is a `.name`:

```
workspace
└── repo              name="vault"
    └── file          name="foo"             ← basename only (Obsidian-compatible)
                      path="notes/foo.md"    ← separate field for disambiguation + FS locate
        ├── heading   name="my-heading"      ← derived from "## My Heading"
        │             name="rec"             ← if "## My Heading ^rec"
        └── block     name="abc"             ← if paragraph ends with "^abc"
```

File `.name` is the **basename** (filename without `.md`), matching Obsidian's link semantics: `[[foo]]` resolves to any file whose basename is `foo`. The file's full repo-relative `path` is a separate field used for FS location and disambiguation when two files share a basename.

Resolution examples:
- `[[foo]]` → basename-index lookup → `[file:"foo"]` (if unambiguous)
- `[[notes/foo]]` → path lookup → specific file (disambiguates across duplicate basenames)
- `[[foo#my-heading]]` → basename lookup + heading-slug-index lookup within file (§2.5) → `[file:"foo", heading:"my-heading"]`
- `[[foo^rec]]` → basename lookup + child `.name` match → `[file:"foo", block:"rec"]`
- `@inbox` → `[tag:"inbox"]`
- `#project` → `[tag:"project"]`

**Name-scope rules** (basis for reconciliation in §3):
- File `.name` (basename) is **not** required to be globally unique — Obsidian allows duplicate basenames across folders. Ambiguity resolves by nearest-path match or link specificity; path is the final arbiter.
- Heading/block/tag `.name` is locally unique within parent scope.
- Primary reconciliation match (§3.2) uses **path** for files (unambiguous) and **parent + `.name`** for children.

### 2.3 The `.name` rule

A node's `.name` is the **string that appears in external references** to it. For each node kind:

| Node kind | `.name` is | Example |
|---|---|---|
| Directory | basename of the directory | `notes/archive/` → `name="archive"` |
| File | **basename** only (Obsidian link form) | `notes/foo.md` → `name="foo"`, `path="notes/foo.md"` |
| Heading WITH anchor | the **anchor literal** (persisted wins over derived) | `## My Heading ^rec` → `name="rec"` |
| Heading WITHOUT anchor | derived from heading text slug | `## My Heading` → `name="my-heading"` |
| Block WITH anchor | the anchor literal | `...paragraph text. ^abc` → `name="abc"` |
| Block WITHOUT anchor | no `.name` — not externally addressable | (nothing) |
| Tag | the literal slug after the sigil | `@inbox` → `name="inbox"` |

Directories are nodes in the tree (they carry their basename in `.name`) but are not user-addressable via wiki-links — they appear only as path segments of their children. Reconciliation for directories uses FS path + inode (§3.3).

**Rule**: if a `^anchor` is present in markdown, it IS the node's name. Otherwise the name is content-derived. **No separate `block_id` / `anchor` field.** One `.name` per node, whichever the markdown literally contains or would canonically render.

**Anchor format (km-minted)**: 6-char lowercase alphanumeric, random — matches Obsidian exactly. Generated on first reference; collision-checked within parent scope; regenerate on collision (namespace 36⁶ ≈ 2.2B; retries near-instant). User-written anchors (`^my-custom-name`) preserved verbatim.

### 2.4 Internal identity

```ts
type NodeId = string & { __brand: "NodeId" }   // brand the existing KNode.id ULID
type RepoId = string & { __brand: "RepoId" }   // per-mount, stored in .km/config.toml
```

- `NodeId` — internal-only opaque ULID. **km never emits them during writeback and never depends on them being in markdown.** Like SQLite rowid. If a user hand-writes a ULID-shaped reference, km resolves it (§2.1); km itself does not produce or require them externally.
- `RepoId` — workspace mount identifier. Stored in `.km/config.toml`.

`KNode` fields (after this revision):
- `id: NodeId` — internal handle
- `name?: string` — the locally-resolvable external identifier (per §2.3 rule)
- `fs_path: string`, `fs_dev: number`, `fs_ino: number`, `fs_mtime: number`, `fs_size: number`, `fs_content_hash?: string` — file location + identity metadata. `fs_dev` pairs with `fs_ino` for reconciliation (§3.2); cross-device inode reuse is otherwise likely. `fs_size` + `fs_mtime` support the watcher fast-path (§7.4). `fs_content_hash` is lazily populated / invalidated on mtime change.

**Removed from KNode**: `block_id?`. Its role is subsumed into `name`. Migration: existing `block_id` values move to `name` where `name` is currently null OR where the heading has both a slug AND an anchor (anchor wins per §2.3).

### 2.5 Anchor vs heading-slug when both exist

In Obsidian, `#` and `^` are distinct namespaces: `#heading` looks up headings by slug, `^anchor` looks up blocks by literal anchor. km preserves this distinction at lookup time, but the `.name` rule (§2.3) collapses one case — an **anchored heading** stores its anchor as `.name`, so the heading-slug index for that node is derived separately.

Lookup algorithm for `[[file<sigil><ident>]]`:

| Link form | First-pass | Fallback | Notes |
|---|---|---|---|
| `[[file^rec]]` | `.name` lookup among blocks+anchored-headings with `name="rec"` | none | Obsidian-native block-anchor semantics |
| `[[file#slug]]` | heading-slug index (content-derived from heading text) lookup for `slug` | `.name` lookup for `name="slug"` if no slug hits | Obsidian-native heading semantics; fallback picks up anchored headings people still reference as `#rec` |
| `[[file]]` | basename index | path lookup if ambiguous | file-level |

The heading-slug index is content-derived from each heading's text and cached alongside the FTS index — not stored per-node. Since km already indexes heading text for FTS, the incremental cost is near-zero.

Rule: `#` and `^` are **separate sigils with separate primary indexes**; a `.name` fallback on `#` exists for the edge case where users reference an anchored heading by its anchor via `#`. If users want heading-slug resolution to work, they leave the heading unanchored; if they anchor it, the anchor is the canonical external name and the slug form still resolves via fallback.

---

## 3. Reconciliation: FS state → ULID

When km scans the filesystem, it maps each node it finds to its internal ULID (preserving identity) or mints a new ULID (genuinely new content). km-authored markdown never contains ULIDs; resolution is by inode + names + composite heuristics.

### 3.1 The model

Every node in the tree has:
- **External identity**: `path-of-.names` — for a block that's `[repo, "notes/foo", "my-heading", "rec"]`; for a heading that's `[repo, "notes/foo", "my-heading"]`; for a file that's `[repo, "notes/foo"]`. Files also carry a separate FS `path`.
- **Internal identity**: a ULID in the DB.

Reconciliation picks which DB ULID an incoming scanned node belongs to.

### 3.2 Primary signals: inode (when available) then path-of-`.name`

Reconciliation on scan tries signals in order of certainty. For each fresh-scanned node:

**Step 1 — inode, when we have it.** If the current scan reports `(fs_dev, fs_ino)` matching a DB row in the expected repo, this is a **presumed match**. Inode is the strongest single signal — OS-level identity — and is the fast path for "user renamed the file in nvim or Finder" and "user edited in place."

**Inode validation rule** (handles inode reuse after deletion):
- Presumed match is confirmed if any of (path, stored content hash, stored mtime) also agrees
- If inode matches but ALL THREE of path / stored content hash / mtime disagree, treat as inode reuse: tombstone the old DB row, mint a fresh ULID for the scanned node
- This prevents silent misattribution after `git clean`, temp-file cycles, or disk restore that reuses inodes

The km schema stores `fs_dev` alongside `fs_ino` (§2.4) — cross-device inode collisions would otherwise be likely.

**Step 2 — path-of-`.name` match**, when inode is absent, unavailable, or stale (fresh git clone, cross-FS copy, Dropbox sync, disk restore — inode reassigned on every file). This is the cross-transport lingua franca: it survives git, rsync, cloud drives, and copy-rename-save editors.

- File: `[repo, "notes/foo.md"]` → match by repo_id + path
- Heading: `[repo, "notes/foo.md", "my-heading"]` → match by parent_file_id + `.name`
- Block: `[repo, "notes/foo.md", "rec"]` → match by parent_file_id + `.name` (anchor literal)
- Tag: `[repo, "inbox"]` → match by sigil_kind + `.name`

Between Step 1 and Step 2 we cover the 90%+ case: files unchanged, files edited in place, files renamed intra-FS (inode), or files touched via git (path/name).

### 3.3 Secondary signals when primaries don't match

When neither inode nor path-of-`.name` finds a DB row, fall through in this order. **Content-hash and position are combined** to disambiguate — either alone is weaker than the pair:

| Signal | Scope | Fires when | Strength | Transport fragility |
|---|---|---|---|---|
| **Content-hash + parent-position** (composite) | File-level | Path + inode both changed, but byte-identical file sits at similar position in the tree → cross-FS or post-git rename | Strong when both match; disambiguates byte-identical duplicates | Fails on rename-with-any-edit |
| **Content hash alone** (sha256 of full file bytes) | File-level | Path + inode both changed, body byte-identical, position ambiguous | Medium — can collide on duplicate/empty files | Fails on rename-with-any-edit |
| **Parent-scope uniqueness** (heading with no anchor) | Within-file, heading | Heading with no anchor; text slug roughly preserved | Medium; works when parent scope unchanged | Intra-file only |
| **Position among siblings** (unnamed block) | Within-file, block | Unnamed block edited; order preserved | Weak; cosmetic session-state only | Intra-file only |

**Why combine content-hash with position**: a byte-identical empty file, or two short notes that happen to match, confuse content-hash alone. Tying it to parent-directory + sibling position makes the match specific: "same content AND same slot in the tree" is strong; "same content, different slot" is a coincidence to ignore.

**Why `.name` isn't primary-primary** despite surviving every transport: when we *do* have inode, inode is stronger (it's OS identity, not a name that could collide). `.name` is the fallback that's always available; inode is the fast path that's often available.

**Explicit non-goals**:
- **Cross-file block moves are not reconciled.** If a user cuts a paragraph (with or without `^anchor`) from `foo.md` and pastes it into `bar.md` offline, km sees "deletion in foo" + "insertion in bar" and assigns a fresh ULID. User-visible cost: internal-only (broken backlinks manifest the same way Obsidian would show them).
- **Rename + edit combined without inode** (path changed AND content changed AND inode unavailable/invalid, e.g., post-git-clone): no heuristic resolves this case; treated as delete + new. See §3.5. When inode *is* available (same-FS rename+edit), Step 1 resolves it normally.
- **Structural similarity** (Levenshtein on heading text, Jaccard on line-set) is deliberately out of scope — a solo-dev tar pit without a concrete definition + property-based test harness. Reintroduce via §9 Deferred if evidence arrives.

Secondary signals only fire when Step 1 (inode) and Step 2 (`.name` path) both miss. For referenced content (files, anchored blocks, tagged things), inode + `.name` resolve the case and secondaries rarely run.

### 3.4 Cost

- File-level: sha256 only when `fs_mtime` changed (cached). On M5 Max, full 5,500-file vault hashes in <500ms; steady-state is single-digit files.
- Heading/block-level: happens during AST reconcile on any file edit. Cheap — N is small per-file.

### 3.5 Ambiguous cases

**Rename + edit simultaneously**:
- **Same-FS, inode available** (user renamed + edited in nvim / Finder): **Step 1 (inode) resolves it**. ULID preserved.
- **Cross-FS or post-git-clone** (inode reassigned): path changed + content changed + inode lost → all reconciliation signals miss → treated as delete + new. Internal ULID is lost on this case only; user sees no external breakage (links still point by path — same as without reconciliation).

**Scope-in trigger**: diff-chunk similarity (git-style >50% line overlap → rename) is listed in §9 Deferred. Reopen only if the fidelity corpus or user reports show the cross-FS rename+edit case becoming common.

### 3.6 What mistaken identity costs (unreferenced content)

If km confuses two unreferenced files or blocks, the damage is confined to km's internal bookkeeping:

| What breaks | Severity |
|---|---|
| Backlink graph (externally) | **Unaffected** — links resolve by path/slug/literal, not by NodeId |
| Session state (cursor, fold, recent) | Wrong state restored; cosmetic; user reopens |
| Undo history | Wrong file gets undo — but undo has content preconditions, so fails cleanly rather than silently corrupting |
| Search hits | Click-to-open uses path; no effect |
| Markdown itself | Unaffected — markdown is truth; DB rebuild → correct identity |

**Self-healing**: next correct rescan (edit, path change) catches the mismatch and reassigns. No permanent damage.

### 3.7 What mistaken identity costs (referenced content)

For blocks WITH `^abc` labels, identity **within a file** is by literal string match — not hash, not similarity. Cannot collide inside the same file (anchor uniqueness is enforced by km and by Obsidian at write time).

**Scoped caveat — cross-file moves.** If a user cuts `^abc` from `foo.md` and pastes it into `bar.md` offline, the anchor string is intact but the parent scope changed. Per §3.3's non-goal, km treats this as "delete in foo + insert in bar with fresh ULID." No misattribution occurs (literal match within each file succeeds on its own terms), but cross-file continuity is lost. Backlinks pointing to `[[foo^abc]]` become unresolved; this is identical to the Obsidian behaviour.

Corruption scenarios that DO exist:
1. User manually deletes `^abc` line marker in nvim → block loses external identity; `[[file^abc]]` refs become unresolved (same as Obsidian).
2. User renames `^abc` → `^xyz` offline → dead ref + new orphan anchor; surfaced as broken/unresolved in km's backlinks panel.
3. User moves `^abc` across files (see scoped caveat above) → ref to old location breaks; new location gets fresh ULID.

None is silent corruption. All surface as visible "unresolved" states, user-repairable.

---

## 4. @sigil tags and other prefixed identifiers

km parses sigil prefixes (`@`, `#`, `[[]]`, `^`) as namespace selectors for the name index. ULID-handling per §2.1.

| Sigil | Example | Stored as | Identity scheme |
|---|---|---|---|
| `@` | `@inbox`, `@project/foo` | literal slug in markdown | `name` lookup scoped by sigil |
| `#tag` | `#tag`, `#project/tag` | literal | `name` lookup scoped by sigil |
| `[[]]` | `[[note-title]]` | literal | basename index (files) + path disambiguation |
| `[[#]]` | `[[note-title#heading]]` | literal | heading-slug index → `.name` fallback within file (§2.5) |
| `[[^]]` | `[[note-title^abc]]` | literal | `.name` string match within file |

Renames of tags/files/headings are the same problem as in Obsidian — slugs change, references drift. Solved at the editor layer (optional "update backlinks on rename"), independent of the identity model.

---

## 5. Federation

### 5.1 Per-repo state

One `.km/state.db` per mounted repo. Workspace = set of mounted adapter instances.

`.km/config.toml`:
```toml
repo_id = "01HKXB2W7K9M1X4Y2Z3"       # stable per-clone
```

### 5.2 Workspace composition

Workspace holds a set of `FsMount` instances (§6). The interface:

```ts
interface Workspace {
  mount(path: string): Promise<FsMount>
  unmount(id: RepoId): void
  mounts(): FsMount[]
  resolve(url: string): Ref | null        // km:/<alias>/<path>#<anchor>
}
```

Workspace config maps repo-aliases → RepoIds:
```toml
[mounts.vault]
repo_id = "01HKXB2W7K9M1X4Y2Z3"
path = "~/Bear/Vault"

[mounts.gdrive]
repo_id = "01HKYD3X8L2R9V1Z"
path = "~/gdrive-mirror"
```

Cross-repo URL: `km:/vault/notes/foo.md#^abc`. Parser resolves `vault` → RepoId → FsMount → path-within-repo.

### 5.3 Three durability scopes

(Distinct from §9's *sync* tiers — this is where data lives, not how it replicates.)

| Scope | Example | Store |
|---|---|---|
| Content (per repo) | Files, headings, blocks, tags | `.km/state.db` per repo + `.md` on disk |
| Session (per workspace) | Workspace layout, undo, recently-opened | `~/.km/session.db` |
| Ephemeral (memory) | Cursor, hover, transient focus | In-memory only |

### 5.4 Memory-only mode preserved

Point km at any directory without `.km/`: in-memory DB, no files written. `bun km view /tmp/scratch` works unchanged. FsMount picks memory vs disk based on `.km/config.toml` presence.

---

## 6. FsMount — the storage engine

### 6.1 Status — the split already exists, mostly

`@km/storage` already has substantial FS separation — this section describes what's there and what the `km-storage.fs-mount` bead formalizes into a package boundary. It is a ~2-day refactor, not a green-field build.

**What's already separated inside `@km/storage`**:
- `store/base.ts` — abstract `BaseStore` with all read ops (getNode, getChildren, search, ancestors, …)
- `store/memory.ts`, `store/fs.ts`, `store/sqlite.ts` — three concrete backends. `SqliteStore` is already FS-free (what a web/canvas km would use).
- `fs/` (~1100 LOC) — CAS, file-tree, ignore, path-utils
- `watch/` (~5000 LOC) — watcher + reconcile + sync + writequeue + bulk-sync

### 6.2 What the fs-mount bead actually does

Moves the FS-touching code out of `@km/storage` into a new `@km/fs-mount` package, leaving the backend-agnostic pieces behind:

```
@km/fs-mount     — watcher + CAS + parser integration + writeback + reconciliation
   │              (moves from @km/storage/src/fs/ + watch/ + store/fs.ts)
   │ emits Op[] / commits to consumers
   ↓
@km/storage      — BaseStore + MemoryStore + SqliteStore + query layer
   │              (backend-agnostic; web/canvas-ready)
   ↓
@km/core         — NodeId, RepoId, KNode, Op types. Pure domain. Zero FS imports.
@km/markdown     — parse/serialize. Consumed by FsMount + future adapters.
```

### 6.3 Scope owned by each layer

**`@km/fs-mount`** owns:
- File watcher (chokidar / `node:fs.watch`)
- Path + `(fs_dev, fs_ino, fs_mtime, fs_size, fs_content_hash)` tracking
- Content-hash rename detection + inode reconciliation (§3)
- Block-anchor literal preservation on write
- Safe-writeback with content-as-CAS (§7)
- Watcher echo suppression via mtime+size fast-path
- Markdown fidelity serializer (minimal patching, corpus-gated)

**`@km/storage`** owns:
- RepoStore + query layer (derived index over commits)
- `withReactive()` reactive decorator (§P1 lazy-hydration builds on this)
- Workspace mount registry

**Does NOT belong to either**:
- Node types, Op types — `@km/core`
- Markdown parse algorithm — `@km/markdown`

### 6.4 No premature Adapter interface

When a second consumer (CardDAV, Notion import, Automerge sync) actually ships, extract commonality at that point. Pro's warning about "false unification" is taken seriously — Notion imports, paginated connectors, and peer-to-peer sync have genuinely different shapes than filesystem scan.

### 6.5 Build-enforced separation

Typecheck fails if `@km/core` or `@km/storage` imports from `node:fs`. This is the load-bearing guarantee that core + backend-agnostic storage stay FS-free, which is what enables a future web/canvas km to swap the engine.

### 6.6 Known constraint — source-level cycle (option d stopgap)

After the initial fs-mount extraction, `@km/storage` source still imports from `@km/fs-mount` in 10 files (notably `store/memory.ts`, `store/base.ts`, `repo/repo.ts`, `repo/loader.ts`, `discovery.ts`, `watcher.ts`, `markdown/processing.ts`, `markdown/collapse-parse.ts`, `db/queries/smart-resolver.ts`, `change-compaction.ts`), while `@km/storage`'s `package.json` does not declare `@km/fs-mount` as a dep. `@km/fs-mount` declares `@km/storage` — so the two form a source-level cycle that only resolves via Bun workspace hoisting.

**Current state (option d):** both packages are `"private": true` and a CI gate + vitest assertion keep them that way. Neither ships to npm until the cycle is broken. See `packages/km-storage/CLAUDE.md` and `packages/km-fs-mount/CLAUDE.md` for the detailed notes and guardrail.

**Long-term resolution (option c, future bead):** extract the shared surface (Emitter, query helpers, common types) into a new dep-free `@km/runtime` package that both sides depend on. That breaks the cycle and unblocks npm publishing. Attempting to publish before then would give end users a broken install.

Option (c) is the correct shape; option (d) is the defensive stopgap that prevents accidental publish while (c) is still pending.

---

## 7. Safe markdown writeback

**The #1 unspoken risk** per pro review. km must never silently overwrite user edits.

### 7.1 Content-as-CAS contract

Every in-memory file state carries `expectedContentHash`. On write:
1. Read current file on disk
2. Compute `actualContentHash = sha256(file)`
3. If `actual !== expected`:
   - Re-parse disk content
   - Replay the intended change against the fresh state
   - If conflict detected → surface to user (never silent overwrite)
4. Atomic write (temp file + rename)
5. Update `expectedContentHash` to reflect new on-disk state

### 7.2 Minimal patching

Serializer preserves what it doesn't touch, within the AST's coverage (§1.2):
- Whitespace in regions the serializer isn't rewriting (trailing, indentation, blank lines)
- List marker choice (`-` vs `*`) for unchanged lists
- Line endings
- User-style preferences (tabs vs spaces)

**Not preserved** — normalized on any write to the file:
- Frontmatter key order (normalized on parse per §1.2; write emits canonical order)
- Byte-level formatting inside any region the AST re-serializes

Rewrites only the exact byte ranges of changed regions. Noisy git diffs are a user-trust event, but the ceiling is AST coverage — the serializer cannot preserve byte detail it did not parse.

**Gating rule**: the minimal-patching serializer ships only after the fidelity corpus (§8.WP3 step 1) proves round-trip stability.

### 7.3 Multi-file atomicity (deferred to Phase B)

**Decision**: Phase A (today) does NOT ship a resumable-on-crash multi-file journal. Operations spanning multiple files (rename + backlink update cascade) apply per-file; if a crash interrupts a cascade mid-way, the FS is left in a partial state.

**What `km doctor` can and cannot do in Phase A**:
- **Can**: rebuild the derived backlinks *index* (DB-side; fully deterministic from current FS content).
- **Can**: surface unresolved references (`[[old-name]]` pointing nowhere because a rename cascade stopped mid-way).
- **Cannot**: automatically *repair* the partial markdown cascade. A half-applied "rename foo → bar + update 40 backlinks" leaves some files pointing at `foo` (the renamed-away name) and some at `bar`; from current FS state alone, there's no deterministic way to know which links the user wanted. The user sees the unresolved-reference list and fixes the remaining files manually (or `rm` the new name if they want to undo).

Rationale:
- A resumable write-ahead log for markdown is a solo-dev tar pit (round-2 review) — many failure modes, large test surface.
- Phase B's op log (§9) handles multi-file atomicity *properly* via semantic replay, a cleaner mechanism than a journal-alongside-markdown.
- For Phase A's scenarios (rare cascade crashes), "surface the breakage, let the user repair" is an honest interim.

If real-world Phase A usage surfaces partial cascades frequently enough to demand repair automation, reopen this decision before Phase B lands. Decision recorded at `km-storage.multi-file-atomicity-decision` (closed).

### 7.4 Watcher echo suppression

FsMount writes produce events the watcher sees. Strategy is **mtime+size fast-path with stateless hash-compare**:

1. On each watch event, compare `(mtime, size)` to the stored `(fs_mtime, fs_size)` (§2.4). If both match, the event is a no-op — no hash, no read. **(Fast path — handles the 99% case.)**
2. If `(mtime, size)` differs, read the file and compute sha256. Compare to `expectedContentHash` (§7.1). If it matches, it's km's own echo — skip. If it differs, it's a real external change — trigger FS→DB reconcile.

The fast-path matters under batch changes (`git checkout` of 5,000 files would otherwise force 5,000 full-file hashes). The hash is still the final gate for correctness; mtime/size just skips work we don't need.

Why stateless over origin cookies or a short-term write cache: the hash is already computed for CAS. A cookie or cache adds a coordination surface that breaks on crashes, on multi-process writers, and on editors that replace-then-rename. Hash-compare has no such failure mode — if the hash matches what we expect, the content is what we expect, period.

---

## 8. Implementation sequence

Five work packages (WP0-WP4) plus one parallel. WP labels name work packages; bead priorities (P0-P4) are separate — see §11. **Schema shape first, then lazy-hydration, then FsMount, then corpus-gated writeback, then federation.** Critical dependencies: identity schema (§2) must land before lazy-hydration queries are written against it; the fidelity corpus gates all writeback work.

### WP0 (prereq, ~1-2 days). Identity schema migration (`km-storage.identity-schema`)
Lands ahead of P1 to avoid re-doing SQLite queries. Scope:
- Fold `KNode.block_id?` values into `.name` (anchor wins over slug; §2.3)
- Introduce branded `NodeId`, `RepoId` types in `@km/core`
- Split file `.name` (basename) from `path` (repo-relative); update resolver
- One migration, one set of query shape changes

### WP1. Lazy hydration (`km-storage.lazy-hydration`) — the scale fix

Today's `peekNode` / `peekChildIds` read from a full in-memory JS object graph that's built on startup (the 2x failure mode). Lazy-hydration swaps that source to SQLite-on-demand. **The reactive layer above does not change shape** — `withReactive()` (`packages/km-storage/src/store/reactive.ts`) already exists and is delta-driven + lazy-signal-creating. It keeps working unchanged; only the underlying `peek*` source shifts.

Scope:
- Swap `peekNode` / `peekChildIds` to SQLite-on-demand (indexed lookups, microseconds each)
- Extend the reactive surface with `backlinksState(nodeId)` — subscribes to link-table changes through the commit delta; only visible nodes keep live signals
- Ensure the commit delta carries link changes (so backlink signals invalidate targetedly, not via broad refresh)
- Target: <500ms cold start on 10x vault (100k files); breaks the benchmarked 2x failure mode

**Reactivity scale pattern**: only visible nodes have live signals (lazy creation). Offscreen → signal map entry GCs when nothing subscribes. `alien-projections` can wrap the visible-nodes-×-backlinks list if we want per-row reactivity; not needed for Phase A. No materialized views, no differential dataflow — SQLite indexed lookups + delta-driven invalidation is sufficient at 100k files.

Queries must target the `BaseStore` interface (what §6 formalizes as the backend-agnostic public face of `@km/storage`), not monolith internals — this keeps the hydration layer backend-agnostic if a future backend ends up being event-sourced materialized views (Phase B+).

### WP2. FsMount + reconciliation (`km-storage.fs-mount`)

Formalize the existing FS split (see §6.1) into a package boundary:
- Move `fs/` + `watch/` + `store/fs.ts` from `@km/storage` into new `@km/fs-mount` package
- Leave `BaseStore` + `MemoryStore` + `SqliteStore` + `withReactive()` in `@km/storage` (backend-agnostic)
- Build-enforce: `@km/core` + `@km/storage` never import `node:fs`
- Update the in-place reconciliation algorithm to the inode-primary cascade (§3) — most of the primary/secondary signals already exist in `watch/reconcile.ts` + `watch/node-differ.*`; this is a revision, not a rewrite

**Reconciliation test harness** (`km-storage.reconciliation-harness`, blocking sub-task): extends the existing chaos + fuzz test suite, doesn't replace it. Relevant existing infrastructure:
- `tests/sync/chaos/` — `chaos-fuzz.fuzz.ts`, `content-roundtrip.fuzz.ts`, `lifecycle-fuzz.fuzz.ts`, `concurrent.slow.test.ts`, `db-to-fs.slow.test.ts`
- `tests/sync/chaos/fake-fs.ts`, `fake-repo.ts`, `fake-watcher.ts` — test doubles
- `tests/sync/chaos/verifier.ts`, `transformers.ts`, `event-picker.ts` — property-test machinery
- `tests/watch/` — `reconcile.test.ts`, `node-differ.fuzz.ts`, `bidirectional-sync.slow.test.ts`, `storage-bugs.slow.test.ts`

Harness bead scope: add scenario fixtures for inode-primary cascade cases (same-FS rename with inode preserved; cross-FS rename with inode reassigned; inode reuse after deletion; directory rename; split-file; merge-file), and extend the chaos verifier with ULID-stability invariants. Net: ~30% new test infrastructure, ~70% extending existing fuzz + chaos suites.

### WP3. Fidelity corpus → safe writeback (merged `km-storage.writeback-cas` + `km-storage.markdown-fidelity-corpus`)
Corpus ships first; serializer only lands once corpus is green. Order within WP3:
1. **Fidelity corpus**: regression corpus proving round-trip stability for the AST's declared coverage (§1.2). Includes hand-curated adversarial cases and fuzzed-from-real-vault samples.
2. **Minimal patching serializer** (§7.2) — gated on corpus
3. **Content-as-CAS contract** (§7.1) — gated on serializer
4. **Watcher echo suppression** (§7.4) — mtime+size fast-path then stateless hash-compare
5. **No multi-file journal in Phase A** — see §7.3.

### WP4. Federation (`km-storage.federation`)
- `.km/config.toml` per repo with stable `RepoId`
- Workspace mount config
- Cross-repo URL resolution (`km:/<alias>/<path>`)
- Orthogonal to scale fix; ships when multi-repo workflows actually bite

### Parallel: session state split (`km-storage.session-state-split`)
- Move undo + workspace layout to `~/.km/session.db`
- Not blocking; can ship any time

---

## 9. Explicit non-decisions / deferred

§9 has two distinct axes — they're orthogonal but often mapped:

| Storage pathway | Typical sync tier at that phase |
|---|---|
| Phase A (FS-truth) | Tier 0 (git) |
| Phase B (op log) | Tier 2 (op-log-based sync) |
| Phase C (DB-truth) | Tier 2 or Tier 3 |
| Phase D (CRDT) | Tier 4 |
| Phase E (sync platform) | beyond tiers — infrastructure layer |

Tiers 1 and 3 are **optional side paths**, not mandatory pathway phases. A product might go Phase A→B→D and skip some tiers; the tiers are reliability stopgaps, phases are value-unlock milestones.

### Sync reliability tiers

km's sync story upgrades in tiers as reliability demands grow. Each tier stays within FS-truth (except Tier 4), and none require putting ULIDs in markdown.

| Tier | Approach | Handles | Ships when |
|---|---|---|---|
| 0 | Git as sync layer | Basic offline edit, multi-device occasional push/pull | Today's default |
| 1 | Tier 0 + identity sidecar (`.km/identity.toml` tracked) | Cross-peer stable ULIDs; survives renames across peers | When multi-device + renames are common |
| 2 | Tier 1 + op log alongside files | Multi-file atomicity in sync; semantic-level merge | When file-level sync corruption becomes painful |
| 3 | Custom bidirectional sync protocol (WSS) | Real-time-ish sync with vector clocks; conflicts surfaced, not auto-merged | When peer-to-peer sync is a shipping feature |
| 4 | CRDT substrate | Auto-merge of concurrent fine-grained edits; real-time collab | Only if real-time collab is a product goal (still deferred; question mark) |

**Open question flagged by round-2 review — does Tier 1 earn its keep?** The sidecar's only real job is "stabilize ULIDs across peers" — but Tier 0 + file-content-hash (§3.3) already handles renames within a single peer's history, and cross-peer rename conflicts (peer A renames foo→bar while peer B renames foo→baz) create a merge-conflict surface in the sidecar itself. If the sidecar just replays the same conflict the filesystem would have, it is net negative. The stronger case for Tier 1 is **empty files / byte-identical duplicates** (where content-hash is useless as a rename signal) and **cross-peer ULID continuity for agent state** (which cares about NodeId stability, not just link stability).

**Current plan**: stay at Tier 0 by default. Tier 1 is only scope-in if an actual sync-reliability incident shows content-hash isn't enough. Tier 2 is a bigger upgrade (semantic ops + multi-file atomicity) and may be where we go next, not Tier 1. Federation (§8.WP4) ships the `RepoId` groundwork that either tier would need. Tiers 3-4 remain further future work.

Honest caveat: **Tier 2 under FS-truth is a DB-truth gateway drug.** If the op log becomes the authoritative record of semantic edits, FS starts looking like a projection of the op log. When we reach for Tier 2, re-read the Phase B/C pathway below first.

### Pathway to DB-truth + CRDT — named, not scheduled

**Value thesis**: FS-truth is the floor, not the ceiling. Reaching DB-truth unlocks first-class versioning/snapshots/rollback as a product feature (not just "use git"), typed queryable per-block metadata, and agent state as a first-class citizen. Reaching CRDT unlocks real-time collaboration and clean offline-online merge without custom conflict UI. These are big unlocks — worth naming a pathway even if we don't schedule it.

**What "pathway" means here**: the phases below are ordered, each leaves a shippable product, and each phase's artifacts are prerequisites for the next. Phase A is today; phases B/C/D are triggered by product need, not by calendar. We don't over-engineer today for phase D, but we prefer decisions today that don't *rule out* D.

#### Phase A — FS-truth (current, §8)

What Phase A ships: an Obsidian-compatible km that scales to 100k files, has disciplined writeback (corpus-gated CAS), survives offline FS edits via inode+name reconciliation, supports multi-repo workspaces, and syncs via git. Full breakdown in §8. It is a complete product without any of B/C/D/E.

#### Phase B — Semantic op log alongside FS (Tier 2)

**Phase B is "persist the existing `apply()` stream."** km already reduces `(action, state) → [state, effects]` via TEA-style state machines (see `docs/design/tea.md`); every user edit is already an op flowing through `apply()` before it touches the serializer. Phase B adds an append-only `.km/oplog/` that records those same ops to disk in addition to reducing them into state. FS remains truth; the log is a parallel authoritative record of *intent*.

| Unlock | Why |
|---|---|
| Semantic multi-file atomicity | Replay a group of ops on recovery; no custom journal (§7.3) |
| Cross-session semantic undo/redo | Undo is an op-level concept, not a text-diff |
| Cleaner sync merge | Two peers exchange ops, not file diffs (still file-rooted under FS-truth) |

Prereqs already in Phase A: stable ULIDs, CAS writeback, fidelity corpus, and the op vocabulary itself (audited 2026-04-22).

**Op vocabulary audit** (`research/op-vocabulary-audit-2026-04-22.md`): verdict (a) — Phase B is persist + replay + ~2–3 person-weeks of normalization. km has serializable `ChangeType` ops flowing through `emitter.apply()`; the risk is op-surface *closure*, not op *shape*. 11 gaps identified; high-severity op-surface closures (G1, G3, G4, G7, G9) are shipped. See the audit for the gap map and the four follow-up beads created.

**Phase B replay contract spec** (`phase-b-replay-contract-2026-04-22.md`): DQ1–DQ5 answered. Key decisions: extend `changes.jsonl` in-place (no dual-write sinks), snapshot + ops-since replay model (not replay-from-epoch — `node_deleted` semantics make that unsafe), origin-tagged fs-watch ops skipped on replay, `task_*` kept as tagged aliases of `node_updated`, oplog boundary at schema-stable.

**Remaining work for B**: op-log compaction + snapshot format implementation, replay tooling (`km doctor replay-from-snapshot`, `verify-oplog-integrity`), retention policy, property-test hardening.

**Unlock scope honest**: "cleaner sync merge" via op exchange between peers assumes ops are **repo-stable and serialization-safe** (no pointers to in-memory state). The audit above is a prerequisite for this claim. Local oplog for recovery + semantic undo is cheaper and more certain than cross-peer exchange.

**Caveat surfaced in round-2 review**: Phase B under FS-truth is a "DB-truth gateway drug." Once ops are the authoritative intent record, FS starts looking like a projection. That's fine — that's literally the pathway. Phase B makes the Phase C flip *smaller*, not larger.

#### Phase C — DB-as-truth flip

DB becomes the canonical store. FS is a deterministic projection of DB state. Ops from Phase B drive DB mutations directly instead of going through the markdown text round-trip.

| Unlock | Why |
|---|---|
| Versioning + snapshots + rollback as product | DB-level history; not "use git, sorry" |
| Typed per-block metadata (tags, status, priority, embeds) | Persists in DB without polluting markdown |
| Agent state, live annotations, rich embeds as first-class | Not representable in AST → markdown |
| Cross-device sync at op-granularity | More robust than file-level |

Prereqs from Phase B: op vocabulary, op log, semantic replay. Prereqs from Phase A: ULIDs, fidelity corpus, CAS.

**Gaps that MUST be specified before Phase C becomes live** (un-estimated — these are product-earthquake-scale):
- Conflict-resolution UX when Obsidian edits a file while km has unsaved DB state
- FS projection strategy — full, dirty-file, deletion handling
- DB-query → FS-patch mapping — a block referenced in two files: which file owns its projected form?
- Versioning + backup + rollback UI — non-optional; DB-truth must match FS-truth's trust floor
- Bootstrap migration — one-way door from FS-truth users to DB-truth
- Product communication — "your markdown is now a projection, updated automatically from DB"

Earlier drafts of this doc offered LOC estimates (~300-400 core + ~500-800 versioning). Round-2 review flagged these as likely off by an order of magnitude. Removed; Phase C is a quarter, not a sprint.

#### Phase D — CRDT substrate under DB

DB state is a CRDT (Yjs-style, Automerge-style, or a custom log of ordered ops). Concurrent edits from multiple peers or multiple agents auto-merge without custom conflict UX.

| Unlock | Why |
|---|---|
| Real-time multi-user collaboration | Peer-to-peer over any transport |
| Offline-online merge without surfaced conflicts | CRDT math handles most merges |
| Safe concurrent multi-agent edits | Agents as additional "peers" |

Prereqs from Phase C: DB is truth; ops are already the mutation path. Adding CRDT is "make the DB mutations CRDT-reconcilable."

**Caveats (kept from round-2)**: kimmi's Automerge experience showed the complexity tax is real — perf cost, schema rigidity, debuggability all take hits. Phase D is triggered by real-time collab becoming a shipping requirement, not by "CRDTs are cool." Reopen when user feedback or product direction demands it.

**Phase D perf escape hatch**: if Automerge-on-JS perf becomes the blocker (kimmi precedent says it will at non-trivial scale), the likely answer is to rewrite core storage in Rust or Zig and host Automerge natively at that layer — with the TS/Bun surface calling into it via FFI. This is almost certainly what "Phase D done properly" looks like eventually. Treat it as an expected escalation, not as a surprise. Keeping the storage layer's public interface small + op-shaped (per "Phase A pathway implications") means the native rewrite is a swap, not a rebuild of everything above it.

#### Phase E — km as a large-scale file sync platform

Dropbox / Google Drive / iCloud-class sync built on the CRDT substrate of Phase D. km stops being "a local-first editor that can sync" and becomes "a sync platform with km on top."

| Unlock | Why |
|---|---|
| Million-file workspaces across devices | CRDT gives merge semantics; infrastructure gives scale |
| Binary blobs (images, PDFs, audio, video, attachments) as first-class | Markdown alone doesn't handle these; DB-truth already treats files as addressable units |
| Selective sync / partial hydration / on-demand fetch | Most users don't need the whole vault on every device |
| Sharing primitives — folder sharing, permissions, invites | Phase D gives safe concurrent edits; Phase E gives the access model |
| Storage tiering (hot/cold/archive) + true offline support | Sync platform responsibilities, not editor responsibilities |
| Conflict-free sync across arbitrary transports (not just git) | Current Tier 0 (git) is a hack at this scale; CRDT + cloud storage is the real answer |

Prereqs from Phase D: CRDT substrate is live; the native-rewrite perf path (Phase D escape hatch) is probably already done or concurrent — Phase E's throughput requirements push the same direction.

**Scope honest**: Phase E is a product platform, not an architecture tweak. The prior phases give it a shot at being buildable (DB addressability, CRDT merge, native-perf storage); Phase E itself is primarily infra + product work (cloud services, blob store, sync protocol, auth, billing). Treat it as a direction this architecture *enables*, not as something this architecture plans.

#### Non-prerequisites (deliberately keeping open)

- Sync Tier 1 (identity sidecar): flagged as probably dead weight (§9 sync tiers table). Content-hash already covers intra-peer rename; cross-peer NodeId continuity might motivate it if agent-state sync becomes a thing, but it's not on any pathway phase.
- Tier 3 custom bidirectional protocol: orthogonal — could live under Phase B/C/D with different shapes. Not claiming a slot.

#### What this pathway changes about today's work

Very little, on purpose. Phase A (§8) is what we're executing. But knowing the pathway exists means:
- Prefer an op-log-friendly op vocabulary in P2/P3 (edits should already be expressible as discrete ops — they mostly are)
- Keep the serializer driven by ops, not by raw text diffing (aligns with P3)
- Don't architect around "FS is forever truth" (e.g., don't hard-code assumptions that writing to FS first is the only path — leave room for DB-first later)
- When we reach for Tier 2 sync, recognize we are entering Phase B

### Rejected (not on any roadmap)

- **Frontmatter `id:` injection** — rejected. Zero metadata pollution of user files.
- **Inline `^<hash>` derived from ULIDs** — rejected. Block anchors are literal strings stored as `.name`, not hash-derived.
- **Rank 4-6 rigid recovery cascade** — rejected per "ID-scattering is a no-go." §3 is paths-of-`.name` + cheap heuristics. No forced multi-rank ladder.

### Deferred (scope-in if evidence arrives)

- **Uniform Adapter interface** — second real consumer required. Today: concrete `FsMount` (§6).
- **Diff-chunk similarity for rename+edit** — see §3.5. Scope-in only if the fidelity corpus or user reports show offline rename+edit becoming common enough to matter.
- **Structural-similarity heuristic** — see §3.3. Currently removed from the cascade; reintroduce only with a concrete definition (Levenshtein on heading text? Jaccard on line-set?) and a scenario-based test suite.
- **Undo semantics across files** — session-state split provides durable-undo; cross-file semantic policy open.
- **LLM-adjudicated reconciliation for rare hard cases** — when Steps 1-3 (§3.2, §3.3) all miss or are ambiguous (major rename+edit, split-file, merge-file, heading reorg), call a fast local LLM to judge "is this the same node conceptually?" Interesting only if: (a) firing rate stays very low so cost + latency are negligible, (b) used only for unreferenced-content blast radius (§3.6) so a wrong answer self-heals, (c) decisions are cached + audit-logged for reproducibility, (d) local/private models are the default. Risks: non-determinism, hallucinated matches, debuggability. Captured as a Phase C-era exploration — Phase A doesn't need it. Potential bead: `km-storage.llm-reconciliation-spike` when evidence says the hard cases are frequent enough to matter.

---

## 10. Evidence underlying this design

- **Op-vocabulary audit** (`research/op-vocabulary-audit-2026-04-22.md`): km's ChangeType is serializable; risk is op-surface closure, not op shape. 11 gaps; high-severity closures shipped. Underwrites Phase B cost estimate (2–3 person-weeks normalization).
- **Phase B replay contract spec** (`phase-b-replay-contract-2026-04-22.md`): DQ1–DQ5 answered. Settles snapshot+ops replay model, fs-watch-op handling, `task_*` aliasing, migration boundary.
- **Scale bench** (`research/scale-bench-results-2026-04-21.md`): full-load-into-memory breaks at 2x. Per-query perf stays good at 10x. → lazy-hydration first.
- **Kimmi deep-dive** (`research/kimmi-crdt-sync-id-deep-dive.md`): architectural wins are stable-IDs + op-reconciliation + materialized indexes. Automerge has concrete gaps. → internal ULIDs fine, CRDT deferred.
- **Cloudi deep-dive** (`research/cloudi-architecture-deep-dive.md`): external-system-as-truth has critical ID instability. → Family A holds.
- **Dual-pro review round 1** (2026-04-21 PM): caught frontmatter-id-injection as user-trust risk, block-hash collision math, uniform-adapter over-generalization, missing safe-writeback.
- **Dual-pro review round 4** (2026-04-22, GPT-5.4 Pro + Kimi K2.6 both landed — `research/storage-arch-pro-review-round-4-2026-04-22.md`): final check on docs + beads. Convergent findings applied: reparented `km-tree.outliner-reshape` + `km-tree.refs` out of `km-storage` into new `km-tree` scope epic; closed `km-storage.automerge-store` (superseded by `pathway-db-crdt` Phase D) + `km-storage.typed-event-categories` (speculation without driver); wired dependencies `writeback-cas → markdown-fidelity-corpus + fs-mount` and `federation → identity-schema + fs-mount`; lowered `federation` to P2 to match §8.WP4 ordering; renamed §8 work-package labels P0-P4 → WP0-WP4 to disambiguate from bead priorities; fixed §8.WP3 step 4 wording (was "hash-compare only," now "mtime+size fast-path then hash-compare" matching §7.4); §11 scoped as "architecture-path beads only" with a note that cleanup/bug beads are out-of-band. Both models: "ship it."
- **Dual-pro review round 3** (2026-04-22, GPT-5.4 Pro + Kimi K2.6 both landed — `research/storage-arch-pro-review-round-3-2026-04-22.md`): both models converged on "doc is basically solid, no structural rewrite needed." Concrete fixes: inode-primary rename+edit wording (§3.3/§3.5), `[[file#heading]]` resolution path (§2.2/§2.5), ULID language (§2.4), `fs_dev` schema gap, multi-file atomicity DRY collapse (§7.3 + §8.WP3 step 5), `km doctor` claim tightening (§7.3), watcher mtime+size fast-path (§7.4), tier↔phase mapping (§9). Surfaced the **op-vocabulary audit** as the hidden Phase B tar pit (`km-storage.op-vocabulary-audit` P0).
- **Dual-pro review round 2** (2026-04-22, Kimi K2.6; GPT-5.4 Pro failed — `research/storage-arch-pro-review-round-2-2026-04-22.md`): caught duplicate section numbering, frontmatter key-order contradiction (§1.2 vs §7.2), file `.name` basename/path ambiguity, `#` vs `^` namespace collapse, diff-chunk similarity contradiction (§3.5 vs §9), content-hash scope undefined, structural similarity hand-waving, cross-file block-move claim too strong, directory-as-node missing, tier 1 weakly motivated, DB-truth cost estimates likely off-by-10x, P3-before-P5 ordering risk (CAS without proven fidelity), schema churn risk (P1 against P2's old schema), multi-file journal "best-effort" as user data-loss risk.
- **User pushbacks** (2026-04-21): (a) FS messiness → solve lower in stack; (b) federation eventually necessary; (c) identity robust against offline FS changes; (d) core unaware of FS; (e) **no metadata injection**; (f) **no ID scattering beyond what's inherently needed**; (g) Obsidian-native block anchors; (h) DB-truth probable future, not deferred-forever; (i) if DB-truth, versioning/rollback is scope-in.

---

## 11. Current bead tracking

Single tracking tree under the permanent scope epic **`km-storage`** (`bd show km-storage`). **This section lists architecture-path beads only**; standing cleanup/bug beads live under the same epic but are out-of-band from this doc's scope.

**Phase A architecture-path beads — all shipped (2026-04-22 session)**:

```
km-storage (scope epic, never closes)
├── ✓ km-storage.identity-schema              [P0] §8.WP0 — schema v5, branded NodeId/RepoId
├── ✓ km-storage.lazy-hydration               [P0] §8.WP1 — SQLite-on-demand peek*, backlinks signal
├── ✓ km-storage.fs-mount                     [P1] §6, §8.WP2 — @km/fs-mount package extracted
│   ├── ✓ km-storage.reconciliation-harness   [P1] chaos+fuzz harness for cascade
│   ├── ✓ km-storage.identity-recovery-cascade [P1] §3.2/§3.3 cascade implemented
│   └── ✓ km-storage.markdown-fidelity-corpus [P1] 36 fixtures / 11 categories
├── ✓ km-storage.writeback-cas                [P1] §7.1/§7.4 — CAS + atomic + echo guard
├── ✓ km-storage.federation                   [P2] §5 — RepoId + workspace + km-URI (parse only)
├── ✓ km-storage.session-state-split          [P2] §5.3 — ~/.km/session.db
└── ○ km-storage.pathway-db-crdt              [P3 epic] §9 Phase B→E tracker
    ├── ✓ km-storage.op-vocabulary-audit      [P0] — verdict: Phase B = persist + replay
    └── ✓ km-storage.phase-b-replay-contract-spec [P1] — DQ1–DQ5 answered
```

**Op-surface closure beads created from the op-vocabulary audit — all shipped same session**:

```
├── ✓ km-storage.op-surface-rename-path       [P0] G3 — journalRename replaced by emitter.commit
├── ✓ km-storage.op-surface-route-scanner     [P1] G1 — scanner + loader-replay routed through emitter
└── ✓ km-storage.op-surface-embed-blockid-standardize [P2] G4/G7/G9 — embed_of/block_id/content_hash unified
```

Adjacent (not under km-storage):
- `km-all.shared-substrate-review` [P0] — cross-project extraction (due 2026-05-05)

**Earlier supersessions**: `km-storage.source-of-truth-contract`, `km-storage.stable-ids`, `km-storage.three-seam-boundary`, `km-storage.scale-architecture`, `km-storage.scale-benchmarks` (shipped), `km-storage.block-hash-refs`, `km-storage.frontmatter-id-migration`, `km-storage.adapter-architecture` (v3 doc), `km-storage.multi-file-atomicity-decision` (Phase A ships without journal), `km-storage.crdt-trigger` (absorbed into `pathway-db-crdt`), `km-storage.automerge-store` (absorbed into `pathway-db-crdt` Phase D), `km-storage.typed-event-categories` (speculation, no driver).
