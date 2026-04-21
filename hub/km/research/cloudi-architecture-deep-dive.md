# Cloudi Architecture Deep-Dive

**Date:** 2026-04-21
**Purpose:** Extract architectural patterns from `~/Code/pim/cloudi/` relevant to km's open decisions on (1) storage/source-of-truth and (2) composition/plugin architecture.
**Caveat from source:** cloudi's own CLAUDE.md says "Pre-PMF with no external users", "Merciless refactoring — Delete old code, don't deprecate" (`cloudi/CLAUDE.md:11-17`). Read every pattern below through that lens: these are early-stage bets, not scale-tested designs.

---

## Storage + "Gmail-as-truth"

### Q1. Is Gmail REALLY the only storage, or is there also SQLite/cache/JSON-on-disk?

**Yes — Gmail is the only persistent store.** There is no SQLite, no JSON-on-disk, no local DB. `cloudi/CLAUDE.md:7`:
> "All state lives in Gmail (drafts, tasks, labels) — no local database."

`docs/architecture/overview.md:398-407` lays it out explicitly:

| Data                | Storage      | Format           |
| ------------------- | ------------ | ---------------- |
| Key-value storage   | Gmail Drafts | Unstorage driver |
| Conversation memory | Gmail Drafts | JSON             |
| Tasks               | Gmail Tasks  | JSON in notes    |
| Emails              | Gmail API    | Native           |
| OAuth               | .env         | Refresh token    |

The **only** local state is (a) in-memory caches (`cache: Map<string, {draftId, messageId}>` in `cloudi-google/src/drivers/gmail-drafts.ts:332`) and (b) a label-ID lookup cache in `GmailJobStore` (`labelCache: Map<string, string>`, `cloudi-jobs/src/gmail-store.ts:73`). Both are rebuilt from Gmail on startup.

### Q2. What data types live in Gmail? How?

Three distinct storage channels, all in one Gmail account:

1. **Gmail Drafts** = KV store (general purpose). `subject` = key, body = JSON value. Implementation in `cloudi-google/src/drivers/gmail-drafts.ts:435-462`: a `setItem(key, value)` creates a raw RFC 822 message `Subject: ${key}\r\n\r\n${value}` base64url-encoded into a draft. `getItem` does `drafts.list({ q: "subject:"${key}"" })`. This is the Unstorage driver.

2. **Gmail Tasks** = task list. Cloudi-specific metadata (schedule, context, executionHistory, assignee, creator) is JSON-encoded into the task's `notes` field (`cloudi-tasks/src/providers/gmail.ts:63-82`). Native fields (title, due, status) map directly.

3. **Gmail Messages/Threads** = the actual email layer. Read-only for body; labels are mutable (used for deduplication/state).

The E02 job system uses all three:
- `js/job` / `js/queue/<name>` / `js/state/<state>` / `js/worker/<id>` are Gmail **labels** applied to drafts that represent jobs (`cloudi-jobs/src/gmail-store.ts:40-46`).
- Each job is a draft with the full job JSON in its body (`cloudi-jobs/src/gmail-store.ts:8-14`).
- Calendar events (not Gmail) are used for worker coordination via ETag CAS (`cloudi-jobs/src/index.ts:4-6`: "Google Calendar for worker coordination (ETag CAS for atomic operations)").

### Q3. How is state mutation expressed — what's the "op" analog?

There is no explicit op log. State mutation is CRUD against Gmail APIs:
- `drafts.create()` / `drafts.update({id, requestBody})` / `drafts.delete({id})`
- Labels: `messages.modify({addLabelIds, removeLabelIds})` for state transitions
- Job state machine (`cloudi-jobs/src/index.ts:58-66`): pure functions `transitionToRunning/Done/Failed/Retry/Ready/Waiting` that return the **next JobRecord** — then that record is serialized and overwrites the draft body. Not an op log; last-write-wins on the full record.

The one "op-like" mechanism is job lifecycle hooks (`CHANGELOG.md:18`, F324) with Immer for immutability — but these are functional state updates, not a replayable event log.

### Q4. What happens on external edit?

**Polled, not reconciled.** The Gmail driver polls every 10s (configurable 5–60s, 0 disables) and emits `"update" | "remove"` events via the Unstorage `watch()` interface (`cloudi-google/src/drivers/gmail-drafts.ts:342-367`):
```ts
// Uses messageId for change detection (changes on every edit)
for (const draft of currentDrafts) {
  const prev = cache.get(draft.subject)
  if (!prev || prev.messageId !== draft.messageId) {
    cache.set(draft.subject, { draftId: draft.id, messageId: draft.messageId })
    for (const watcher of watchers) watcher("update", draft.subject)
  }
}
```

