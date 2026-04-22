# Op Vocabulary Audit (2026-04-22)

Question answered: does km's existing op/apply stream give us Phase B ("persist the `apply()` stream as a semantic op log alongside FS") for free, or does it require op-schema redesign first?

Bead: `km-storage.op-vocabulary-audit` (P0).
Upstream context: `hub/km/storage-architecture.md` §9 Phase B; `hub/km/storage-arch-pro-review-round-3-2026-04-22.md` and round-4 review flagged that the Phase B cost estimate collapses if ops aren't already repo-stable + serializable + content-scoped.

---

## Executive summary

Phase B is **almost** free, but not quite. km has a clean, serializable `ChangeType` vocabulary (`node_created` / `node_updated` / `node_moved` / `node_deleted` plus three task ops) that flows through a single `emitter.apply()` chokepoint (`packages/km-storage/src/emitter.ts:175`) and writes a JSONL journal at `.km/changes.jsonl` today. The UI-side op union `KmOp` is strictly separated from the persistence-layer `Change` — command ops never appear in `changes.jsonl`. This gives us a real foundation.

However, **four classes of persistence-state mutation bypass the `apply()` stream** and would need to either (a) be routed through the emitter or (b) be explicitly marked as out-of-scope with replay contracts that tolerate their absence. The worst offender is the FS reconciliation path's direct `db.run(UPDATE ...)` calls for folder/file renames (`packages/km-storage/src/watch/change-handlers.ts:616,622,635,697`), which write DB state and then opportunistically append to `changes.jsonl` via a bespoke `journalRename()` helper that skips the real emitter — the journal stays populated but replay would produce a different DB state than live.

**Verdict:** (a) Phase B is persist-and-replay with **~5 gaps to fix** (roughly **2–3 person-weeks of normalization + test work**), not the ground-up rewrite round-4 feared. No new op types required. The biggest risk is not the op *shape* but the *closure* of the op surface — several legitimate state-mutation paths do not round-trip through `emitter.apply()`.

---

## The op surface today

### Content ops (oplog candidates)

The `Change` record (`packages/km-core/src/types.ts:375–383`) is the canonical persistence op. Every field is plain JSON: `id` (ULID), `type` (ChangeType), `actor` (string), `target` (string NodeId), `data` (Record<string, unknown>), `ts` (ms), `origin` ("tui" | "fs" | "replay" | "system").

| Op name | Where defined | Serializable? | Content-scoped? | Deterministic on replay? |
|---|---|---|---|---|
| `node_created` | `packages/km-core/src/types.ts:354`; payload `NodeCreatedData` at `types.ts:386–410` | **Yes** — all plain fields | **Yes** — node shape only | **Yes** — INSERT OR IGNORE is idempotent (`packages/km-storage/src/db/changes.ts:80`) |
| `node_updated` | `packages/km-core/src/types.ts:355`; payload `NodeUpdatedData` at `types.ts:412–414` (open record) | **Yes** — JSON round-trip | **Mostly** — but `data` field is a freeform `Record<string, unknown>`; see Gaps §G3 | **Yes** — per-column UPDATE with json_patch on extra fields (`changes.ts:135–192`) |
| `node_moved` | `packages/km-core/src/types.ts:356`; payload `NodeMovedData` at `types.ts:416–419` (+ `old_parent_id` threaded via `ops.ts:236`) | **Yes** | **Yes** | **Yes** — single UPDATE to parent_id/parent_idx (`changes.ts:194–207`) |
| `node_deleted` | `packages/km-core/src/types.ts:357`; payload snapshotted at `ops.ts:313–333` | **Yes** | **Yes** (carries fs_path, type, parent_id, item) | **Yes** — recursive subtree delete (`ops.ts:114`) |
| `task_claimed` | `packages/km-core/src/types.ts:359` | **Yes** — actor carries user; status derived | **Yes** | **Yes** (`changes.ts:214`) |
| `task_released` | `packages/km-core/src/types.ts:360` | **Yes** | **Yes** | **Yes** (`changes.ts:227`) |
| `task_completed` | `packages/km-core/src/types.ts:361` | **Yes** | **Yes** | **Yes** (`changes.ts:240`) |

**Note**: `task_*` ops are structurally redundant with `node_updated` (they set `task_status` and sometimes `assigned_to`). They're compatibility scaffolding and could be folded into `node_updated` at Phase B time, or kept as convenience aliases. Either is fine for replay.

