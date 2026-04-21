# km Storage Architecture

Canonical design for km's storage + identity + adapter model. **Evergreen — describes current state, not decision history.** For research evidence, see `hub/km/research/`.

Last revised: 2026-04-21 (after dual-pro critique + user pushback on frontmatter pollution).

---

## 1. Truth model

### 1.−1 The dual mental model

**Externally, km lives in Obsidian's world.** Users edit `.md` files. Obsidian reads/writes them. Git tracks them. vim works. Wiki-links, block anchors, tags, frontmatter — all the Obsidian vocabulary, all Obsidian-compatible semantics. If you only ever use km through the command line and read markdown elsewhere, km looks like "a TUI that edits my vault."

**Internally, km is a hierarchical database of typed nodes.** Files, headings, paragraphs, list items, tags, references — each is a node with a stable internal ID, a kind, a parent, children, relations, indexes. Queries traverse the node tree; backlinks, FTS, typed lookups, fold state, selection, undo all operate against this model. If you opened the SQLite file and peered in, you'd see a graph database, not markdown.

**The storage architecture's job is to bridge these two views without compromising either.** Markdown stays legible to humans and compatible with Obsidian; the internal node tree stays rich enough for fast queries and stable session state. The AST is the bridge — parsing markdown yields the node tree; serializing the node tree produces Obsidian-compatible markdown.

Everything that follows (truth model, identity, recovery cascade, adapter architecture) serves this bridge: let the two worlds coexist cleanly, with the markdown being legible + Obsidian-faithful, and the internal model being rich + queryable.

### 1.0 What km actually guarantees

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

### 1.1 FS-truth is a choice about implementation, not fidelity

**FS is truth. DB is a derived cache.** But "truth" here is a **convention about where edits originate + who wins on conflict**, not a claim that FS preserves more of the user's intent than DB would.

Both architectures could preserve the same structural fidelity (AST round-trip). The reason km picks FS-truth is:
- Simpler implementation: no ingest pipeline, no regen loop, no echo suppression loop — watcher + AST-reconcile is enough
- Matches today's code path (km already parses .md → AST → writes .md)
- No sync requirement yet — so DB-truth's sync benefits aren't earned

If km's feature horizon grows to need:
- Beyond-markdown representation (typed fields not fitting in frontmatter, per-block metadata with no inline syntax, computed/derived fields surfaced to users)
- Rich cross-peer sync with shared undo or real-time collab
- Streaming/op-log semantics that surface in the UI

…then DB-truth reopens as the natural architecture. Plain-text round-trip quality is independently achievable at that tier (same AST-normalized output).

### 1.2 Policy statement

- **FS is the canonical storage for user content.** `.md` files are where the data lives.
- **DB is a derived cache** over the FS. Everything in DB can be regenerated from FS (modulo session state — see §1.3).
- **Internal ULIDs are join keys, not identity.** They never appear in markdown.
- **On conflict, FS wins.** External edits (vim, Obsidian, git pull) are trusted; km's in-flight DB state is disposable.
- **Zero metadata injection into user files.** km writes no hidden IDs, no frontmatter additions, no inline ID tags, no HTML comments.
- **Obsidian interop preserved.** Wiki-links, block anchors, headings, tags all work as Obsidian expects.

**Tagline**: "If you can't read it with `cat`, km doesn't claim it."

### 1.1 The load-bearing invariant

**Every DB column must be computable from (FS content + optional session.db).** If a column can't be derived from the FS, it's either a bug or a scope expansion that needs explicit justification.

Consequences:
- `km doctor rebuild` deletes `.km/state.db` and reconstructs from a fresh FS crawl. **No user-visible data loss** beyond session state.
- Internal ULIDs (`KNode.id`) get freshly minted on rebuild. No external reference uses them, so no breakage crosses the FS boundary.
- Backlinks, FTS, anchor index, structural metadata — all derived. Rebuild is deterministic from content.

### 1.2 What "identity" means at each layer

| Domain | Truth source | Identity form | Failure mode of a mistake |
|---|---|---|---|
| **External** (links users type, Obsidian sees, git tracks) | FS | paths + `.name` strings | Broken link — visible to user, user-fixable |
| **FS→DB sync** (rename detection, dupe handling) | FS wins | path primary, content-hash fallback | Wrong ULID attributed internally — cosmetic, self-healing on next scan |
| **Internal** (queries, joins, session references) | DB | ULIDs (stable within a DB lifetime) | Wrong join or lost session — cosmetic; session rebuild fixes |