Notable: the **draft id is stable across edits, but `messageId` changes on every mutation** — cloudi uses that property to detect modification without needing ETags or vector clocks. If the user edits a draft in the Gmail UI, the next poll fires `"update"` and consumers can re-read. There is **no merge** logic; cloudi never does concurrent edits to the same key (one `cloudi` instance per Gmail account).

### Q5. Identity primitive

It's a messy dual layer:
- **Internal job ID** = `queue/key` composite string (`getJobId`, `cloudi-jobs/src/index.ts:46-47`) — stable across Cloudi restarts because derived from `hashPayload` when no explicit key.
- **Gmail-native ID** = draft ID for KV, Gmail Tasks ID for tasks, messageId/threadId for mail.

Critically: `ADR05` (`specs/backlog/ADR05-pim-storage.md:276-288`) flags **ID Instability** as a 🔴 Critical cross-cutting blocker:
> "Resource IDs change on merge (contacts), update (drafts), thread grouping (messages). Breaks KV contract."

Workarounds cloudi lists but doesn't fully implement: content-addressable hashing, ephemeral keys, shadow IDs. For jobs specifically, cloudi uses `hashPayload` as a content-derived dedup key (`cloudi-jobs/src/gmail-store.ts:98-99`) — this is their identity-stability hack.

Tasks use email as a semantic ID layer: `assignee`/`creator` are normalized-lowercase email addresses (`cloudi-core/src/providers/task.ts:277-278`), enabling `agent.summarizer@cloudi.ai` vs `user@example.com` role distinction. That's independent of the Gmail Task ID.

### Q6. Rename/reorganize

Not addressed. Native Gmail edits that touch system labels (spam, promotions) are filtered out by safety filters (`cloudi-mail/README.md:120-127`). Tasks created directly in the Gmail UI without cloudi metadata get a `[Gmail]` prefix and placeholder emails (`cloudi-tasks/src/providers/gmail.ts:122-148`) — cloudi shows them read-only but doesn't try to migrate them. If a user renames a label cloudi depends on (`js/queue/mail:inbox` etc.), the job system breaks — not addressed.

### Q7. Cold start cost

Known pain point. `specs/backlog/ADR05-pim-storage.md:115`:
> "Cold start > 20s becomes unacceptable"

Cloudi works around this with Gmail Batch API (`cloudi-google/src/drivers/gmail-drafts.ts:131-165` — "Reduces 100 sequential requests (~20s) to 1-2 batch calls (~1-2s)"). But the scale ceiling is explicit (`ADR05:115`): "Storage-first works up to ~100 items (polling), ~500 items with Batch API." Beyond that they plan to migrate to History API push notifications or Tier 2 (MongoDB).

### Q8. Local cache?

Only the in-memory `cache: Map<string, {draftId, messageId}>` used for change detection. There is **no offline cache, no persistent local cache, no query cache**. Every `getItem`/`hasItem` hits Gmail. This is a deliberate simplification.

### Q9. Concurrent-edit scenarios

Three risks, two partially handled:

1. **Two cloudi instances**: The "split-brain" / "multiple leaders" problem is tracked in `KNOWN_ISSUES.md:74-81`. Calendar ETag CAS is used for worker coordination leases (`cloudi-jobs/src/index.ts:4-6`). `KNOWN_ISSUES.md:42-60` documents the "ghost container" incident where a stale Defang Playground container sent duplicate briefing emails alongside production.

2. **User + cloudi editing same draft**: Not handled. Cloudi's pollChanges detects the external mutation (messageId change) and fires `"update"` — but consumers have no merge logic. Last-write-wins against stale in-memory state.

3. **Two users** (via the `agent_user` / `client_user` distinction): Multiple `client_user`s share one `agent_user` Gmail account. Scoping is by email prefix in the key (`history:${email}:summary`, `mail:summary:*`). There's no per-user encryption or isolation — just filename discipline.

### Q10. Scale ceilings

Cloudi is honest about these. From `ADR05` (`specs/backlog/ADR05-pim-storage.md:296-303`):

