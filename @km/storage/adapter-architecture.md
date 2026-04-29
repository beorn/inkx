---
id: "@km/storage/adapter-architecture"
aliases:
  - km-storage.adapter-architecture
  - km-storage-adapter-architecture
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:24:47Z
closed_at: 2026-04-22T05:30:16Z
close_reason: Superseded by hub/km/storage-architecture.md v3. The 'adapter'
  framing was dropped in v3 after pro review round-1 warned against premature
  Adapter interface; replaced with concrete FsMount class (§6). Children
  reparented directly under km-storage scope epic.
---

# [x] Adapter architecture — core km unaware of FS/sync/connector specifics @km/storage #epic #P1

blocks:: [[@km/all/plateau]]

**Supersedes** `km-storage.three-seam-boundary`. Reframes the storage layering around an **Adapter contract** borrowed from kimmi (RemoteRegistry + Connectors) and cloudi (unstorage drivers), rather than three bespoke interfaces.

## Core principle

**Core km is unaware of filesystem / sync / external-protocol specifics.**

Identity cascade, inode tracking, frontmatter write-back, markdown parsing, `^<hash>` block-ref encoding, CardDAV sync, Automerge peer protocol — all features of ADAPTERS, not of `@km/core` or `@km/storage`.

## Adapter contract

```ts
interface Adapter {
  id: AdapterId
  kind: "fs" | "sync" | "connector" | "import"
  ingest(): AsyncIterable<Op[]>          // external → core
  egress(ops: Op[]): Promise<void>        // core → external
  reconcile(): Promise<ReconcileReport>   // detect + resolve divergence
  watch(): AsyncIterable<Op[]>            // continuous change stream (empty for one-shot)
  start(): Promise<void>
  stop(): Promise<void>
}
```

## Adapter catalog

| Adapter | Kind | Mediates | Status |
|---|---|---|---|
| FsAdapter | fs | Filesystem ↔ core | P1 — sub-bead `km-storage.fs-mount` |
| SyncAdapter | sync | Peer-to-peer ↔ core | Future |
| CardDavAdapter | connector | CardDAV server ↔ core | Future |
| CalDavAdapter | connector | CalDAV server ↔ core | Future |
| NotionImportAdapter | import | Notion export → core | Future |

## Package layering

```
@km/fs-adapter (+ @km/sync-adapter, @km/carddav-adapter, ...)
   │ emits Op[]
   ↓
@km/storage — RepoStore (atomic doc store) + AdapterRegistry
   │ defines ops
   ↓
@km/core — NodeId, KNode, Op types, pure domain (NO FS IMPORTS)
```

## Acceptance (epic-level)

- [ ] Adapter contract defined in @km/storage
- [ ] AdapterRegistry implemented in @km/storage
- [ ] FsAdapter shipped as @km/fs-adapter package (sub-bead)
- [ ] All FS imports removed from @km/core and @km/storage (build-error-enforced)
- [ ] Workspace config declares adapter instances (toml or JSON)
- [ ] Existing tests migrated to use mock Adapter implementations

## Precedents

- **Kimmi**: `docs/design/kimmi-sync.md:57-95` — RemoteRegistry + Connectors + three-phase sync algorithm. Each Connector owns Cache + Lock; core Repo exposes `getOps(clock) / applyOp(op)`.
- **Cloudi**: `docs/architecture/overview.md:403-418` — unstorage + custom drivers. `gmailDriver({ mailProvider })` pattern.

## RFC reference

See `hub/km/source-of-truth-rfc-v2-addendum-identity.md` §7 for full architectural rationale.

## Sub-beads

- `km-storage.fs-mount` (P1) — the FS adapter implementation
- `km-storage.identity-recovery-cascade` (P1) — sub of fs-adapter
- `km-storage.block-hash-refs` (P1) — sub of fs-adapter
- `km-storage.frontmatter-id-migration` (P1) — sub of fs-adapter

## Blocks (downstream)

- `km-storage.lazy-hydration` — needs Adapter contract so RepoStore lives in @km/storage, not adapter
- `km-storage.federation` — redefined as AdapterRegistry mounting
- `km-storage.scale-architecture` — scale work targets adapter-specific tuning