The "identity" users care about (`[[foo]]`, `@inbox`, `^rec`) lives entirely in the FS domain. ULIDs never leak out.

### 1.3 Session state is durably-best-effort

`~/.km/session.db` (§5.3) stores undo, workspace layout, last-opened. It references NodeIds where it's pragmatic, paths where it's safe. On `km doctor rebuild`:
- entries whose NodeIds no longer resolve are silently pruned
- path-anchored entries keep working
- user-visible cost: cosmetic (cursor-was-here lost, recently-opened list shorter)

Session state is **not authoritative**. It's a fast-path for convenience. FS is always the floor.

### 1.4 Reopen triggers

Revisit "FS is truth" only if:
- Multi-device concurrent editing becomes shipping-required → forces peer-sync semantics → CRDT reopens
- Markdown fidelity corpus shows irrecoverable round-trip loss → forces DB-authoritative for some subset
- Plain-text portability axiom is explicitly negotiated away → all bets off

---

## 2. Identity model

### 2.1 Two layers — external vs internal

| Layer | Where | Who sees it | Purpose |
|---|---|---|---|
| **External** | `.md` on disk | users + other tools (Obsidian, nvim, git) | wiki-links, anchors, tags — human-readable, Obsidian-native |
| **Internal** | `.km/state.db` | km only | DB joins, indexes, session state — opaque ULID handle |

**Internally, the DB resolves paths-of-`.name` to ULIDs.** Externally, markdown contains only `.name` values — there are no ULIDs anywhere in `.md` files.

### 2.2 Tree-of-names model

A markdown file is a tree of named nodes. Every external reference in markdown is a **path through that tree** where each segment is a `.name`:

```
workspace
└── repo              name="vault"
    └── file          name="notes/foo"       ← derived from filename
        ├── heading   name="my-heading"      ← derived from "## My Heading"
        │             name="rec"             ← if "## My Heading ^rec"
        └── block     name="abc"             ← if paragraph ends with "^abc"
```

Resolution examples:
- `[[foo]]` → `[file:"foo"]`
- `[[foo#my-heading]]` → `[file:"foo", child:"my-heading"]`
- `[[foo^rec]]` → `[file:"foo", child:"rec"]`
- `@inbox` → `[tag:"inbox"]`
- `#project` → `[tag:"project"]`

Names are **locally unique** (within parent scope) — not globally unique. A file has unique child-names; a directory has unique filenames.

### 2.3 The `.name` rule

A node's `.name` is the **string that appears in external references** to it. For each node kind:

| Node kind | `.name` is | Example |
|---|---|---|
| File | derived from filename (path stripped of `.md`) | `"notes/foo"` |
| Heading WITH anchor | the **anchor literal** (persisted wins over derived) | `## My Heading ^rec` → `name="rec"` |
| Heading WITHOUT anchor | derived from heading text slug | `## My Heading` → `name="my-heading"` |
| Block WITH anchor | the anchor literal | `...paragraph text. ^abc` → `name="abc"` |
| Block WITHOUT anchor | no `.name` — not externally addressable | (nothing) |
| Tag | the literal slug after the sigil | `@inbox` → `name="inbox"` |

**Rule**: if a `^anchor` is present in markdown, it IS the node's name. Otherwise the name is content-derived. **No separate `block_id` / `anchor` field.** One `.name` per node, whichever the markdown literally contains or would canonically render.

**Anchor format (km-minted)**: 6-char lowercase alphanumeric, random — matches Obsidian exactly. Generated on first reference; collision-checked within parent scope; regenerate on collision (namespace 36⁶ ≈ 2.2B; retries near-instant). User-written anchors (`^my-custom-name`) preserved verbatim.

### 2.4 Internal identity

```ts
type NodeId = string & { __brand: "NodeId" }   // brand the existing KNode.id ULID
type RepoId = string & { __brand: "RepoId" }   // per-mount, stored in .km/config.toml
```

- `NodeId` — internal-only opaque ULID. **Never written to markdown. Never user-visible.** Like SQLite rowid.
- `RepoId` — workspace mount identifier. Stored in `.km/config.toml`.