| Content   | RAM (MostlyDB) | File-Backed | Bottleneck                             |
| --------- | -------------- | ----------- | -------------------------------------- |
| Drafts    | ~100           | ~500 (Batch) | 🔴 API: 200ms × N cold start          |
| Calendar  | ~10k           | 100k+       | 🟢 None: syncToken efficient           |
| Tasks     | ~10k           | 10k+        | 🟡 API: no true delta sync             |
| Contacts  | ~10k           | 100k+       | 🟢 None: syncToken efficient           |
| Messages  | ~1k            | 100k+       | 🟢 None: History API                   |

Production issues tracked in `KNOWN_ISSUES.md`:
- Rate limiting at 429s (Gmail API 250 quota units/sec, line 99-107)
- OAuth refresh token expiry at 6 months (line 84-97)
- "Rate limiting" and "quota exceeded" classed as known symptoms with remediation steps

### Q11–13. Why Gmail? What do you give up? Deliberate?

From `cloudi-storage/README.md:11-15`:
> "Zero infrastructure: No database setup, no server costs. Familiar: Uses your existing Gmail account. Reliable: Gmail's infrastructure handles availability and durability. Private: Data stays in your Gmail account."

And `docs/architecture/overview.md:433-441`:
> "Single-user system (no multi-tenancy needed). No database setup or migrations. User can manage data via Gmail UI. Gmail provides automatic backups and sync. Leverages existing Gmail infrastructure."

Crucially, the philosophy line (`docs/architecture/overview.md:56-57`) hedges:
> "No Local Database: State lives in external APIs (Gmail, Google Tasks, etc.) rather than a local database. This enables cloud-native deployment without managing persistence infrastructure. However, **this is a preference, not a hard constraint** — adopting a managed database (e.g., PostgreSQL) is acceptable if it unlocks significant value (e.g., adopting Letta for memory)."

**What they give up:**
- No full-text search across conversation history (must re-query Gmail)
- No offline
- No server-side query (must load-all-filter-client-side: `ADR05:103-112`)
- Cold start pain at scale
- ID instability forces content-hashing workarounds

**Deliberate:** Yes. It's a PMF-stage bet, explicitly framed as good enough for single-user, with a documented migration path to Tier 2 (MongoDB) or Tier 1.5 (SQLite/LevelDB). Not dogma.

---

## Composition architecture

### Q14. How do 11 packages + 3 apps compose?

**Simple imports with a strict layered DAG.** No DI container, no registry, no pipe-composition pattern. From `docs/architecture/monorepo.md:44-54`:
```
vendor/ (@beorn/*)           ← external libs only
    ↓
packages/ infra (@cloudi/*)  ← google, storage, llm, jobs
    ↓
packages/ feature (@cloudi/*) ← mail, tasks, contacts, agent, chat (no cross-deps)
    ↓
apps/                        ← can use everything
```

Rules:
- `@beorn/*` can only depend on external libs (must)
- Feature packages (mail/tasks/chat/contacts/agent) **must not import each other**
- Apps consume everything and compose at the top

F666 was the phased refactor that enforced this (`CHANGELOG.md` earlier entries mention "Phases 0-6 Complete" for resolving circular deps between `@cloudi/app ↔ @cloudi/jobs`).

### Q15. How are commands/events routed?

Two parallel mechanisms:

1. **CLI commands**: Commander.js + a custom `.input(zodSchema)` extension (`docs/architecture/commands.md:1-46`). One Zod schema defines BOTH the CLI option parser AND the MCP tool schema. `generateMCPTools(program)` converts every Commander command into an MCP tool (`docs/architecture/commands.md:59-72`). This is a clever cross-surface move: zero duplication between CLI and MCP.

2. **Jobs/events**: E02 job system using Gmail drafts as queue storage. Jobs have state (`ready/waiting/running/done/failed`), are claimed by workers via Calendar ETag CAS leases, and are retried with exponential backoff. Handlers are plain async functions registered per queue (`cloudi-jobs/src/create-gmail-jobs-system.ts:158-199`):

```ts
queues["mail:inbox"] = {
  run: async (payload, _job) => { ... },
  key: (payload) => payload.messageId,
  attempts: 1,
  from: provider.inbox()  // source
}
```

No pub/sub. No middleware. Just `{queue → handler fn}`.

### Q16. How does cloudi-cli discover + compose packages?

Monolith assembly. `apps/cloudi-cli/src/index.ts:56-84` imports every feature package's exported commands directly:
```ts
import { chatCmds } from "@cloudi/chat"
import { mailCmds, listEmails, ... } from "@cloudi/mail"
import { tasksCmds, listTasks, ... } from "@cloudi/tasks"
import { jobsCmds, listJobs, ... } from "@cloudi/jobs"
import { contactsCmds, ... } from "@cloudi/contacts"
```

