---
mentions:
  - km
id: "@km/all/shared-substrate-review"
aliases:
  - km-all.shared-substrate-review
  - km-all-shared-substrate-review
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:31:51Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.shared-substrate-review
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-21T12:32:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Shared substrate across km + kimmi + cloudi — review the extraction opportunity @km/all #task #P0

blocks:: [[@km/all]]

**Review bead, not an implementation epic yet.** Evaluate whether there's a real shared-substrate opportunity across km + kimmi + cloudi — and if so, which primitives to extract, in what order, with what migration strategy. Decision expected: a scoped proposal to commit-or-reject. (Original 2026-05-05 deadline slipped during groom 2026-05-08; demoted to P1, no fixed deadline — reprioritize when an integration deadline (km storage stable-ids ship, kimmi extraction window, etc.) creates a forcing function.)

## Why this bead exists

Three independent deep-dives landed 2026-04-21:

- `hub/km/kimmi-crdt-sync-id-deep-dive.md` (kimmi CRDT/sync/ID analysis)
- `hub/km/cloudi-architecture-deep-dive.md` (Gmail-as-truth + composition)
- `hub/km/source-of-truth-rfc-v2.md` (km storage decision)

Convergent finding: **all three PIM projects have independently built the same 5-7 primitives** from scratch. Evidence for some is strong (context, identity, CLI+MCP schemas); evidence for others is weaker (storage, op log). The question: extract now, defer, or never?

Pre-RFC reasoning before a full shared-substrate RFC lands.

## Candidate primitives (ranked by leverage × evidence × stability)

### Tier 1 — strong convergence, bounded surface, high leverage

**1. `@beorn/identity` (NEW)** — Branded-string identity primitives + URI refs + content-hash fingerprints.

| Project     | Current approach                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| km (today)  | string paths; string refs in wiki-links; NodeId is path-derived                                           |
| km (target) | DocId + BlockId + RepoId branded types (km-storage.stable-ids)                                            |
| kimmi       | UUID item IDs + URI scheme (item:, automerge:, file:sha256:) per ADR-001                                  |
| cloudi      | Gmail messageId (🔴 Critical — mutates); uses email addresses / subject strings as workarounds per ADR-05 |

All three need the same primitives. Km's work on `stable-ids` should be extracted from day one instead of baked into @km/storage. Potential API:

```ts
type DocId   = string & { __brand: "DocId" }
type BlockId = string & { __brand: "BlockId" }
type RepoId  = string & { __brand: "RepoId" }
type Ref     = { scheme: string; body: string }  // URI-like

function mintDocId(): DocId                       // UUID
function blockIdFrom(doc: DocId, offset: number): BlockId
function parseRef(s: string): Ref | null          // "item:abc" / "automerge:xyz" / "file:sha256:..."
function serializeRef(r: Ref): string
function contentHash(bytes: Uint8Array): string   // SHA-256 hex
```

Integration sequence: @km/storage/stable-ids builds the branded types + minting logic **under** `@beorn/identity` rather than `@km/core`. kimmi migrates its UUID minter to the same lib (breaks nothing — same shape). cloudi adds DocId branded type as a thin wrapper around Gmail messageId to make ID-instability visible in the type system.

**Estimated LOC**: ~200 (types + URI parser + UUID + content-hash utility wrapper).
**Risk**: Very low — these are leaf primitives, no side effects.
**Leverage**: Very high — pro called stable IDs the "biggest missing cross-cutting issue."

### Tier 2 — strong convergence, medium surface

**2. `@beorn/context` (NEW)** — AsyncLocalStorage-based typed context providers.

| Project | Current approach                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------ |
| km      | silvery's RuntimeContext (React context for apps)                                                      |
| kimmi   | AsyncLocalStorage context hierarchy per docs/research/asynclocalstorage-context-hierarchy.md + ADR-009 |
| cloudi  | AppContext via AsyncLocalStorage (implicit coupling flagged — JobSystemLike forward-ref hack)          |