`KNode` fields (after this revision):
- `id: NodeId` — internal handle
- `name?: string` — the locally-resolvable external identifier (per §2.3 rule)
- `fs_path: string`, `fs_ino: number`, `fs_mtime: number` — file location metadata (unchanged)

**Removed from KNode**: `block_id?`. Its role is subsumed into `name`. Migration: existing `block_id` values move to `name` where `name` is currently null OR where the heading has both a slug AND an anchor (anchor wins per §2.3).

### 2.5 Anchor vs heading-slug when both exist

For an anchored heading (`## My Heading ^rec`), `.name = "rec"` by the §2.3 rule. This means:
- `[[file^rec]]` → direct `name` lookup → hits
- `[[file#rec]]` → direct `name` lookup → hits (`#` and `^` are the same resolution path)

If a user writes `[[file#my-heading]]` referring to the anchored heading, resolution falls through to a **content-derived slug index** (built from heading text across all nodes in the file — computed/cached, not stored per-node). Since km already builds an FTS index for search, this is essentially free. If the derived slug uniquely matches, it resolves; otherwise unresolved.

Simple rule: **anchor wins when both exist**. If users want the heading-slug form to work, they don't anchor the heading. If they anchor it, the anchor is the canonical external name.

---

## 3. Identity recovery (git-style, no metadata injection)

When km scans the filesystem and compares to its DB, it needs to match files despite offline changes (renames, moves, edits). **No frontmatter IDs** — identity comes from git-style content + path matching.

### 3.1 The algorithm

```
for each file F on disk:
  F.contentHash = sha256(F.bytes)    # cached via fs_mtime, only re-hash on change
  if known row exists where path == F.path:
    → preserve NodeId, update contentHash if changed  (edit-in-place)
  else if known orphan row exists where contentHash == F.contentHash:
    → preserve NodeId, update path                     (rename / move, unchanged content)
  else:
    → mint new NodeId                                  (new file, or rename-with-edit — see §3.3)

for each DB row with path not on disk:
  → mark orphan (candidate for rename-match above)
  → if unmatched after scan, mark deleted (tombstone for backlinks integrity)
```

### 3.2 Cost

- sha256 on 5,500 files of ~1kB-50kB averages 200-500ms on M5
- Cached via `fs_mtime` — unchanged mtime skips the hash
- Steady state: only modified files get rehashed

### 3.3 Ambiguous case — rename + edit simultaneously

If path changed AND content changed, the algorithm can't tell "moved-and-edited" from "deleted-and-created." Start with: treat as delete + new. Lose identity on this edge case.

**Future upgrade** (if real-world hits): diff-chunk similarity like git's rename-with-edit detection (>50% line overlap → rename). Out of scope until evidence demands.

### 3.4 What mistaken identity costs (unreferenced content)

If km confuses two unreferenced files or blocks, the damage is confined to km's internal bookkeeping:

| What breaks | Severity |
|---|---|
| Backlink graph (externally) | **Unaffected** — links resolve by path/slug/literal, not by NodeId |
| Session state (cursor, fold, recent) | Wrong state restored; cosmetic; user reopens |
| Undo history | Wrong file gets undo — but undo has content preconditions, so fails cleanly rather than silently corrupting |
| Search hits | Click-to-open uses path; no effect |
| Markdown itself | Unaffected — markdown is truth; DB rebuild → correct identity |

**Self-healing**: next correct rescan (edit, path change) catches the mismatch and reassigns. No permanent damage.

### 3.5 What mistaken identity costs (referenced content)

For blocks WITH `^abc` labels, identity is by **literal string match** — not hash, not similarity. Can't accidentally collide.

Corruption scenarios that DO exist:
1. User manually deletes `^abc` line marker in nvim → block loses external identity; `[[file^abc]]` refs become unresolved (same as Obsidian).
2. User renames `^abc` → `^xyz` offline → dead ref + new orphan anchor; surfaced as broken/unresolved in km's backlinks panel.

Neither is silent corruption. Both surface as visible "unresolved" states, user-repairable.

---

## 4. @sigil tags and other prefixed identifiers

km parses sigil prefixes (`@`, `#`, `[[]]`, `^`) as namespace selectors for the name index. **No ULID leakage ever**.