Each feature package exports an `*Cmds` object (`mailCmds.read`, `tasksCmds.add`) and typed input/output schemas. The CLI just wires them into Commander's tree. There is no plugin loader, no service locator, no dependency resolver — it's 700 lines of explicit `program.command("...").action(asyncAction(...))` calls.

### Q17. Any state-machine pattern (TEA/Redux)?

Not in the UI sense. The only state machine is **job lifecycle** (`cloudi-jobs/src/index.ts:58-66`) — `transitionToRunning/Done/Failed/Retry/Ready/Waiting`, each a pure function from `(job, hint) → newJob`. This is closer to a Sidekiq/Bull job state machine than Elm.

Chat UI uses React + Ink + hooks (`cloudi-chat/src/use-chat.ts`, `use-shortcuts.ts`) — normal component state, no external state library visible in the src listing. No zustand, no redux.

### Q18. Async orchestration — cron, LLM streams, Gmail polls

Three layers, all different:

1. **Scheduled tasks** (cron-ish): RRULE-based (`cloudi-tasks/README.md:37-72`). A `createScheduler({pollIntervalMs: 60000})` polls Gmail Tasks for `schedule.nextRun <= now` every minute, computes the next run via `rrule` package, updates, hands to an `executor` (`cloudi-tasks/README.md:216-225`).

2. **LLM streaming**: `createAgent({...}).stream(message)` is an async iterator (`docs/architecture/overview.md:295-303`). Tool calls are dispatched within the stream loop. Prompt caching uses Anthropic's `cache_control: { type: "ephemeral" }` on static prompt blocks for cost (`cloudi-agent/src/index.ts:82-120`).

3. **Gmail polling/push**: Mail inbox is a polled source (`mailInbox`) via the generic `@beorn/jobs` source interface. There's a `gmailInbox` variant in `cloudi-jobs/src/gmail/inbox-source.ts` that wraps it. Worker loop: `runWorker(queueName, queue, store, {workerId, signal})` runs until abort (`create-gmail-jobs-system.ts:263-278`).

All three share the **AsyncDisposable / `await using`** cleanup pattern for timers/connections (`apps/cloudi-cli/src/index.ts:804-814`, `AsyncDisposableStack` in `app-context.ts:103`).

### Q19. Relationship between cloudi-core and feature packages

`@cloudi/core` exports **interfaces + types + AppContext** only. It's the foundation (`packages/cloudi-core/src/index.ts:14-167`):
- Provider interfaces: `MailProvider`, `TaskProvider`, `ContactsProvider`, `StorageProvider`
- `AppContext` (AsyncLocalStorage-based)
- `Config` (Zod schema)
- Logger (re-exported from `@beorn/logger`)
- Domain types: `Mail`, `ScheduledTask`, `Contact`

Feature packages **implement** those interfaces (e.g., `createGmailMailProvider(gmail)` implements `MailProvider`). The CLI app wires implementations into `AppContext.providers` and calls `runWithContext(ctx, () => handler())`. Tools then pull providers from `AppContext` at invocation time — **tools don't take provider args, they read from context** (`cloudi-agent/src/tools/index.ts:39-46`):
> "Tools automatically check AppContext for providers when invoked. If provider not available, tools return helpful error messages."

This is essentially an implicit service locator via AsyncLocalStorage. Clean for single-process, but loses compile-time dependency info — a handler has no signature telling you which providers it needs.

### Q20. LLM call abstraction

No multi-provider router. `createAgent()` is Anthropic-specific (`cloudi-agent/src/index.ts:1`: `import Anthropic from "@anthropic-ai/sdk"`). Tools follow MCP's input_schema / handler interface. The `standardTools` array (`cloudi-agent/src/tools/index.ts:47-53`) is a hardcoded list. Tool deduplication by name happens at agent construction (lines 63-66).

Multi-provider LLM routing is **explicitly deferred** (`docs/architecture/overview.md:597-602`: "Multi-LLM routing logic" is post-PMF, tracked in F400 T415).

---

## Patterns worth adopting

### Q21. Cleanest pattern

**The one-schema-for-CLI-AND-MCP trick** (`docs/architecture/commands.md`). A Zod schema defines both CLI options and MCP tool input_schema. One source of truth, zero duplication, and the MCP server is ~10 lines wrapping `generateMCPTools(program)`. For km, this is the model for "make every CLI command available to the agent" without hand-authoring tool schemas.