All three converge on AsyncLocalStorage as the provider primitive. Kimmi has the most rigorous design (full hierarchy with ADR). Extracting standardizes the pattern + provides typed provider registration + forbids the forward-ref hack.

Potential API:

```ts
interface ProviderContext<T> {
  provide<R>(value: T, fn: () => R): R
  get(): T | null
  require(): T  // throws if not provided
}
function createContext<T>(name: string): ProviderContext<T>
```

**Risk**: Medium — AsyncLocalStorage has subtle semantics around async boundaries. Need migration-test suite for cloudi's existing hack.
**Leverage**: Medium — cleaner implementation, but not unlocking anything impossible today.
**Estimated LOC**: ~150.

**3. `@beorn/zod-commander` (NEW)** — One Zod schema → CLI options + MCP tool schema + agent-addressable.

| Project | Current approach                                                                      |
| ------- | ------------------------------------------------------------------------------------- |
| km      | Commander.js with hand-rolled flags (see apps/@km/_orphan/cli)                        |
| kimmi   | Commander.js + Speckit slash commands (parallel definitions)                          |
| cloudi  | Killer pattern — generateMCPTools(program) ~200 LOC makes whole app agent-addressable |

Cloudi's `generateMCPTools` is the cleanest extraction candidate in the whole stack. Integration sequence: extract cloudi's reference implementation → rename imports → km + kimmi opt in → each gets automatic MCP tool exposure for free.

**Risk**: Low — Commander.js is stable; Zod is stable; the bridge is small and well-defined.
**Leverage**: High — makes every CLI command automatically agent-addressable without hand-writing MCP server code.
**Estimated LOC**: ~250 (bridge + Zod helpers + MCP server glue).

### Tier 3 — weak convergence, defer or reject

**4. `@beorn/statement-log`** — Op-based reconciliation + three-level diff (item/field/character).

Semantics diverge too much: km's `.km/changes.jsonl` is append-only op log; kimmi's three-level diff uses `microdiff` per-field; cloudi has no op log (Gmail state-machine). Extracting forces a compromise shape that fits nobody well. **Defer** until km + kimmi independently land op-log contracts that align naturally.

**5. `@beorn/kv`** — KV-style abstraction over SQLite/LMDB/Gmail-drafts.

Too thin. Kimmi's ADR-015 argues for KV abstraction; cloudi uses Gmail drafts as KV; km uses direct SQLite. Abstracting over these is premature — each project's KV needs differ enough that a generic layer would be either leaky or over-general. **Reject for now**.

**6. `@beorn/atomic-store`** — Transactional store-of-docs with subscribe semantics.

This is RFC v2's `RepoStore` interface. It's @km/_orphan/specific for now. Kimmi has `Repo` but with different shape. Cloudi has nothing comparable. Extracting before km's `three-seam-boundary` lands is premature. **Defer** to after km's prereqs ship; then re-evaluate.

### Already extracted (proof the pattern works)

- **loggily** (published `loggily`) — shared logging; used by km, kimmi, cloudi. Proves bearly-extraction pattern works.
- **alien-\*** family (`alien-projections`, `alien-resources`, `alien-trees` in bearly) — shared reactive primitives; km uses all three.

## Proposed layering (target state, not today)

```
Layer 4 (app-specific):    km-tui / kimmi-repo / cloudi-mail
Layer 3 (composition):     silvery (pipe/with*/createSlice)   [extracted]
Layer 2 (domain):          @beorn/atomic-store                [tier 3, defer]
                           @beorn/statement-log               [tier 3, defer]
Layer 1 (primitives):      @beorn/identity                    [tier 1, PROPOSE]
                           @beorn/context                     [tier 2, PROPOSE]
                           @beorn/zod-commander               [tier 2, PROPOSE]
                           loggily                            [extracted]
                           alien-*                            [extracted]
```

## Integration strategy (if review says yes)

### Phase 0 — decide which tier-1 candidate to pilot first

Pick ONE. Recommendation: `@beorn/identity` because it's:

- On the critical path for km (`km-storage.stable-ids` is P1)
- Lowest LOC + risk
- All three projects need it today
- Pure leaf — no dependencies