| Sigil | Example | Stored as | Identity scheme |
|---|---|---|---|
| `@` | `@inbox`, `@project/foo` | literal slug in markdown | `name` lookup scoped by sigil |
| `#` | `#tag`, `#project/tag` | literal | same |
| `[[]]` | `[[note-title]]` | literal | `name` lookup (file slug) |
| `[[#]]` | `[[note-title#heading]]` | literal | heading-slug lookup within file |
| `[[^]]` | `[[note-title^abc]]` | literal | `name` string match within file (same path as `[[...#abc]]`) |

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

Concrete class `FsMount` for now — uniform `Adapter` interface extracted only when a second real consumer exists (see §6).

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

### 5.3 Three durability tiers

| Tier | Example | Store |
|---|---|---|
| Content (per repo) | Files, headings, blocks, tags | `.km/state.db` per repo + `.md` on disk |
| Session (per workspace) | Workspace layout, undo, recently-opened | `~/.km/session.db` |
| Ephemeral (memory) | Cursor, hover, transient focus | In-memory only |

### 5.4 Memory-only mode preserved

Point km at any directory without `.km/`: in-memory DB, no files written. `bun km view /tmp/scratch` works unchanged. FsMount picks memory vs disk based on `.km/config.toml` presence.

---

## 6. FsMount (storage engine) — concrete, not abstracted yet

### 6.1 Scope