### UI/app ops (explicitly excluded)

These are defined in `packages/km-commands/src/types.ts` and `packages/km-board/src/board-types.ts`. They shape the TUI experience but never touch `emitter.apply()` — they live and die at the React/TEA layer.

| Op union | Where defined | What it mutates |
|---|---|---|
| `BoardReducerOp` (`SELECT`, `TOGGLE_FOLD`, `TOGGLE_COLLAPSE`, `SET_COLLAPSED_NODES`, `ZOOM_IN`, `SET_ROOT`, `ENTER_MOVE_MODE`, `CONFIRM_MOVE`, `CANCEL_MOVE`, `SET_CURSWANT`) | `packages/km-board/src/board-types.ts:81–113` | BoardState: cursor, fold depths, collapsed set, zoom root, move mode, curswant — all in-memory only |
| `NavOp` (`CURSOR_MOVE`, `NAV_BACK`, `NAV_FORWARD`, `ZOOM_INWARDS/OUTWARDS/TO_ROOT`, `FOLLOW_LINK/WIKILINK`, `PAGE_JUMP`, `JUMP_TO_COLUMN`, `FOLD_LEVEL`, `UNFOLD_LEVEL`) | `packages/km-commands/src/types.ts:837–850` | Cursor / zoom root / scroll / fold |
| `DialogOp` (30+ entries: pickers, filter, favorites, date prompts, omnibox, search) | `packages/km-commands/src/types.ts:940–983` | Dialog visibility, dialog focus, filter text, picker list |
| `PaneOp` (`PANE_SPLIT`, `PANE_CLOSE`, `PANE_FOCUS/*`, `PANE_RESIZE/*`, `PANE_ZOOM`, `PANE_SWAP`) | `packages/km-commands/src/types.ts:985–1000` | Window manager state |
| `ViewOp` (`QUIT`, `CYCLE_VIEW_MODE`, `CYCLE_ICON_STYLE`, `SHOW_HELP`, `FOCUS_BOARD/DETAIL`, `HISTORY_UNDO/REDO`, `CONSOLE_TOGGLE`, `NOOP`, `SYNC_PANE_TOGGLE`) | `packages/km-commands/src/types.ts:1003–1027` | View mode, help overlay, undo invocation, console toggle |
| `TextEditOp` sub-union (`TEXT_INSERT`, `TEXT_DELETE_*`, `TEXT_CURSOR_*`) | `packages/km-commands/src/types.ts:88–109` | Per-character editing against an in-memory `activeEditTargetRef` — see "text editing" note below |

**Text editing boundary**: `TEXT_INSERT` / `TEXT_DELETE_*` mutate an in-memory `EditTarget` only. The persistence op `node_updated` is emitted by a single `target.save()` at `TEXT_CONFIRM` / `TEXT_EXIT_EDIT` / linebreak transitions (`apps/km-tui/src/board/board-actions.ts:986–1019`). This is correct for Phase B — replay would re-apply the final content, not every keystroke — but means Phase B oplog cannot reconstruct fine-grained edit history. That's fine; the stated unlock is "semantic undo," not "keystroke undo."

### Ambiguous / review-required

| Op | Classification | Reason |
|---|---|---|
| `DeleteNodeOp` / `DELETE_NODE` (command layer, `types.ts:197`) | Command → content | Dispatched to `executeDelete` which calls `repo.deleteNode` → emits `node_deleted`. UI op that **does** end up content-scoped. |
| `TASK_SET_STATUS`, `TASK_CYCLE_STATUS`, `CLEAR_TASK` | Command → content | Routed to `repo.updateNode` with `item.task.status` changes. Command is UI; the emitted `Change` is pure content. |
| `APPEND_TAG`, `SET_ASSIGNEE_VALUE`, `SET_PRIORITY_*`, `SET_DUE_DATE` | Command → content | Same: command-level ops that emit `node_updated` Changes. |
| `session_started` / `session_message` / `session_tool_call` / `session_ended` / `message` (`types.ts:363–368`) | Declared on `ChangeType`, **no-op in state.db** (`changes.ts:49–56`) | Persisted to `changes.jsonl`, never written to DB. These are a cross-session messaging log for agents. Phase B has to decide: are these part of the oplog? They're content in the "agent state" sense but do not affect node tree. Recommendation: keep them in `changes.jsonl` but tag them as a separate stream in the Phase B oplog layout. |
| `conflict_created` (`types.ts:370`) | Declared, **no-op in state.db** | Same pattern — emitted when FS sync detects conflict; informational. |
| `HistoryOp` (`HISTORY_UNDO`, `HISTORY_REDO`, `types.ts:135–143`) | UI op | Triggers inverse ops via `UndoableRepo`; the resulting mutations flow through normal `apply()`. Undo itself is UI. |
| `buildEmbedChild` result (`ops.ts:89`) | Helper, not op | Produces a partial KNode; writes happen via whichever caller (repo.addNode or direct DB insert in rules). **Is not itself an op.** The caller's op is what shows up. |