### Phase 1 — extract `@beorn/identity`

- Create `vendor/bearly/packages/identity/`
- Move `DocId`, `BlockId`, `RepoId` branded types + URI parser + UUID minter + content-hash utility
- Publish to npm as `@beorn/identity`
- km migration: `@km/core` re-exports from `@beorn/identity`
- kimmi migration: same
- cloudi migration: Gmail-messageId wrapper type as `@beorn/identity.ExternalId`

### Phase 2 — measure adoption pain

Before extracting anything else, run km + kimmi + cloudi for 2 weeks with just `@beorn/identity`. Watch for:

- Versioning friction (does `@beorn/identity@0.2` break anyone?)
- API churn (did we get the primitives right?)
- Actual vs promised leverage (did bugs reduce?)

If friction > leverage → stop; keep the rest project-specific.
If leverage > friction → extract `@beorn/context` next.

### Phase 3+ — tier 2 extractions if phase 2 succeeds

Only proceed if phase 2's metrics show the pattern pays off. Otherwise the shared-substrate theory is rejected.

## Anti-patterns to avoid

1. **Don't extract before 2+ projects independently have the shape.** One project's API is not a shared substrate — it's that project's API.
2. **Don't force-fit dissimilar semantics.** If km's op log and kimmi's diff events look superficially similar but have different conflict semantics, extracting creates a leaky abstraction that fits nobody.
3. **Don't block downstream work.** If `@beorn/identity` is 1 week late, km's `stable-ids` work can't stall — start in @km/_orphan/core, refactor to bearly-extracted later.
4. **Don't publish before two projects consume.** Publishing to npm binds the API. Extract to `vendor/bearly/packages/` first; publish when km + (kimmi or cloudi) are both consuming from workspace.
5. **Extraction ≠ abstraction.** Don't introduce new abstractions during extraction. Move the code as-is; refactor later.

## Decision criteria for commit-or-reject

Extract `@beorn/identity` if:

- [ ] All three projects have the DocId-shaped need (confirmed — see analysis above)
- [ ] API surface fits in ≤300 LOC (estimate: ~200)
- [ ] One-week extraction + two-project migration is feasible
- [ ] No project has to compromise semantics (only extraction, no re-design)

Reject if any ✗:

- Projects disagree on ID format (UUID vs short string vs content-hash)
- API would force either project into a worse shape
- Extraction would delay km's `km-storage.stable-ids` P1 > 2 weeks

## Review output expected

Produce `hub/km/shared-substrate-rfc.md` that either:
(a) proposes extraction of ONE tier-1 candidate with concrete package shape, migration plan, and rollback plan, OR
(b) rejects extraction entirely with reasoning (e.g., "the three projects actually have subtly different needs that look similar only at first glance").

## Reading prerequisites

Reviewer must have read:

- `hub/km/source-of-truth-rfc-v2.md` (km's storage decision)
- `hub/km/kimmi-crdt-sync-id-deep-dive.md`
- `hub/km/cloudi-architecture-deep-dive.md`
- `/tmp/llm-8b5b9e1c-review-both-proposals-pick-uy27.txt` (dual-pro review)
- kimmi ADR-001 + ADR-011 + ADR-015 (CRDT/functional/KV decisions)
- cloudi ADR-05 (ID instability) + cloudi `docs/architecture/commands.md` (Zod + Commander + MCP integration)

## Not in scope

- **Implementation** — this bead is a review only. Implementation beads come later if review says "extract."
- **Silvery extraction** — already extracted as `silvery`. Not this bead's concern.
- **loggily / alien-\*** — already extracted. Not this bead's concern.
- **Cross-project refactoring** — only the shared primitives are in scope.

## Acceptance

- [ ] Review doc `hub/km/shared-substrate-rfc.md` written
- [ ] Clear verdict: extract `@beorn/identity` Phase 1 OR reject with reasoning
- [ ] If extract: Phase-1 work bead filed (`km-bearly.identity-extraction`) with acceptance criteria
- [ ] If reject: memory entry captures the reasoning so the temptation doesn't resurface every 6 months