Runner-up: **`await using context = await getOrInitializeAppContext(...)`** (`apps/cloudi-cli/src/index.ts:807`). AsyncDisposable cleanup cascaded through `AsyncDisposableStack` in context init. Timers, polling loops, and storage drivers all register their own disposal — CLI shutdown is one line.

### Q22. Dirtiest pattern / accumulates debt

**AppContext-as-service-locator via AsyncLocalStorage.** Handlers and tools read providers from global context instead of receiving them as args. Pros: clean signatures, CLI options propagate automatically. Cons: (a) you can't statically know which providers a function needs; (b) testing requires `runWithContext` wrappers everywhere; (c) refactoring a provider interface hits dozens of hidden consumers; (d) the `JobSystemLike` forward-reference hack (`cloudi-core/src/context.ts:19-30`) exists specifically because this pattern creates circular-dep pressure.

Secondary: **ID instability workarounds ad-hoc'd per-subsystem.** Jobs use `hashPayload` (`cloudi-jobs/src/gmail-store.ts:99`), tasks use email+metadata, drafts use the subject field. No unified identity strategy — ADR05 calls this out as 🔴 Critical but there's no project to fix it.

### Q23. Patterns tried + rejected

From `archive/` and `specs/rescinded/`:
- **F378 audit logging system** built during code review, then REMOVED (`docs/architecture/overview.md:617`: "it was over-engineered infrastructure that cluttered the inbox and duplicated Gmail's native storage"). This is a direct precedent: cloudi tried to build a structured audit log as Gmail drafts, realized it was reinventing Gmail's native History.
- **Mastra integration tested and rescinded** (`specs/rescinded/T1406-mastra-spike-real-api-mock.md`, `BACKLOG.md:72`: `~~T1406-mastra-spike-real-api-mock~~`). A whole `apps/cloudi-mastra/` directory exists as a minimal shell for the spike.
- **CJS/ESM dual-mode tests** attempted and rescinded (`specs/rescinded/T7014-migrate-tests-dual-mode.md`).
- **Multiple versions archived cleanly** (`archive/v0.1.0` through `v0.5.5`) — shows the "merciless refactoring" discipline in action.

### Q24. BACKLOG + KNOWN_ISSUES architectural debt signals

From `BACKLOG.md`:
- The `ADR07-storage-layer-architecture` is still in backlog — **the unified storage story isn't resolved**.
- Memory system (E01) is a major active epic — the Gmail-drafts approach isn't sufficient for long-term conversational memory; they're researching Hindsight, Letta, Mem0 (`docs/research/memory-systems.md`).

From `KNOWN_ISSUES.md`:
- "Ghost container sending duplicate emails" (line 42): stale Defang Playground container fires briefings alongside production. **Distributed single-instance assumption leaks.**
- "Multiple leaders (split-brain)" (line 74): documented as a possible state.
- "Spurious storage keys `unknown@*`" (line 154): happens when client_user isn't identified. Evidence that identity scoping by key-prefix is fragile.

---

## Cross-project synthesis

### Q25. Identity model comparison

- **km (today)**: Filesystem paths. Unstable across rename. Bead `km-all.tea-machines` and others assume paths are identity.
- **kimmi**: UUIDs + URIs. Stable, designed for CRDT merge.
- **cloudi**: Gmail-native IDs (draft ID, thread ID, message ID, task ID) which **ADR05 itself flags as 🔴 unstable** for drafts and contacts. Works around with `hashPayload` for jobs and email addresses for task roles.

**Insight:** Cloudi validates that "external system IDs" are NOT a free lunch. Google's own APIs have ID-instability enough to warrant a critical cross-cutting section in ADR05. Any "external system IS truth" decision for km inherits this class of problem.

### Q26. Truth model comparison

- **km**: FS truth, UI transient, operations via markdown rewrite.
- **kimmi**: Automerge-repo truth, CRDT ops are first-class, sync via repo federation.
- **cloudi**: Gmail truth, UI transient, no op log — every mutation is a full-record overwrite against Gmail. Relies on Gmail's own atomic updates for consistency.

**Cloudi gets right:** Zero infrastructure, works immediately for single-user, matches the "one drafts folder per user" mental model.
**Cloudi gets wrong:** Scale ceiling at ~500 items for drafts (admitted in ADR05). No offline. No full-text search. ID stability has to be hacked per-subsystem. The polling model (10s default) means external-edit latency is visible.