---

## Path to persisted state: the "apply()" question

Does ALL persisted-state mutation flow through a single serializable chokepoint? **No — there are five entry points, only one of which is the emitter.** The following table enumerates every path from a state-change trigger to DB disk writes.

### Paths that DO go through `emitter.apply()`

| Trigger | Route | Result |
|---|---|---|
| UI command (keyboard / omnibox / click) | `executeCommand(op)` → `board-actions.ts` → `repo.addNode/updateNode/deleteNode/moveNode` → `DbOps.*Impl` → `emitter.apply({type: "node_*", actor: "user", data: {...}}, {db})` | **Serializable Change emitted**, DB + journal + broadcast |
| Undo / Redo | `UndoableRepo` proxies over `repo.*` → same DbOps path (but `replaying=true` flag suppresses re-recording) | **Serializable Change emitted** via emitter |
| Task status change via command | `TASK_SET_STATUS` op handler → `repo.updateNode({item: {task: {status}}})` → emitter | **Serializable Change emitted** |
| Rename (user-triggered) | `repo.renameNode()` → multiple `updateNode` calls → emitter per call | Serializable Changes emitted (one per affected node/backlink) |

### Paths that emit Changes **but with a non-standard actor/shape**

| Trigger | Route | Actor |
|---|---|---|
| FS watcher sees new/changed `.md` file | `reconcile.ts` → `handleCreate/handleUpdate` in `watch/handlers/*.ts` → `emitNodeCreated(emitter, "fs-watch", ...)` → `emitter.apply` (but called as `commit` via `wrapEmitterForReconcile` in bulk-sync, to prevent echo loops) | `"fs-watch"` |
| Markdown pipeline ingests a file | `markdown/pipeline.ts:434` `emitNodeCreated(emitter, "fs-watch", node)` + `pipeline.ts:464` `emitNodeUpdated(emitter, "fs-watch", fileId, {fs_mtime,fs_ino,content_hash})` | `"fs-watch"` |
| Deferred parsing (stub → full) | `markdown/deferred.ts` → inserts rows directly via `insertNodeRow` BUT does NOT emit `node_created` Changes (see Gaps §G1) | — |

### Paths that bypass `emitter.apply()` and write DB/FS directly

These are the **gap list**. Each is a place where DB state changes without a corresponding `Change` in `changes.jsonl` (or with a hand-rolled Change that does not go through the full emitter pipeline).