Owns all filesystem-specific behavior:
- File watcher (chokidar / node:fs.watch)
- Markdown parse/serialize integration (`@km/markdown`)
- Path + inode + mtime tracking
- Content-hash rename detection (§3)
- Block-anchor literal preservation (§2.2)
- Safe-writeback with content-as-CAS (§7)
- Self-write suppression (don't re-ingest own writes)
- Markdown fidelity: minimal patching, preserve user formatting

Does NOT own:
- RepoStore / in-memory tree — `@km/storage` (derived index over FsMount content)
- Node types, Op types — `@km/core`
- Parsing algorithm itself — `@km/markdown`

### 6.2 Package boundary

```
@km/fs-mount     — concrete class; owns watcher/parser/serializer/CAS
   │ emits Op[] to consumers
   ↓
@km/storage      — RepoStore (derived index over FsMount) + workspace mount registry
   │
   ↓
@km/core         — NodeId, RepoId, KNode, Op types. Pure domain. Zero FS imports.
@km/markdown     — parse/serialize. Consumed by FsMount + future adapters.
```

**No premature `Adapter` interface.** When a second consumer (CardDAV, Notion import, Automerge sync) actually ships, extract commonality at that point. Pro's warning about "false unification" is taken seriously — Notion imports, paginated connectors, and peer-to-peer sync have genuinely different shapes than filesystem scan.

### 6.3 Build-enforced separation

Typecheck fails if `@km/core` or `@km/storage` imports from `node:fs`. This is the load-bearing guarantee that core stays FS-agnostic, which is what enables a future web/canvas km to swap the engine.

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

Serializer preserves what it doesn't touch:
- Whitespace (trailing, indentation, blank lines)
- Frontmatter key order
- List marker choice (`-` vs `*`)
- Line endings
- User-style preferences (tabs vs spaces)

Rewrites only the exact byte ranges that changed. Noisy git diffs are a user-trust event.

### 7.3 Multi-file atomicity

For operations spanning multiple files (rename + backlink update cascade):
- Write operations stored in a local journal (`.km/journal/pending/`)
- Journal applied with best-effort + resumable-on-crash
- `bun km doctor` inspects journal + surfaces unresolved items

### 7.4 Watcher echo suppression

FsMount writes produce events the watcher sees. Suppression strategies:
- Tag writes with an origin cookie; watcher filters
- Short-term path+digest cache: "I just wrote this, ignore first change"
- Stateless approach: on watch event, hash-compare against expected — if match, skip

---

## 8. Implementation sequence (revised)

Five work packages. **Lazy-hydration ships first** per pro + K2.6 — the scale-bench failure is the real product risk; identity work is orthogonal scaffolding.

### P1. Lazy hydration (`km-storage.lazy-hydration`, P0) — ship first
- Stop loading full JS object graph on startup
- Move navigation/backlinks to SQLite-on-demand queries
- Target: <500ms cold start on 10x vault (100k files)
- Covered-target: breaks the benchmarked 2x failure mode today
- Doesn't require any identity or adapter changes

### P2. FsMount concrete class + content-hash rename detection (`km-storage.fs-mount`) — second
- Extract FS code from `@km/storage` into new `@km/fs-mount` package
- Build-enforce: `@km/core` + `@km/storage` never import `node:fs`
- Implement content-hash rename detection on scan (§3)
- Fold `KNode.block_id?` values into `.name` (anchor wins over slug when both exist; §2.3)
- Introduce branded `NodeId`, `RepoId` types in `@km/core`

### P3. Safe writeback (`km-storage.writeback-cas`)
- Content-as-CAS contract (§7.1)
- Minimal patching serializer (§7.2)
- Watcher echo suppression (§7.4)
- Multi-file journal (§7.3)

### P4. Federation (`km-storage.federation`) — P2, not P1
- `.km/config.toml` per repo with stable `RepoId`
- Workspace mount config
- Cross-repo URL resolution (`km:/<alias>/<path>`)
- Orthogonal to scale fix (P1 already solved); do this when multi-repo workflows actually bite

### P5. Markdown fidelity corpus (`km-storage.markdown-fidelity-corpus`)
- Regression corpus for round-trip integrity
- Gate for any future writeback change

### Parallel: session state split (`km-storage.session-state-split`, P2)
- Move undo + workspace layout to `~/.km/session.db`
- Not blocking; can ship any time

---

## 9. Explicit non-decisions / deferred

- **CRDT substrate** — kimmi's Automerge experience says don't. Reopen if multi-device concurrent sync becomes shipping-required.
- **Sync protocol** — only after CRDT question is reopened.
- **Undo semantics across files** — session-state split provides durable-undo; semantic policy stays open.
- **Frontmatter `id:` injection** — **rejected**. User requirement: zero metadata pollution of user files.
- **Rank 4-6 recovery cascade** (structural/positional heuristics) — rejected per "ID-scattering is a no-go." Keep only path match + content-hash rename detection.
- **Uniform Adapter interface** — deferred until second real consumer exists. Today: concrete `FsMount`.
- **Diff-chunk similarity for rename+edit** — deferred until real-world hits the edge case.

---

## 10. Evidence underlying this design

- **Scale bench** (`research/scale-bench-results-2026-04-21.md`): full-load-into-memory breaks at 2x. Per-query perf stays good at 10x. → lazy-hydration first.
- **Kimmi deep-dive** (`research/kimmi-crdt-sync-id-deep-dive.md`): architectural wins are stable-IDs + op-reconciliation + materialized indexes. Automerge has concrete gaps. → internal ULIDs fine, CRDT deferred.
- **Cloudi deep-dive** (`research/cloudi-architecture-deep-dive.md`): external-system-as-truth has critical ID instability. → Family A holds.
- **Dual-pro review** (2026-04-21 PM): caught frontmatter-id-injection as user-trust risk, block-hash collision math, uniform-adapter over-generalization, missing safe-writeback.
- **User pushbacks** (2026-04-21): (a) FS messiness → solve lower in stack; (b) federation eventually necessary; (c) identity robust against offline FS changes; (d) core unaware of FS; (e) **no metadata injection**; (f) **no ID scattering beyond what's inherently needed**; (g) Obsidian-native block anchors.

---

## 11. Current bead tracking

Active:

| Bead | Priority | Scope |
|---|---|---|
| `km-storage.lazy-hydration` | P0, ships first | §8.P1 |
| `km-storage.fs-mount` (renaming from `km-storage.fs-adapter`) | P1 | §6, §8.P2 |
| `km-storage.identity-recovery-cascade` | P1, narrowed | §3 path + content-hash only (no Rank 4-6) |
| `km-storage.writeback-cas` (new) | P1 | §7 |
| `km-storage.markdown-fidelity-corpus` | P1 | §8.P5 |
| `km-storage.federation` | P2, demoted | §8.P4 |
| `km-storage.session-state-split` | P2 | §5.3 |
| `km-storage.crdt-trigger` | P3 | reopen conditions |
| `km-all.shared-substrate-review` | P0 | cross-project extraction (due 2026-05-05) |

Closed as superseded: `km-storage.source-of-truth-contract`, `km-storage.stable-ids`, `km-storage.three-seam-boundary`, `km-storage.scale-architecture`, `km-storage.scale-benchmarks` (shipped), `km-storage.block-hash-refs` (folded → never needed per user rejection), `km-storage.frontmatter-id-migration` (folded → never needed per user rejection).