**Key observation for km:** Cloudi's Gmail-as-truth is viable specifically because its workload is conversational/job-queue, not document-heavy. Hundreds of drafts, not thousands of notes. km's vault would hit the 500-item ceiling immediately.

### Q27. Shared substrate opportunity

A unifying pattern visible across all three:

1. **Per-subsystem factory functions returning interface-typed objects**: `createGmailMailProvider()`, `createGmailTasksProvider()`, `createGmailDraftsStorageDriver()`. km has `createBoardState()`, `createViewModel()`. kimmi has similar.

2. **Explicit DI via context object**: km passes a `ctx`, cloudi uses `AppContext` + AsyncLocalStorage. Both contain the same shape: `{logger, providers, config, userIdentity}`.

3. **Storage abstracted behind a driver interface**: cloudi uses Unstorage's `Driver` interface (`GmailDraftsDriver extends Driver`). km-storage has its own. Unifying these under one abstract `KVStore<T>` + `SubStore<T>` interface would let cloudi's Gmail driver, km's SQLite, and a hypothetical kimmi Automerge adapter all plug in.

4. **Event-sourced state** is the missing shared layer. km has a statements log (per `docs/lessons/reproduce-first.md` / the JSONL approach in `docs/research/fs-sync.md:407-432`). Kimmi has Automerge ops. Cloudi has job state transitions but no log. An operation-log primitive shared across all three — where each project provides its own materializer — would unify them without forcing them onto the same store.

The shared substrate looks like: **(statement-log) + (context with providers) + (factory-composed features) + (Zod/CLI schema as cross-surface contract)**. Every one of those already exists in partial form across the three repos.

---

## Synthesis for km (5 bullets)

1. **Adopt the one-schema-for-CLI-AND-MCP pattern** (`cloudi/apps/cloudi-cli/src/zod-commander.ts` + `generateMCPTools`). km already has commands; wrapping them with Zod schemas that generate BOTH CLI and MCP tool definitions is ~200 LOC and makes the whole app agent-addressable for free. Strongest bang-for-buck transfer.

2. **Avoid AsyncLocalStorage-as-service-locator.** Cloudi's `AppContext` is clean on the surface but creates the `JobSystemLike` forward-ref hack, hidden test dependencies, and refactor-blind coupling. km's explicit DI via factory args is the better pattern — stay the course. If a global context is needed, type it as an explicit handler parameter, not an `AsyncLocalStorage.getStore()` call.

3. **Gmail-as-truth does NOT vote for Family C in km.** Cloudi validates that "external system IS truth" works for small-scale, single-user, job-queue-shaped workloads, but `specs/backlog/ADR05-pim-storage.md:276-288` flags ID instability as 🔴 Critical. Draft storage tops out at ~500 items with Batch API. km's vault would saturate that on day one. Cloudi's experience reinforces rather than softens the pro-review finding: stable IDs + per-repo federation + op-based reconciliation matter regardless of where the atoms live. If anything, cloudi is a datapoint that **"external truth" doesn't dissolve the identity/sync problem, it just pushes it into messier workarounds.**

4. **Cloudi's composition is simple imports + strict layered DAG — no plugin system, no `pipe()`, no `definePlugin`.** 11 packages + 3 apps compose by the CLI app importing `{featureCmds, featureInputs, featureOutputs}` from each package and wiring them into Commander. This supports **"just use imports"** as the default km composition model — `definePlugin` earns its place only when there's a genuine extension point for third parties. Cloudi has none and hasn't needed one. Feature packages forbidden from cross-importing (`docs/architecture/monorepo.md:60`) is a constraint km should adopt: it keeps the dependency graph flat and acyclic.

5. **Shared substrate opportunity, visible now**: all three projects have (a) factory functions returning interface-typed objects, (b) a context object with providers, (c) a storage/KV abstraction, and (d) some notion of op-log (km-JSONL, kimmi-Automerge, cloudi-job-states). The unifying library is `(statement-log) + (context-with-providers) + (factory-composed-features) + (Zod-schema-as-cross-surface-contract)`. km is the richest site to host this because it has the strongest content model (KNode + markdown materialization). Kimmi provides the sync primitives. Cloudi provides the Gmail-as-external-bridge. Extracting `@beorn/context`, `@beorn/statement-log`, and `@beorn/zod-commander` into bearly/ would let all three converge without a big-bang unification.