| Gap | Location | What it does | Severity |
|---|---|---|---|
| **G1 — Scanner / discovery direct INSERT** | `packages/km-storage/src/repo/repo.ts:1359` (expandDirectory) and `packages/km-storage/src/repo/loader.ts:1107` (loadRepo applyChanges) | Prepares `INSERT_NODE_SQL` and bulk-inserts rows inside a single `BEGIN IMMEDIATE` transaction. Does not emit per-row `node_created` Changes. (Loader reads from changes.jsonl, which is by definition replay; but expandDirectory does NOT.) | High — cold-start scanner and lazy-expand sidestep the op surface |
| **G2 — Deferred markdown parse** | `packages/km-storage/src/markdown/deferred.ts:134,276,303` | Replaces a stub with full parse results. `pipeline.ts:433` emits `fs-watch` events when an `emitter` is passed; `deferred.ts` paths sometimes omit the emitter arg (search call sites of `parseStubFileImpl`/`parseDeferredAsyncImpl`). | Medium |
| **G3 — Folder / file rename direct UPDATEs** | `packages/km-storage/src/watch/change-handlers.ts:616,622,635,697,403,408` | Performs `UPDATE nodes SET fs_path = ...` directly, then calls `this.journalRename()` which **bypasses `emitter.apply`** — it hand-assembles a `Change` and `appendFileSync`s to `changes.jsonl` (`change-handlers.ts:727–743`). The DB + journal agree, but only because both sides of the bypass do the work twice. On replay, replaying `node_updated {fs_path: ..., name: ...}` will re-derive correct state; however, the journal write is not transactional with the DB write, so a crash between lines 616 and 739 would persist DB state without journaling it. | **High — correctness-affecting bypass** |
| **G4 — Link / embed mirror UPDATEs** | `packages/km-storage/src/watch/handlers/update-handler.ts:197`, `create-handler.ts:223`, `db/ops.ts:135,139` (delete cascades), `markdown/pipeline.ts:322` | `UPDATE nodes SET embed_of = ?, name = ?` after link resolution. `create-handler.ts:229` DOES emit a paired `emitNodeUpdated`, but `ops.ts:135,139` delete link/collapsed_file_links rows without any corresponding `Change`. | Medium — link-cache rows are derived state, deletion-with-subtree is covered by `node_deleted`, but if Phase B oplog is supposed to reconstruct links on replay, the current `Change` shape does not carry link data |
| **G5 — Schema migrations + FTS rebuild** | `packages/km-storage/src/db/schema.ts:352,358,361,370–376,387,427,533,568–572,596` | Direct UPDATEs for column renames, type re-mapping, FTS reindex, `data_version` bump, destructive `DELETE FROM nodes` on data-version mismatch. | Low for Phase B — migrations happen once per schema bump. Oplog replay must assume current schema; migrations live outside the op stream. Flag it in the design, not as a gap to fix. |
| **G6 — Link-table mutations** | `packages/km-storage/src/db/links.ts:53,61`, `db/collapsed-file-links.ts:73`, `db/referenced-anchors.ts:77`, `markdown/pipeline.ts:313` | `INSERT INTO links`, `DELETE FROM links` — link cache is rebuilt from node content on every parse; not an op on its own. | Low — links are a derived cache, not authoritative content. Phase B replay regenerates them by re-parsing node content. |
| **G7 — Block-ID auto-assignment** | `packages/km-storage/src/watch/change-handlers.ts:144` — `UPDATE nodes SET block_id = ?` inside a serializer-driven callback | Block IDs are assigned lazily when a node is referenced; the assignment mutates persistent state. | Medium — behaves like a `node_updated { block_id: ... }` but no Change is emitted |
| **G8 — Rules materialization** | `packages/km-storage/src/db/rules.ts:176` — `DELETE FROM nodes WHERE id = ?` for orphaned embed children during rule re-evaluation | Rule engine derives virtual children from a query; cleanup deletes them without a `node_deleted` Change | Medium — but arguably derived state (these nodes were auto-created, they can be auto-deleted). Similar logic to G6. |
| **G9 — Content hash baseline update** | `packages/km-storage/src/watch/change-handlers.ts:266`, `markdown/pipeline.ts:454` | `UPDATE nodes SET content_hash = ?` / `UPDATE nodes SET fs_mtime = ?, fs_ino = ?, content_hash = ?`. `pipeline.ts:463` emits a corresponding `emitNodeUpdated(emitter, "fs-watch", ...)` but `change-handlers.ts:266` (baseline merge after external drift) does NOT. | Medium |
| **G10 — Memory-store bulk path** | `packages/km-storage/src/store/memory.ts:329,472,503,534,612` | `MemoryStore` (legacy?) class has direct DB writes that bypass `emitter.apply`. Only touched if something in the codebase still instantiates it. | Check usage — likely dead code. Grep for `new MemoryStore` and confirm. |
| **G11 — Repo.renameNode link rewrite** | `packages/km-storage/src/repo/repo.ts:565` — `UPDATE links SET href = ? WHERE href = ?` | Rewrites the link cache's href column on rename. Not an op; falls under G6 (derived cache). | Low |

---

## Serializability audit

For each **content op** (the seven `ChangeType` entries that mutate node state), verify serializability.

### `node_created`

