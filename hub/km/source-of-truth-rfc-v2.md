# Source-of-Truth Contract — RFC v2

**Status**: Supersedes `source-of-truth-rfc.md` (v1, 2026-04-21 AM). Scope unchanged: km's authoritative store across filesystem, SQLite cache, and `changes.jsonl` journal.

**Reason for revision**: v1 picked Family A on "consistency with current intent" without seriously weighing (a) the user's "FS is inherently messy" pushback, (b) kimmi's concrete Family-C experience, (c) cloudi's concrete external-system-as-truth experience, or (d) the convergent dual-pro review. Those four inputs collectively reshape the question. v1's Family A pick survives, but the reasoning changes, the scope shrinks, and **three prerequisite decisions move to the top**.

---

## TL;DR

The A-vs-C-vs-federated debate was asking the wrong question. The **three decisions that matter** are:

1. **Stable identity (`DocId`, `BlockId`, `RepoId`)** — not paths. Both pro models flagged this as the single highest-leverage architectural move. Kimmi already does this and confirms the type-system pandemic risk (every module's state either has `string` paths or branded IDs — switching later is a rewrite). **Commit and execute.**
2. **Per-repo federation** — orthogonal to A-vs-C; both pro models recommend doing it now regardless. `.km/state.db` per mounted repo; workspace layer composes them. **Commit and execute.**
3. **Three-seam storage boundary** — `RepoStore` (atomic structured-doc API), `MarkdownAdapter` (FS/watch/parse/materialize), `WorkspaceFederation` (mount/query composition). v1 proposed a single `AtomicStore` interface; pro correctly called it leaky. **Commit the three-seam split.**

With those three in place, **the A-vs-C decision becomes deferrable**. Flipping A → C under a three-seam boundary is a `RepoStore` implementation swap, not a rewrite. v1's "preserve pivot optionality" thesis holds, but only with the three seams — not the single seam.

**Today's pick**: stay with Family A semantics for canonical persisted content. Build the three seams + stable IDs + federation now. Defer the A-vs-C-federated call to a future bead triggered by concrete multi-device / multi-scope requirements.

---

## 1. What changed between v1 and v2

### Four new inputs

| Input | Source | Most important finding |
|---|---|---|
| Dual-pro review | `/tmp/llm-8b5b9e1c-review-both-proposals-pick-uy27.txt` | Stable IDs are the hinge. Three seams, not one. Federation now. Don't front-run CRDT. |
| Kimmi deep-dive | `hub/km/kimmi-crdt-sync-id-deep-dive.md` | Kimmi's wins come from stable IDs + op-based reconciliation + materialized indexes, NOT from Automerge specifically. Automerge has no diff/patch API (kimmi uses `microdiff`), sync doesn't work for CardDAV, Text type churned v1→v3, 60k-edit ceiling, only tested at ~3.7k items. Cross-repo federation explicitly deferred. |
| Cloudi deep-dive | `hub/km/cloudi-architecture-deep-dive.md` | Gmail-as-truth is real but admitted 🔴 Critical for ID instability in cloudi's own ADR05. ~500-item scale ceiling. External-system-as-truth doesn't dissolve the ID/sync problem — pushes it into per-subsystem workarounds. F378 audit-log-in-Gmail was built and deleted for reinventing Gmail History — exact cautionary parallel for any "store everything as files" instinct in km. |
| User pushback | this session | "FS is inherently messy and non-atomic; solve the FS-to-DB interface lower down." Federation is eventually necessary. Kimmi is a prototype, not proof. |

### What v1 got wrong

1. **Single-seam `AtomicStore`** — v1 proposed `appendOps`, `readDoc`, `subscribe`, `import(mdTree)`, `export() → mdTree` as one interface. That conflates three concerns (content store + markdown projection + workspace topology) and ends up leaky. If the first implementation has `readDoc(path: string)`, every downstream module accumulates path strings in its state tree and the abstraction is a migration trap.
2. **Kimmi cited as precedent** — v1 treated kimmi's Family C as evidence Family C works. Kimmi is a prototype at ~3.7k items and explicitly single-repo; it's an architectural sketch, not proof.
3. **"11k changes.jsonl events shows no scale ceiling"** — weak argument per pro. Dev-history events ≠ production workload. Scale-bench data at 20k files (102s cold-load) is the real signal.
4. **"CRDT has weak leverage under A"** — correct conclusion but via weak reasoning. The correct reason: CRDT solves concurrency between replicas, not the FS-atomicity or external-editor-import problem. Both remain hard under any family.
5. **Missed stable-IDs entirely.** v1 discussed `DocId`/`BlockId`/`RepoId` zero times. Both pro models independently land on it as the biggest missed architectural move.

### What v1 got right

1. **Family A pick survives** for canonical persisted content. External-edit safety, plain-text portability, Obsidian interop, and rebuild-from-FS are real advantages at km's current product stage.
2. **Plain-text portability as hard guarantee** — correctly identified as the axiom that tips against C.
3. **CRDT deferred** — correct call. Kimmi's own experience + cloudi's Gmail-scale cracks + pro's "don't front-run CRDT" all reinforce this.
4. **Kimmi's Automerge is not magic** — v1 hinted at this; v2 confirms it. The architectural wins (stable IDs, op-based reconciliation, materialized indexes) are substrate-agnostic.

---

## 2. The decision

### 2.1 Canonical state (unchanged from v1): **Family A**

`.md` files remain authoritative for user content. SQLite and `changes.jsonl` are derived and rebuildable. Session-local deviations (selection, fold, nav history, workspace layout, undo) are *session-local derivations* with a bounded loss budget — this is a first-class concern, not scope debt.

**Axiom that tips the scale**: plain-text-portability-as-hard-guarantee. If this axiom ever becomes negotiable (e.g., km adopts features that don't round-trip cleanly into `.md`, or multi-device sync becomes shipping-critical), reopen the decision via the reopen trigger below.

### 2.2 Architecture prerequisites (promoted to P0 equivalents)

These three are now the real blockers for `km-storage.scale-architecture`. Until they land, the A-vs-C-federated decision is unforceable.

#### P1: Stable identity primitives

Branded types: `DocId`, `BlockId`, `RepoId` (all `string & { __brand }`).
- New data: every `.md` gets a `DocId` in YAML frontmatter (`id: dnhJf7k4`) on first write.
- Existing data: backfill migration that writes `id:` into every indexed file. km can drive this in a background job; Obsidian's `app://` links continue to work on path, but km's own wiki-links resolve by `DocId`.
- Block-level IDs only when needed (heading refs, block refs) — not speculative.

**Why not defer this**: every module's state either stores `string` paths OR `DocId`. Switching later is a rewrite. This is the type-system pandemic — solve it before more modules hardcode paths. Pro flagged this as "the biggest missing cross-cutting issue."

Bead: `km-storage.stable-ids` (to file).

#### P1: Three-seam boundary

Replace v1's single `AtomicStore` with three disjoint interfaces:

```ts
// Atomic structured-doc API — no FS knowledge.
interface RepoStore {
  transact(ops: Op[]): Promise<Commit>
  readDoc(id: DocId): Doc | null
  readBlock(id: BlockId): Block | null
  query(q: Query): Result[]
  subscribe(f: (commit: Commit) => void): Unsubscribe
}

// FS/watch/parse/materialize — the messy side.
interface MarkdownAdapter {
  scanExternal(): AsyncIterable<FileChange>
  importFile(path: string): Op[]  // parse .md → ops
  materializeDoc(id: DocId): Promise<void>  // write .md from RepoStore
  suppressSelfWrite(path: string): void
}

// Mount/unmount/query composition across repos.
interface WorkspaceFederation {
  mount(path: string): Promise<RepoId>
  unmount(id: RepoId): void
  repos(): Map<RepoId, RepoStore>
  federatedQuery(q: Query): Result[]
}
```

Under Family A: `RepoStore` is a thin SQLite-backed transactional mirror hydrated on demand from `MarkdownAdapter`. Under a future Family C: `RepoStore` becomes the canonical store and `MarkdownAdapter` becomes an export-only projection.

**This is the pivot mechanism.** Swapping A → C means implementing a new `RepoStore` and flipping which side of the seam "owns" writes. It's not a rewrite of workspace or markdown handling.

Bead: `km-storage.three-seam-boundary` (to file, replaces speculative `km-storage.atomic-boundary`).

#### P1: Per-repo federation

Today: one monolithic `.km/state.db` indexing everything under the workspace root.

Target: one `.km/state.db` per mounted repo. Workspace composes via `WorkspaceFederation`. Cross-repo links use `RepoId`-scoped `DocId`.

Benefits (both pro models):
- cheap mount/unmount
- smaller startup scope per repo
- repo-local sync/backup/versioning
- failure isolation (corrupt ~gdrive doesn't break ~vault)
- forward-compat with any Family C flip (per-repo CRDT docs become natural)

**When**: now, not "when we need it." Both pros: "do not front-run CRDT" but also "do federate now." These are separable.

Bead: `km-storage.federation` (to file, replaces speculative `km-storage.atomic-boundary` federation angle).

### 2.3 Deviations and loss-budgets (refined from v1)

| Subsystem | Today | Under the new contract |
|---|---|---|
| Selection / cursor | Memory only | Stays memory; loss acceptable |
| Fold state | Memory only | Stays memory; loss acceptable |
| Workspace layout | Memory only | Moves to **session-local DB** (separate from content DBs) — pro + cloudi both recommend splitting session state from content state |
| Undo / redo | Memory only, lost on restart | Moves to session-local DB (bounded history); durable across sessions |
| Sibling order | Implicit from `.md` order | Explicit `position` field in `RepoStore`; `.md` order is the canonical projection |
| Collapsed-parse extractions | Cached in `state.db` | Stays derived; rebuildable from `.md` via `MarkdownAdapter.importFile` |

Session-local state moves to its own store (`~/.km/session.db` or per-workspace). Clear separation: **content per repo / session per workspace / ephemeral in memory**.

### 2.4 Deferred: A-vs-C-federated flip

**Trigger conditions** (all must be true to reopen):

1. Stable IDs + three-seam boundary + federation are in place (prerequisites above done)
2. One of:
   - Multi-device concurrent editing becomes shipping-required (not nice-to-have)
   - Offline-first merge semantics are needed (not just sync)
   - Markdown fidelity test corpus passes projection round-trip
   - Plain-text-portability axiom is explicitly reopened
3. Compaction / history / migration plan drafted for the chosen C-family candidate

Until then, stay with Family A + the three new prerequisites.

---

## 3. Explicit non-decisions

These were weighed and are NOT being decided in v2:

- **Which CRDT if we flip to C** — Automerge, Yjs, loro, custom. Kimmi's own experience says Automerge has serious gaps (no diff API, sync issues, Text churn). No commitment.
- **Markdown fidelity test corpus format** — both pros flagged as mandatory. Separate bead (`km-storage.markdown-fidelity-corpus`) — must exist before any C-flip.
- **Block-level identity propagation** — Obsidian `^blockid` vs YAML vs HTML comment. Defer until block refs become load-bearing.
- **Sync topology under C** — peer-to-peer vs hub-and-spoke. Defer until sync is a shipping requirement.

---

## 4. Cross-cutting concerns (addressing gaps both pros flagged)

### 4.1 Path is not identity

v1 missed this entirely. **Paths are a location property, not an identity.** Rename/move must not break identity. This is the stable-IDs decision above; calling it out separately because it's load-bearing for `km-storage.federation` (cross-repo refs), `km-tui.omnibox` (jump targets stable), undo/redo (operations on doc identity, not path).

### 4.2 Watchers are hints, not truth

File watcher events are unreliable (debounce races, swap files, partial writes). Under any family:
- watcher event → hint that a file *may* have changed
- hash/stat reconcile → determines if it *actually* changed
- periodic / full reconcile on focus regain

This contains FS-mess without forcing C. Lives under `MarkdownAdapter.scanExternal`.

### 4.3 Markdown fidelity test corpus (now mandatory)

Regardless of family, km needs a fidelity corpus for import/export round-trip:
- weird list indentation, tabs vs spaces
- frontmatter ordering preservation
- HTML comments (Obsidian-style)
- code fences with exotic language IDs
- Obsidian `^blockid`, wiki-links with display text, embeds
- broken/incomplete markdown
- YAML arrays, nested frontmatter
- large notes (>100KB)
- heading moves with ref preservation

Bead: `km-storage.markdown-fidelity-corpus` (to file, P1).

### 4.4 Session state ≠ content state ≠ ephemeral state

Three durability tiers with three storage targets:

| Tier | Example | Store |
|---|---|---|
| Content (per repo) | Nodes, bodies, links | `RepoStore` + `MarkdownAdapter` |
| Session (per workspace) | Workspace layout, undo history, recently-opened | `~/.km/session.db` |
| Ephemeral (memory) | Cursor position, hover, transient focus | In-memory only |

v1 lumped session state with content state as "scope debt under A." v2 makes it a first-class separation.

### 4.5 Internal modules ≠ external plugins

If km ever gets third-party extensions, the extension model is **capability-based**:
- contribute command
- contribute keybinding
- contribute panel
- contribute query provider

NOT "arbitrary state with effects." Internal composition (`with*()` + createSlice) is separate from any future extension API.

---

## 5. Rejected alternatives (honest evaluation)

### 5.1 Push to C-federated now (K2.6's preference)

**Rejected**. K2.6's argument has teeth: "scale-bench already failed at 2x; stable IDs force a state-shape migration anyway; go boring-DB + per-repo stores, not Automerge." But:

1. Kimmi's own experience shows "boring-DB + stable IDs" already gets most of the wins — you don't need C-family canonical-log semantics to get them.
2. Cloudi's Gmail-as-truth experience shows external-system-as-truth doesn't dissolve the ID/sync problem; it pushes it elsewhere messily.
3. The migration cost (every module's storage contract flips) is non-trivial and front-runs the C-flip benefits.
4. Flipping later via the three-seam boundary is cheaper than flipping later via AtomicStore-as-v1-proposed it.

**Accept K2.6's sub-argument on stable IDs — reject the broader flip.**

### 5.2 Single `AtomicStore` interface (v1's proposal)

**Rejected**. Leaky abstraction per pro. Conflates content + projection + topology. Replaced with three-seam boundary.

### 5.3 CRDT (Automerge specifically) as substrate

**Rejected for now**. Kimmi's own experience: no diff API, sync issues for CardDAV, Text type churned v1→v3, 60k-edit ceiling, scale tested only at ~3.7k items. Cloudi's F378 cautionary tale: building audit-log-in-Gmail and discovering you're reinventing Gmail History is exactly the kind of "build your own CRDT substrate" mistake to avoid. If C-flip happens, the CRDT choice is a separate later decision.

### 5.4 Keep the monolithic `.km/state.db` (status quo)

**Rejected**. Federation benefits are independent of A-vs-C. Both pros recommend federating now. Scale-bench failure at 2x is a federation opportunity, not just a lazy-hydration opportunity.

### 5.5 Front-run CRDT for "sync/collab/version-control for free"

**Rejected**. Kimmi admits multiple broken pieces (Text churn, CardDAV sync gaps). Cloudi's Gmail-as-truth has ID-instability admitted Critical. "For free" is overstated. Pick up the architectural levers (stable IDs, federation, three-seam boundary) that are proven independent; revisit CRDT when there's a specific shipping need.

---

## 6. Beads to file / update

| Bead | Status | Action |
|---|---|---|
| `km-storage.source-of-truth-contract` | closed as of v1 | Reopen and re-close with v2 reason: Family A + three prerequisites; defer A-vs-C until prerequisites land |
| `km-storage.stable-ids` | new | P1. Introduce DocId/BlockId/RepoId branded types; backfill migration |
| `km-storage.three-seam-boundary` | new | P1. RepoStore + MarkdownAdapter + WorkspaceFederation interfaces |
| `km-storage.federation` | new | P1. Per-repo `.km/state.db`; workspace mount layer |
| `km-storage.session-state-split` | new | P2. Move undo + workspace layout to `~/.km/session.db` |
| `km-storage.markdown-fidelity-corpus` | new | P1. Test corpus for import/export round-trip |
| `km-storage.scale-architecture` | open epic | Update: kill-switch stays, prerequisites moved to stable-ids + three-seam + federation. A-vs-C deferred. |
| `km-storage.crdt-trigger` | open | Update: trigger conditions refined to match v2 §2.4 |
| `km-storage.lazy-hydration` | open P0 | Update: now depends on `km-storage.three-seam-boundary` landing first so HydrationPort fits inside RepoStore, not parallel to it |

---

## 7. Signals to watch (reopen triggers)

Reopen this RFC when:

1. Stable IDs + three-seam boundary + federation all land — re-evaluate whether A-vs-C deserves a fresh decision
2. Multi-device sync becomes a shipping requirement (not nice-to-have)
3. Scale-bench at 5x federated topology still fails — indicates per-repo is insufficient, forcing load-paging or C-flip
4. Markdown fidelity corpus has irrecoverable round-trip losses — indicates `.md` can't be truth
5. Any new data type is added that can't cleanly round-trip to `.md` — Family A axiom starts leaking

---

## 8. Acknowledgments

- **Bjørn**: for pushing back on v1's timidity re: FS-messiness and federation. The "solve FS-to-DB interface somewhere lower down" framing unlocked the three-seam split.
- **GPT-5.4 Pro + Kimi K2.6**: for independently arriving at stable-IDs as the highest-leverage missed decision.
- **Kimmi's author (Bjørn, 2024)**: for shipping a real-ish Family C that exposed the "Automerge is not magic" reality early.
- **Cloudi's author (Bjørn)**: for the F378 audit-log cautionary tale — a saved us-a-week moment.
