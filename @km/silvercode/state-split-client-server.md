---
aliases:
  - km-silvercode.state-split-client-server
  - km-silvercode-state-split-client-server
created_at: 2026-05-07T21:52:55.168Z
---

# Split silvercode state into client/server parts (mirror km's storage split) #P2

Sub-bead under `@km/silvercode/web-desktop-shells`. The web/desktop-shell deployment story doesn't cash out unless silvercode state has a clean client/server boundary — same lesson km is internalizing right now via storage v5 + the early-stage `@km/web` (per docs/architecture.md and the km-storage v5 progress memo).

## Today (2026-05-07)

Silvercode state lives in one process — the silvercode CLI binary. The signals layer in `apps/silvercode/src/controller.ts`, `cross-agent-state.ts`, `coordinator-mcp.ts`, `channel-queue.ts`, plus the per-pane `AcpSession` handles, all share Bun-process memory with the silvery render tree. Every signal is implicitly *client-local*. There is no "server" layer to migrate to.

This is fine for the terminal CLI shape — single process, single user, single pane host. It breaks every other shape:

- **Web shell** — the renderer is a browser tab, can't hold ACP subprocess handles, child terminals, MCP-over-stdio servers, or fs watchers.
- **Desktop shell** — Electron renderer can't run `Bun.spawn` on user binaries; the main process can but lifecycle is split anyway.
- **Cross-machine squad mode** — peers need to see each other's pane state, claims, broadcasts; today that's per-process tribe relay, not shared state.
- **Detached / background** — closing the terminal kills the session today. Can't "continue this conversation tomorrow on a different device."
- **Multi-shell-one-session** — terminal + web open against the same silvercode session simultaneously is impossible.

## What km is doing (the precedent)

Km is moving toward a clean events-table seam (`docs/architecture.md` §3.2.1, `docs/design/model/storage.md`):

- `SCHEMA_VERSION=5` with branded `NodeId`/`RepoId`, `fs_dev`/`fs_size`/`fs_content_hash` columns.
- Reserved `hlc` (Hybrid Logical Clock) + `peer_id` columns for CRDT sync — populated when multi-device arrives.
- `@km/web` (apps/km-web) — early-stage web server; the split is in flight, not theoretical.
- Op vocabulary audit (`hub/km/research/op-vocabulary-audit-2026-04-22.md`) — proves the op surface can be persisted + replayed; 11 gaps tracked, Phase B replay-contract spec is its own bead.
- Mutation pipeline doctrine: every mutation converges on `repo.updateNode`; no path writes .md files directly; sync materializes both ways. *That's* the contract that makes client/server separation tractable — there's exactly one thing to push across the wire.

## What silvercode needs (the state taxonomy)

Audit every silvercode signal/store/handle and classify into three buckets. This is the actual deliverable.

**Bucket 1 — Server-canonical (lives on the silvercode-server)**

- ACP session handles + transcript history (`AcpSession`, `session/load` for resume)
- ChannelQueue contents (broadcasts not yet drained into a turn)
- CrossAgentState — file claims, handoffs, activeSessions, recentBroadcasts
- Coordinator-MCP state (subagent activities, registered tools per session)
- Pending permissions (the cross-pane override queue)
- Cost / quota / token telemetry per session
- Background-task list (Ctrl-B detached turns)
- Subprocess lifecycles — child Bun processes, MCP stdio servers, terminal handles, fs watchers
- Tribe membership + peer broadcast log
- Plan drawer state if it's tied to the agent's session

**Bucket 2 — Client-local (lives in the renderer/shell)**

- Pane focus + cursor positions
- Composer text being typed, draft attachments
- Scroll offsets, selection
- View-mode toggles (which side panel is open, which dialog is mounted)
- Hover state, transient popovers
- Per-shell theme override (terminal-theme-aware vs. DOM-light/dark)
- Keybinding state (chord in progress)
- Storybook/dev-only flags

**Bucket 3 — Shared (replicated, not duplicated — same shape served from server, materialized client-side)**

- Active session list (server is canonical, every client renders it)
- Latest tool-call status per pane (event-streamed from server, cached client-side for redraw)
- The pane layout itself — *if* layout is per-shell (then client-local) or session-attached (then shared); design decision deferred.

## Wire format / sync model

- **Probably SSE or websocket** for server→client event push, mirroring opencode's HTTP-API + SSE pattern.
- **Typed RPC** for client→server commands (prompt submit, permission grant, claim file, etc.) — mirror the typed surface opencode generates from OpenAPI.
- **Op log replay** for late-attaching clients — second client opens the session, replays the recent op log to catch up. This is exactly the km storage-events pattern, just for ACP-session events not for KNode tree events.
- **CRDT-ready columns** on the silvercode-server's session store, parallel to km's hlc/peer_id reservation. Multi-device for the same user = same primitive.

## Acceptance — what "done" looks like

- [ ] `apps/silvercode/docs/state-taxonomy.md` — classify every signal/store in the silvercode codebase into the three buckets above. Include current location and target location.
- [ ] One example end-to-end migrated through the seam (suggest CrossAgentState — small surface, big leverage). Pick path A (HTTP API) or B (typed IPC) per parent epic's decision.
- [ ] Storybook/dev-only flag to render `<SilvercodeInterface>` against an in-memory mock server — proves the seam is real (no live ACP subprocess, only event replay drives the UI).
- [ ] Tests: client-only-state changes don't round-trip to server; server-canonical-state changes always do; shared-state changes are server-truth + cached.

## Dependencies / cross-links

- **Blocks** [`@km/silvercode/web-desktop-shells`](web-desktop-shells.md) — formal `bd dep` edge; the web/desktop deploy is impossible until state is bucketed.
- Cross-references km's storage v5 progress memo + `docs/architecture.md` §Storage + the events-table seam (`docs/design/model/storage.md`) as the architectural precedent. Same shape of problem, one epic earlier in time.
- Should land before `@km/silvercode/server-extraction` (placeholder sub-bead under the parent epic) — knowing what's server-canonical is what defines what "the server" is.
- Pairs with [`@km/silvercode/borrow-openclaw-execution-trace`](borrow-openclaw-execution-trace.md) — its normalized `SessionTrace` shape is the canonical wire artifact for a server-canonical telemetry record, so the bucketing audit must classify trace-emitting paths as server-side from day 1.
- Pairs with [`@km/silvercode/borrow-paperclip-claude-failure-types`](borrow-paperclip-claude-failure-types.md) — failure-family detection lives server-side once split (the server owns the retry decision, the client renders the CTA from `_meta.failureFamily`).
- Pairs with [`@km/silvercode/borrow-skills-fingerprint-materialization`](borrow-skills-fingerprint-materialization.md) — skill materialization is server-canonical (workspace-scoped writes), so the fingerprint writer is one of the first concrete server-side modules. Bucket it that way from the audit.
- Compatible with [`@km/silvercode/borrow-paperclip-execution-target`](borrow-paperclip-execution-target.md) — execution-target abstraction is the *spawn* seam; this bead is the *state* seam. Independent axes; both eventually load-bearing for the parent epic.

## Notes

- This is the sort of audit that's done once carefully and informs every subsequent silvercode design decision. Worth budgeting time for it before extracting any package boundaries.
- Per-bucket-1 item, decide auth/permission boundary: which mutations require user consent at the server, which are fire-and-forget. (E.g. "approve permission" is a privileged op, "update plan drawer state from agent" is not.) That's a follow-up sub-bead.
- Mention in conversation 2026-05-07 (this session): user observed silvercode should split state "like we started doing for km". File this bead before the chat compacts.