- **Args are plain-data?** ✅ — `NodeCreatedData` (`types.ts:386–410`) is all string/number/nullable. The `data` sub-field is `Record<string, unknown>` which is the one weak point — see §G3 below.
- **References are stable NodeIds?** ✅ — `id` is a ULID (`packages/km-storage/src/db/ops.ts:343`); `parent_id` is a NodeId or `.` (root sentinel); `embed_of` is a NodeId.
- **Replay is deterministic?** ✅ — `INSERT OR IGNORE` makes it idempotent (`changes.ts:80–128`). `ts` from the change, not from Date.now at replay.
- **Non-deterministic?** — `ulid()` in `ops.ts:343` is called at op-emit time, not at replay, so replay sees the original ULID. **OK.**

### `node_updated`

- **Args are plain-data?** ⚠️ — `NodeUpdatedData` is typed as `{[key: string]: unknown}` (`types.ts:412`). Callers pass arbitrary partial KNode fields plus a nested `item` object. As long as nobody slips a function/Date/Map in, this is serializable — but there's no type-level guard. **Soft violation.**
- **References stable?** ✅ — updates target a NodeId.
- **Replay deterministic?** ⚠️ — `applyNodeUpdated` (`changes.ts:135–192`) handles per-column and `json_patch` for extra fields. `updated_at` is set from `change.ts` (good — not Date.now at replay). `version` is set from `change.id`. **OK.**
- **Nested `data` field drift risk** — the `data` column accepts full replacement AND json_patch depending on whether callers pass `data` key vs other keys. If a caller serializes `data` as a string (see `repo.ts:664`: `changes.data = JSON.stringify(newData)`), replay has to reverse the cast. Works today but is fragile.

### `node_moved`

- **Args plain-data?** ✅ — `{parent_id, parent_idx, old_parent_id}`.
- **References stable?** ✅ — NodeIds.
- **Replay deterministic?** ✅ — simple UPDATE (`changes.ts:194–207`).
- **Note**: `old_parent_id` is snapshotted at op-emit time (`ops.ts:236`) — this is **essential** for FS projection to regenerate the source file after a cross-file move. Phase B replay does NOT need `old_parent_id`, but it's already in the payload, which is fine.

### `node_deleted`

- **Args plain-data?** ✅ — `{fs_path, type, parent_id, item}` snapshot (`ops.ts:326–333`).
- **References stable?** ✅ — `target` is the NodeId.
- **Replay deterministic?** ✅ — recursive subtree delete (`changes.ts:209`, `ops.ts:114`).
- **Note**: descendants are deleted by recursive CTE; the op does NOT enumerate them. Replay walks the tree via SQL. This is fine but means the op on its own is not self-contained for replay outside a DB — e.g., replaying into a fresh empty DB, `node_deleted` will no-op because the subtree isn't there. That's the correct behavior for a content log.

### `task_claimed` / `task_released` / `task_completed`

All three are structurally equivalent to `node_updated` with fixed field subsets. Fully serializable, deterministic (`changes.ts:214–251`). Could be folded into `node_updated` with no loss — Phase B design choice.

### Summary

**No hard serializability violations.** Two soft concerns:

1. `node_updated`'s `data` field is `Record<string, unknown>` — type-level there's nothing preventing a caller from passing a function or Date. Search for callers is finite (`repo.ts`, command handlers); a runtime assertion would tighten this.
2. `Change.id` is a ULID generated at op-emit (`emitter.ts:132`). This is correct and stable. `change.ts` is `Date.now()` at op-emit, NOT at replay. **OK.**

---

## Content-scope audit

For each content op, verify no UI/app state is embedded.

### Checked fields

- `NodeCreatedData` — all node-shape fields (type, fstype, parent_id, parent_idx, item, content, content_hash, fs_path, fs_ino, fs_mtime, md_pos, md_line, rules, data). **No cursor, no fold, no selection, no view-mode, no pane-id, no session-id.** ✅
- `NodeUpdatedData` — open record, but every caller reviewed passes only KNode fields or `{item: {...}}`. **No UI leakage observed.** ✅
- `NodeMovedData` — `parent_id`, `parent_idx`, `old_parent_id`. All node-shape. ✅
- `NodeDeletedData` — `fs_path`, `type`, `parent_id`, `item`. ✅
- Session/message/conflict ops — **these carry session_id, model, role, content, tokens, tool name** — all plain but arguably crossing into agent/UI. They do not affect the node tree. See §Gaps G13.

### Violations

**None in content ops.** km's split between `KmOp` (UI) and `Change` (persistence) is cleanly maintained in the live mutation surface.

### Risks

