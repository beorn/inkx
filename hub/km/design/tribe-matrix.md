# Tribe on Matrix (via a Room adapter) — decision record

**Status**: Decision committed 2026-04-19 after six-alternative review + two deep-research surveys (Matrix-general + XMPP-vs-Matrix) + live scan of OpenClaw, Hermes, Nanoclaw, pi-mom, Gas Town.
**Supersedes**: `hub/bearly/design/tribe-minimal.md` (spec v1/v2/v3 — custom-wire-daemon direction, retired).
**Complements**: km-infra.bd-v1-compat (km-native bd; tribe's durable ledger eventually).

## Decision (two layers)

**Layer 1 — Abstraction: `@bearly/room`.** km and tribe consume a substrate-agnostic `Room` interface. They never import a specific protocol SDK directly.

**Layer 2 — Production adapter: Matrix.** The reference adapter implementation is `@bearly/room-matrix`, wrapping `matrix-js-sdk` and talking to a Matrix homeserver (user choice of Synapse or Conduit). This is what ships by default and what the rest of the DR focuses on. Alternative adapters (`room-xmpp`, `room-file`, `room-memory`, `room-slack`, `room-openclaw`, etc.) are pluggable extensions behind the same interface.

**Matrix-specific decisions:**
- **Server**: user choice at `km matrix init` between **Synapse** (default, mature) and **Conduit** (Rust single-binary, smaller). Native install preferred over Docker.
- **Client SDK**: `matrix-js-sdk`, lean imports, consumed only by the `room-matrix` adapter — not by km or tribe directly.
- **Mobile observability**: Element (web/desktop/iOS/Android), reachable via chosen network mode (local / tailscale / public-TLS).
- **Structure**: km repo = Matrix Space (when `spaces` capability available); channels = rooms; `chats/<channel>/` = projected event journal + rendered view in the vault.
- **Identity**: durable personas (`agents/<name>.md` with stable `persona_id`) + volatile runtime state (`.state/<persona_id>.json`) + matrix users bound to personas + sessions assume personas via a lease mechanism.
- **Scope**: user-global (one homeserver per user; all their km repos as spaces under it). `repo_id` persisted in each repo so multi-machine clones don't duplicate spaces.
- **Integration surface**: `@bearly/tribe` MCP server loaded by Claude Code's SessionStart hook, consuming a `Room` instance (typically `room-matrix` in production).

## Why the adapter layer

1. **Reversibility** — if Conduit stagnates, or Matrix ecosystem shifts, or a user's threat model demands XMPP, we swap adapters by config, not by rewrite.
2. **Testing** — unit tests use `room-memory`; integration tests use `room-file`; full-loop tests use `room-matrix`. No Docker dependency for most test runs.
3. **Decoupling** — km needs a Room for channel views + structured events. Tribe needs a Room for coordination. Either one can be used alone.
4. **Proven pattern** — OpenClaw's 113 channel extensions are channel adapters. Matches what the industry already validates at scale.
5. **User choice** — `room-file` for local-only dev, `room-matrix` for production, `room-xmpp` if someone prefers a smaller substrate. One interface, multiple deployments.
6. **Future OpenClaw** — becomes `room-openclaw` when we want the bridge. Plugin, not rewrite.

## Why not the alternatives

Twelve hours of review across six alternative families:

| Path | Fatal issue for our constraints |
|---|---|
| Custom wire daemon (`@bearly/tribe` as shipped) | 8,300 LOC of custom IPC on top of a filesystem + beads + git substrate that already exists. Structural overreach. Pro-review surveys converged on "delete by subtraction." |
| OpenClaw extension | 40k+ LOC dep; Karpathy's critique on attack surface + complexity. Top-down orchestration shape doesn't match bottom-up peer coordination. Fine as a future bridge; wrong as the substrate. |
| XMPP + Prosody + @xmpp/client | Genuinely smaller (both surveys agreed). But **no Spaces equivalent** — the repo-as-space structural primitive doesn't work cleanly. Arbitrary event schema is harder. Bridge ecosystem smaller. AI-agent mindshare sparse. |
| File-based (nanoclaw-scale `.tribe/log.jsonl`) | Two pro reviews agreed it underspecifies delivery + corruption + presence; real reliability needs heartbeats + cursors + rotation + lock semantics — reinventing a broker badly. |
| Gas Town-style (beads + git only, no wire) | No chat-room observability layer. User explicitly values "agents in a chat room you can read from Element on your phone." |
| ATProto / Nostr | Wrong shape — social-publish protocols, not chat/presence substrates. Would need to invent rooms from scratch. |

Matrix won on three irreducible points:

1. **Matrix Spaces** are the load-bearing primitive for repo-as-space. XMPP has no polished equivalent.
2. **Arbitrary event schema** — custom event types (`m.km.bead.claim`, `m.km.persona.update`) are first-class. XMPP stanzas are more rigid; custom XEPs would be required.
3. **Bridge ecosystem** = the future-OpenClaw path for free. When we're ready, OpenClaw's matrix channel is the bridge; no custom adapter.

On size, Matrix-with-Conduit is close enough to XMPP-with-Prosody (both ~20-30MB servers, both modest SDK footprints) that the XMPP size argument doesn't override the structural wins.

## The core mapping

Matrix rooms are the **event log of truth**. Files under `chats/` are a **derived projection** of that log — read-rendered, not edited-then-synced:

```
km repo (projection side)              Matrix space (truth side)
─────────────────────────              ─────────────────────────
~/Code/pim/km/                    ←    !km-<id>:matrix.beorn.dev
  docs/                                  (folder nodes, not rooms)
  chats/                          ←      (rooms in the space)
    general/                      ←        #general room
      <cursor>.md                 ←          rendered view of event stream
      _events/                    ←          (raw event journal, append-only)
        <ts>-<eid>.json
    design/                       ←        #design room
  agents/                                (matrix users that are agents)
    silvery-refactor.md                    durable persona identity
    .state/silvery-refactor.json           volatile runtime (separate)
                                  ←    @silvery-refactor:matrix.beorn.dev
  users/                                 (matrix users that are humans)
    beorn.md                      ←    @beorn:matrix.beorn.dev
```

The room IS the source of truth. Files are projections. Editing `chats/<channel>/<msg>.md` directly does NOT publish an edit; posting goes through the `Room` API. This avoids echo loops + merge conflicts.

Events are immutable. Matrix edits (`m.replace`) and redactions appear as NEW events that reference prior ones. The on-disk journal (`_events/`) mirrors this: append-only. The rendered view shows the current state derived from the event chain.

## Core interface: event log with relations

`@bearly/room` is **an event-log abstraction**, not a chat-app abstraction. The hidden trap both pro reviews flagged: making file/XMPP/Slack adapters pretend to be full Matrix parity will leak. The interface stays small and honest.

```typescript
interface Room {
  readonly adapter: string                  // "matrix" | "file" | "memory" | ...
  readonly capabilities: Set<Capability>
  readonly repoId: string                   // stable, persisted in km repo metadata

  // Core (required by all adapters)
  send(roomId: string, draft: EventDraft): Promise<EventRef>
  subscribe(roomId: string, fromCursor?: Cursor): AsyncIterable<EventEnvelope>
  history(roomId: string, range: HistoryRange): Promise<EventEnvelope[]>
  members(roomId: string): AsyncIterable<MemberSnapshot>
  join(roomId: string): Promise<void>
  leave(roomId: string): Promise<void>
  resolve(ref: Reference): Promise<ResolvedId>  // #alias → opaque id, etc.
}

type Capability =
  | "spaces"      // Matrix only; km topology layer degrades cleanly without it
  | "presence"    // advisory, best-effort
  | "typing"      // advisory
  | "threads"     // relation type
  | "reactions"   // relation type
  | "structured"  // custom event types
  | "dm"          // 1:1 room shortcut
  | "admin"       // create room, invite, power levels
```

**Not in the core**: spaces, presence, typing, threads, reactions, structured events, DM. All gated by capabilities. Adapters without a given capability degrade gracefully; km UI renders what's available.

**Model detail**:
- `EventEnvelope` carries: `id` (opaque), `roomId`, `sender`, `ts`, `relatesTo?` (for edits/replies/reactions), `type`, `content`, `customType?` (for structured events).
- `EventDraft` includes `txnId` for idempotent send.
- Cursors are opaque tokens; adapters define their ordering semantics.
- Edits and redactions are **new events with `relatesTo`**, never overwrites.

**Room topology (spaces, per-repo hierarchy)** lives in **km's topology layer**, not in core `Room`. Core `Room` exposes a `spaces` capability for adapters that support it; km's topology uses it when present, falls back to flat `<repo-id>/<channel>` naming when absent.

## Persona model

**Personas are durable; sessions are ephemeral.** The same persona can be assumed by different Claude Code sessions over time (sequentially by default, opt-in multi-device later).

### Persona file schema

Personas split into **durable identity** (committed, human-edited) and **volatile runtime state** (not committed, machine-written).

**Durable**: `agents/<name>.md` — mission, skills, working memory. Human-authored. Filename is an alias; `persona_id` is the stable identity.

```markdown
---
persona_id: "ag_3f9a1e2c"                 # stable; never changes on rename
matrix_id: "@silvery-refactor:matrix.beorn.dev"
aliases: ["silvery-refactor"]              # filename is one of these
focus: ["silvery", "refactoring"]
rooms: ["#silvery", "#design", "#general"]
style: ["tdd", "small-commits", "recall-first"]
created: 2026-04-15
---

# silvery-refactor

## Mission
Short persistent description of what this agent does.

## Working memory (append-only)
- 2026-04-19T15:00: landed backdrop fade fix (commit a12dc91)
- ...

## Skills
- ...

## Relationships
- Reports to [[agents/chief]]
- Collaborates with [[agents/tui-refactor]]
- Pinged by [[users/beorn]] for silvery questions
```

**Volatile**: `agents/.state/<persona_id>.json` — `last_active`, `last_session`, current lease. Gitignored by default. Regenerated from Matrix state events if lost.

```json
{
  "persona_id": "ag_3f9a1e2c",
  "last_active": "2026-04-19T15:00:00Z",
  "last_session": "sess_abc123",
  "current_lease": {
    "session_id": "sess_abc123",
    "device_id": "beorn-laptop",
    "epoch": 7,
    "expires_at": "2026-04-19T15:30:00Z"
  }
}
```

Rename = edit `aliases`, move file path. Identity (`persona_id`) is preserved. Matrix user is preserved.

### Assumption lifecycle (with lease)

Single-holder is enforced via a **lease** (expiry + heartbeat + fencing token), not by presence or login alone. Presence is not a lock; Matrix login is not a lock.

- **Startup** (`claude --agent silvery-refactor`):
  1. SessionStart hook reads the persona file + current state file + latest Matrix state event.
  2. Checks for active lease: if valid and owned by another `session_id`, refuses to assume (or warns + proceeds as advisory, per flag).
  3. Writes a new lease (`session_id`, `device_id`, `epoch = max(prev) + 1`, `expires_at = now + 5min`).
  4. Confirms lease via sync (read-your-write); only then assumes.
  5. Logs in as the matrix user, joins rooms, injects persona body as seed context.
  6. Starts heartbeat: every 2min, extend `expires_at` + bump `last_active`.

- **Shutdown** (graceful): revoke lease, append summary to working memory, commit durable file changes (not state file).

- **Crash**: lease expires naturally after 5min. Next session sees expired lease, can claim it. Stale holder (if it somehow comes back) sees its lease was superseded via higher `epoch`, stops sending as that persona.

- **Cross-machine exclusivity**: a lease in the Matrix state event provides global coordination. Without Matrix, advisory only (documented).

**v1 scope honest note**: if Phase 1 ships before the lease mechanism is fully tested, treat exclusivity as **advisory** and document it. Don't pretend otherwise.

### Single-holder vs multi-device

Single-holder by default (one lease at a time). Opt-in multi-device mode: `claude --agent silvery-refactor --device laptop --multi-device`. Multi-device uses Matrix's native multi-device support; all devices share persona identity but each session has its own `device_id`; the lease mechanism coordinates across devices via the fencing epoch.

### Spawning and archiving

- `km agent create <name> --focus=... --room=...` — mints a new `persona_id`, creates the file, provisions the matrix user, invites to rooms.
- `km agent archive <name>` — only if no active lease (or `--force`). Moves to `agents/_archive/`, revokes matrix credentials, tombstones identity.
- `km agent revive <name>` — inverse; re-provisions credentials.
- Hard delete is not a normal operation. Tombstones preserve history.

### Chief as role lease, not persona

**Chief is a role, not a persona.** Personas are the who; roles are the what. Any persona can hold the chief role; multiple rooms can have different chief-holders.

- Chief is a **room-scoped lease**: "@silvery-refactor holds chief in #silvery until 15:30; @chief-km holds chief in #km".
- Lease lives in a Matrix state event (`m.km.role.chief` in the room). Power levels mirror the lease for matrix-native ACL where relevant.
- Handoff = release + claim via a post. No election code; the lease is the source of truth.
- `agents/chief-<room>.md` does NOT exist as a persona file. `roles/chief-<room>.md` could exist as a *role description* (what "chief" means in that context), but that's a separate concept.

## Structured event types

Agents emit both human-readable text AND machine-parseable structured data, using Matrix's custom event type system. Examples:

- `m.room.message` + `m.km.bead.claim` — "alice claimed km-silvery.foo" plus structured `{bead_id, from_id}`
- `m.room.message` + `m.km.persona.update` — persona file changed
- `m.room.message` + `m.km.session.start` / `m.km.session.end` — lifecycle events

Plain matrix clients (Element) show the text. Km-aware clients can act on the structured part.

## Addressing & sigils

Following IRC/Matrix/Slack conventions:

- `@alice` in messages → matrix native mention → `@alice:matrix.beorn.dev`
- `@silvery-refactor` → agent persona, same resolver
- `#design` → channel, resolved against current space → `#design:matrix.beorn.dev`
- `[[agents/silvery-refactor]]` → km wikilink → persona file + matrix user profile
- `[[chats/design]]` → channel view in km
- Cross-repo: `#design:decker-matrix.beorn.dev` (full mxid) or via space-aware resolution

## Storage & sync

### Events are immutable; files are projections

The Matrix room is the source of truth. `chats/` on disk is a derived, read-rendered projection of the event stream. Posting happens through the `Room` API, never by editing a file.

- **Raw event journal** → `chats/<channel>/_events/<ts>-<event-id>.json` — append-only, one file per event, never modified.
- **Rendered view** → `chats/<channel>/<cursor>.md` — periodically regenerated from the event journal, shows the current rendered state (with edits/redactions applied).
- **Edits (m.replace)** → NEW event in `_events/` that references the prior event via `relatesTo`. Renderer applies the edit when rebuilding the view.
- **Redactions** → NEW event (tombstone). Renderer respects.
- **Threads** → flat event storage; rendered nested via `relatesTo` parent chains.
- **Typing / presence / receipts** → ephemeral, not persisted.

Operational rule: **editing `chats/<channel>/*.md` directly has no effect** on Matrix. To change a message, post an edit through the `Room` API. The renderer will update the file.

### fs.watch is advisory, not authoritative

Don't use `fs.watch` as delivery semantics — it coalesces and drops events platform-variant. The authoritative read path is: read from `_events/` journal + cursor + periodic poll for new events. `fs.watch` is a wakeup hint only.

### Git policy per room class

Two room classes, different defaults:

- **Ledger rooms** (decisions, design discussions, retros): committed to git. `chats/design/` in the tracked tree.
- **Chatter rooms** (general, stand-ups, ephemeral): gitignored by default. `.gitignore chats/general/**`. Opt-in commit via repo policy flag.

Default policy: `chats/**` is gitignored unless explicitly opted-in per room. Prevents repo pollution from high-volume chatter.

Individual `_events/` journals may also be gitignored entirely if the Matrix room is considered the durable store.

### Repo identity persisted from Phase 0

Every km repo gets a stable `repo_id` at first-run, persisted in `.km/repo.json` (or equivalent km-storage record). The Matrix space alias is derived from `repo_id` deterministically. This prevents multi-machine clones from creating duplicate spaces or de-syncing topology.

### Network reachability: explicit modes

Phone observability via Element REQUIRES the homeserver be reachable from the phone. Localhost-binding excludes this. Three deployment modes, chosen explicitly:

1. **Local-only** (default for spike + dev): homeserver on `127.0.0.1`, no mobile access. Simplest.
2. **Tailscale / mesh-VPN** (recommended for personal use): homeserver bound on Tailscale interface, phone joins Tailscale, Element reaches the host. TLS via Tailscale internal cert or Let's Encrypt via MagicDNS.
3. **Public with TLS** (for small-group collaboration): reverse proxy (Caddy) with automatic TLS, homeserver bound on loopback, proxy exposes WSS externally.

`km matrix init` prompts for mode; default is (1). Switching modes is a single config change.

### Encryption

Start unencrypted in Mode 1 (trusted single-user localhost). Enable E2E when:
- Operating in Mode 2 or 3
- Sharing a space/room with a collaborator
- Bridging to a public matrix network

E2E complications (device verification, key sharing for bot accounts, multi-session key rotation) are real and addressed incrementally. Phase 5 deliverable.

## Channel view in silvery

New view type alongside cards/columns/tabs: **channel view**.

- Files sorted newest-at-bottom (toggle for newest-at-top)
- Each file renders as a message card (author + timestamp + body + reactions)
- Input box at bottom = post new message (appends file + emits matrix event)
- Thread grouping: replies nested visually, stored flat
- Presence bar: live members from matrix presence
- Typing indicators from matrix

## Phased rollout

### Phase 0 — `Room` interface + minimal adapters + chaos conformance (5-6 days)
- Design the `Room` interface (`@bearly/room`): event-log core + capability set + shared event/cursor/ref types.
- Implement `@bearly/room-memory` (in-process, for tests) — ~100 LOC.
- Implement `@bearly/room-file` (append-only jsonl journal + polling, fs.watch as wakeup hint) — ~300 LOC.
- **Chaos conformance wrapper** — a thin wrapper over any adapter that injects delayed delivery, duplicates, out-of-order events, dropped presence, reconnect gaps. Phase 0 adapters must pass the conformance suite under chaos.
- Skeleton `@bearly/tribe` MCP server consuming a `Room` instance. Tools: `tribe.broadcast`, `tribe.send`, `tribe.members`, `tribe.history`.
- `repo_id` persistence: `.km/repo.json` written on first-run if missing.
- Validate: two Claude Code sessions, same room, see each other's hellos. With chaos wrapper active, invariants still hold (no duplicates delivered to the consumer, ordering preserved, reconnect resumes cleanly).

Deliverable: interface exists, two adapters prove it under adversarial conditions, tribe runs on either. No Matrix yet — we validate semantics, not just API shape.

### Phase 1 — Matrix adapter + homeserver (4-5 days)
- Implement `@bearly/room-matrix` wrapping `matrix-js-sdk`. Declares all capabilities (presence, threads, reactions, structured, dm, spaces, admin).
- Passes the same chaos conformance suite.
- Homeserver options: **Synapse** (mature, Python, well-understood) OR **Conduit** (Rust, smaller, newer). Default to Synapse for maturity; Conduit as opt-in for users who prefer the Rust single-binary footprint. No Docker-first — prefer native install via systemd/launchd user service with the server's own install path.
- `km matrix init` command: sets up the homeserver (user chooses Synapse or Conduit), chooses network mode (local-only / tailscale / public-TLS), creates the space for current repo, registers the user's matrix account, writes tribe config pointing at `room-matrix`.
- Tribe works identically on `room-matrix` as it did on `room-file` in Phase 0.
- Element connects and reads the room (in tailscale / public-TLS mode).

Deliverable: Matrix is the production adapter. Two Claude Code sessions on different machines coordinate through the user's homeserver. Phone-observable from Element when network mode supports it.

### Phase 2 — personas + durable identity (3-5 days)
- Persona file loading at SessionStart; identity binding.
- `agents/` and `users/` directory materialization (files mirror matrix users).
- `km agent create/archive/revive` commands.
- Working memory append-on-session-end.

Deliverable: `claude --agent silvery-refactor` works across restarts. Personas persist; sessions are ephemeral.

### Phase 3 — km TUI integration (1-2 weeks, silvery work)
- Channel view type in silvery.
- Directory listing → channel view when `chats/*/` detected.
- `@mention` / `#tag` resolver extended with Room context.
- Presence indicators driven by `room.capabilities.has("presence")`.
- Uses the `Room` interface — not matrix-specific.

Deliverable: read and post to chat from inside km-tui. Works identically regardless of adapter.

### Phase 4 — structured events + bead threading (1 week)
- `m.km.*` custom event types via `room.customEvent()` (guarded by `capabilities.has("structured")`).
- Bead claim → structured event → channel post.
- Per-bead thread auto-created on claim (optional per policy).
- Adapters without structured-event support fall back to plain text messages.

Deliverable: beads and chat are the same conversation on Matrix. Adapters that can't express structured events degrade gracefully.

### Phase 5 — deferred / optional
- E2E encryption on `room-matrix` (when we bring in a collaborator)
- `@bearly/room-openclaw` adapter (when you want the cross-platform bridges)
- `@bearly/room-xmpp`, `-slack`, `-discord`, `-irc` adapters (as needs arise, community contributions welcome)
- Matrix federation (when you want to share a space with someone)

## What retires

- `@bearly/tribe` daemon (8,300 LOC) → deprecated after Phase 2 lands. The new `@bearly/tribe` (adapter-based) is the successor.
- km-tribe.delivery-correctness shipped fixes remain correct for however long the old daemon runs; no rush.
- km-tribe.minimal-protocol bead → closed as superseded, pointing to this DR.
- km-tribe.stable-identity / daemon-authority / scope-model / role-register-cleanup / plugin-boundary-tightening / polish-v2 → all dissolve under the adapter + persona model.

`@bearly/recall` continues as-is (standalone FTS + LLM search).

## Explicit non-goals

- **No OpenClaw dep yet.** Future bridge via matrix is the path; no code dep today.
- **No custom wire daemon.** Everything rides on Matrix (Synapse or Conduit).
- **No top-down orchestration.** Agents are peers in rooms; chief is a role anyone can assume, not a master.
- **No Matrix-federation-first.** Single homeserver, localhost-bound, user-global. Federation is a later toggle.
- **No pure-federation design**. We don't try to replicate state across untrusted peer matrix servers. One user, their homeserver, that's the scope.

## Open questions (defer to Phase 0 spike)

1. **Server choice default**: Synapse (mature) is the Phase 1 default. Conduit is opt-in. Re-evaluate Conduit's maturity for future default status.
2. **Matrix account registration UX**: on first `km matrix init`, does the user type a username, or do we generate?
3. **Persona credential storage**: `~/.km/matrix/<persona>.token` (filesystem-perm-protected) or OS keychain? Platform-dependent.
4. **Silvery channel view fidelity**: reactions, typing, thread expansion — which matter enough to build in Phase 2 vs defer?
5. **Default encryption policy**: off for local, on for federated. How do we detect/switch?

## Package layout

Split into focused packages along the adapter boundary:

- **`@bearly/room`** — the `Room` interface + `Capability` enum + shared types. Zero runtime deps. ~200 LOC.
- **`@bearly/room-memory`** — in-process adapter, for unit tests. ~100 LOC.
- **`@bearly/room-file`** — filesystem adapter (jsonl + fs.watch). ~300 LOC.
- **`@bearly/room-matrix`** — Matrix adapter, wraps `matrix-js-sdk`. Supports all capabilities including spaces. ~800 LOC.
- **`@bearly/tribe`** — MCP server + persona logic + tribe tools. Consumes a `Room`; substrate-agnostic. ~800 LOC.
- **`@bearly/room-openclaw`** / **`-xmpp`** / **`-slack`** / **`-irc`** — deferred / community.

km-tui channel view lives in the silvery/km-tui codebase and consumes `@bearly/room` directly (not `@bearly/tribe`). This means km's channel view works without tribe, and tribe works without km — both orthogonal users of the same Room abstraction.

## Acceptance criteria

Phase 0 done when:
- [ ] `@bearly/room` interface is stable and documented
- [ ] `room-memory` + `room-file` both pass a shared conformance test suite
- [ ] `@bearly/tribe` skeleton runs on either adapter, config-switchable
- [ ] Two Claude Code sessions in the same repo see each other's broadcasts via `room-file`

Phase 1 done when:
- [ ] `room-matrix` passes the same conformance suite (including chaos), plus spaces/presence/threads
- [ ] `km matrix init` installs + starts the chosen homeserver (Synapse default, Conduit opt-in) as a user-level service; stops cleanly on shutdown
- [ ] Network mode chosen at init (local / tailscale / public-TLS); phone observability works in tailscale + public-TLS modes
- [ ] A fresh km repo auto-creates its matrix space on first `claude` invocation, keyed to the persisted `repo_id`
- [ ] Two sessions on different machines coordinate through the homeserver
- [ ] Element reads the room

Phase 2 done when:
- [ ] Persona files drive agent identity; rename and restart preserve the matrix user (via `room-matrix`)
- [ ] Humans post from Element, agents see via MCP notification
- [ ] `tribe.send to="@chief"` routes to the current chief-persona holder
- [ ] History query works: `tribe.history --channel=#design --since="2h"`

## Budget

Rough scope for Phases 0-4: **~3 weeks** of focused work.

Per-phase:
- Phase 0: 4-5 days (interface + 2 adapters + conformance tests)
- Phase 1: 4-5 days (room-matrix + homeserver install flow + network modes)
- Phase 2: 3-5 days (personas)
- Phase 3: 1-2 weeks (silvery channel view)
- Phase 4: 1 week (structured events + bead threading)

Phase 5 deferred indefinitely. Total new LOC estimated: ~2500 for the adapter layer + tribe + matrix adapter, ~500-1000 for km-tui channel view, ~300 for km agent CLI commands. Minus ~8000 LOC deprecated in the current `@bearly/tribe` daemon.

## Research trail

- `hub/bearly/design/tribe-minimal.md` (v1, v2, v3) — retired custom-wire designs; kept for historical context.
- `/tmp/pro-review-1.txt`, `/tmp/pro-review-2.txt` — GPT 5.4 Pro reviews of tribe-minimal v1; flagged structural issues that this DR addresses.
- `/tmp/pro-review-v2-1.txt`, `/tmp/pro-review-v2-2.txt` — Pro reviews of v2; led to the simplification chain ending here.
- `/tmp/tribe-prior-art-1.txt`, `/tmp/tribe-prior-art-2.txt` — Multi-agent coordination prior art surveys. Both recommended "local user-global daemon + small journal + external truth owners." Matrix-with-Conduit sits in that quadrant.
- `/tmp/xmpp-research-1.txt`, `/tmp/xmpp-research-2.txt` — XMPP-vs-Matrix surveys. Agreed XMPP is smaller but lacks the structural primitives (Spaces, custom event schema) this DR needs.
- Live scans: OpenClaw (40k+ LOC, Karpathy-critiqued), Hermes (OpenClaw-shaped), Nanoclaw (5k LOC, container-isolated, single channel), pi-mom (uses Slack), Gas Town (beads + git, no wire).

## Next action

Start Phase 0 spike. Target: `@bearly/room` interface + `room-memory` + `room-file` + `@bearly/tribe` skeleton, within 4-5 days. Two Claude Code sessions see each other's hellos via `room-file`. Then Phase 1 (Matrix adapter + Conduit) brings the production loop.