- **`NodeCreatedData.data`** is `Record<string, unknown>` (`types.ts:409`). `data` is the KNode's freeform JSON blob (rules, props, custom fields, embed targetPath). Today it only carries structural/content metadata; if we ever write cursor/fold/view state into node.data (bad practice but not structurally prevented), it would leak through the op.

---

## Gaps

Summary of what's missing for Phase B to be pure persist+replay. Ordered by effort.

### Gaps to fix before Phase B ships (work items)

- **G1 — Route scanner / lazy-expand through `emitter.apply`** (`repo.ts:1359`, `loader.ts:1107`). These are bulk cold-start inserts. Either (a) emit `node_created` per row (with `skipPersist` for loader since it IS the replay) or (b) tag both paths as "replay/bootstrap" and emit a single `bootstrap_complete` marker. Effort: ~1 day per path.

- **G3 — Route folder/file/directory rename through `emitter.apply`** (`change-handlers.ts:616,622,635,697,403,408`). Replace hand-rolled `journalRename()` with a proper `emitter.apply({type: "node_updated", actor: "user", target: nodeId, data: {fs_path, name, title, old_fs_path}})`. Today's direct `db.run` + hand-rolled journal write is a **correctness risk** (crash between writes leaves DB ahead of journal). Effort: ~2 days (careful — echo-loop prevention via `commit` vs `apply`, and the cascade SUBSTR update at `change-handlers.ts:622` is a bulk op that needs to become N per-node ops OR a single `node_updated` with a cascade-spec payload).

- **G4 / G7 — Emit `node_updated` for embed_of / block_id back-writes** (`update-handler.ts:197`, `create-handler.ts:223`, `change-handlers.ts:144`, `pipeline.ts:322`). Two of these already emit; just standardize the pattern. Effort: ~0.5 day.

- **G9 — Emit `node_updated` for baseline content_hash after external-drift merge** (`change-handlers.ts:266`). Effort: ~2 hours.

- **G2 — Ensure deferred parser always receives an emitter** (`markdown/deferred.ts`). Audit the callers, make emitter required (not optional). Effort: ~0.5 day.

- **G6 / G8 / G11 — Document that link cache, rules-derived embeds, and link-href rewrites are derived state regenerated on replay.** Not a code fix; a design note in the Phase B spec. Effort: 0 (write the spec clearly).

- **G10 — Delete `MemoryStore` if dead, or port to emitter-based path.** Effort: ~1 hour to grep call sites + decide.

- **G13 — Decide what session/message ops do in the oplog.** Keep in `changes.jsonl` as a parallel stream, split into a separate log, or promote to first-class content ops? Design decision, not code. Effort: 0.5 day of design discussion.

### Design questions that must be answered before ship

- **DQ1** — Is Phase B's oplog identical to `changes.jsonl`, or a parallel file with a different retention policy? Today's `changes.jsonl` is append-forever; Phase B likely wants compaction + snapshots.

- **DQ2** — Replay contract: can Phase B oplog be replayed into an empty DB and produce the correct state? Today's `node_deleted` relies on live subtree state, so "replay into empty" would no-op the delete. This is fine IF the contract is "replay against a snapshot + changes since snapshot," not "replay from epoch." Phase B spec must make this explicit.

- **DQ3** — `fs-watch` ops: in Phase B, do they go in the same oplog as user ops? They're real `node_updated`/`node_created` Changes today. Mixing them means replay will reconstruct FS state — which may conflict with Phase B's "FS is still truth" claim. Tag or split?

- **DQ4** — What about `task_*` ops — keep as aliases or fold into `node_updated`? No functional difference either way.

- **DQ5** — Migration-era DB writes (§G5) are implicitly out-of-scope. Document this in the Phase B spec: **the oplog begins after schema is stable.**

### What is NOT a gap

- UI ops (BoardOp, NavOp, DialogOp, PaneOp, ViewOp, TextEditOp) do not need to be in the oplog. They're correctly scoped out.
- Commands (`KmOp` union) do not need to be in the oplog. They produce Changes at the `repo.*` boundary; that's the right layer.
- `session_*` and `message` ops **are already** in `changes.jsonl` with no-op DB apply. Phase B can keep them there or split them — not a "gap," a design choice (DQ3/DQ13).

---

## Verdict

**(a) Phase B is persist + replay + normalization.** No ground-up rewrite required. The op vocabulary is sound: seven content op types (`node_*` plus `task_*`), plain-data payloads, stable NodeIds, deterministic replay handlers already exist (`packages/km-storage/src/db/changes.ts`). The UI/content split is cleanly maintained — `KmOp` never leaks into `Change`.

The blocker risk is **op-surface closure, not op-shape**. Five to ten paths mutate DB state without a corresponding `emitter.apply()` call. None of them emit nonsense data; they just don't emit at all (or they hand-roll a journal write that bypasses the emitter pipeline). Routing them through the emitter is mechanical — ~2–3 person-weeks including tests.

**Phase B cost estimate today: 2–3 person-weeks for normalization** (Gaps G1–G4, G7, G9), plus whatever the oplog file format + compaction + replay-on-recovery tooling costs, which is the real Phase B scope and was already estimated separately in `hub/km/storage-architecture.md` §9. The op-vocabulary audit does not change that estimate — it confirms the prerequisite.

Round-4's worry that Phase B might be "op-schema redesign" is **not borne out** by the code. The schema is fine. The op-stream closure isn't.

---

## Recommended follow-up beads

If gaps are confirmed in implementation, suggest creating:

- `km-storage.op-surface-route-scanner` (P1) — route `repo.expandDirectory` and similar bulk inserts through `emitter.apply`. Covers G1.
- `km-storage.op-surface-rename-path` (P0) — replace hand-rolled `journalRename` in `watch/change-handlers.ts` with real `emitter.apply` calls. Covers G3. **Highest priority — crash-safety issue today.**
- `km-storage.op-surface-embed-and-blockid` (P2) — standardize `emitter.apply` emission for embed_of, block_id, content_hash back-writes. Covers G4, G7, G9.
- `km-storage.op-surface-deferred-emitter-required` (P2) — make emitter required in deferred parser API. Covers G2.
- `km-storage.op-surface-memorystore-cleanup` (P3) — delete or port MemoryStore. Covers G10.
- `km-storage.phase-b-session-ops-decision` (P2) — design decision on where session/message ops live in Phase B oplog. Covers DQ3, G13.
- `km-storage.op-vocabulary-type-tighten` (P3) — replace `NodeUpdatedData = {[key: string]: unknown}` with a closed discriminated union over KNode fields + validated `data` blob shape. Tightens soft serializability concern.
- `km-storage.phase-b-replay-contract-spec` (P1) — write the Phase B design doc covering DQ1–DQ5 (oplog vs changes.jsonl, replay-against-snapshot contract, fs-watch op handling, session ops, migration boundary). Prerequisite for scheduling Phase B.

---

## Appendix — citation map

Every claim above traces to a file:line. Key touchpoints:

- **ChangeType union** — `packages/km-core/src/types.ts:352–370`
- **Change interface** — `packages/km-core/src/types.ts:375–383`
- **Content op payloads** — `packages/km-core/src/types.ts:386–445`
- **DbOps primitives** — `packages/km-storage/src/db/ops.ts:27–32`
- **applyChangeWithDb (replay)** — `packages/km-storage/src/db/changes.ts:24–62`
- **Emitter** — `packages/km-storage/src/emitter.ts:111–214`
- **Repo mutation wrappers** — `packages/km-storage/src/repo/repo.ts:388–575`
- **Undo system** — `apps/km-tui/src/undo/operations.ts:21–137`
- **Board reducer (UI, pure)** — `packages/km-board/src/board-reducer-new.ts:24–152`
- **BoardReducerOp / BoardState** — `packages/km-board/src/board-types.ts:52–113`
- **KmOp union (UI, pure)** — `packages/km-commands/src/types.ts:1030`
- **Gap G3 (journalRename bypass)** — `packages/km-storage/src/watch/change-handlers.ts:727–743`
- **Gap G1 (scanner direct INSERT)** — `packages/km-storage/src/repo/repo.ts:1359`, `packages/km-storage/src/repo/loader.ts:1107`
- **Gap G5 (schema migrations)** — `packages/km-storage/src/db/schema.ts:352–596`
- **FS-watch actor discipline** — `packages/km-storage/src/watch/change-handlers.ts:94` (skip fs apply for actor=fs-watch) + `packages/km-storage/src/watch/bulk-sync.ts:82–90` (`wrapEmitterForReconcile` uses `commit` not `apply`)
