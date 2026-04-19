# tribe-minimal — canonical write protocol + journal authority

**Status**: Design spec, revised 2026-04-19 after GPT 5.4 Pro deep review. Internal / WIP.
**Bead**: km-tribe.minimal-protocol
**Dissolves (partially, after execution)**: km-tribe.daemon-authority, km-tribe.role-register-cleanup, km-tribe.plugin-boundary-tightening, km-tribe.polish-v2
**Complements**: km-tribe.delivery-correctness (shipped), km-tribe.stable-identity (now subsumed here), km-tribe.testing (still needed)
**Separate RFC (not this spec)**: km-tribe.scope-model — multi-scope / machine-global daemon is its own decision.

## What changed from the v1 spec

v1 (2026-04-19 morning) proposed "three wire forms, zero others" + lore extraction + per-machine multi-scope bundled as one change. Pro review landed two independent critiques that converged on the same findings:

- **Stable id was overloaded.** v1 derived `id = sha256(claudeSessionId || pid || role || project)[:16]` and tried to make the id alone carry all continuity semantics across restarts. But this system is **ad-hoc team coordination, not a distributed-systems protocol** — users refer to each other by name, not hex strings. v2 uses a simpler id formula (no `pid`, no `role`) and lets **names** carry user-facing continuity ("alice is still alice after a restart"); the id is a backend token only, and adoption-by-name swaps it transparently when a participant rejoins.
- **Read-side bootstrap was missing.** Deleting `members`/`history`/`chief`/`retro` without a replacement snapshot/query RPC pushes N client reimplementations and breaks cold-start readers.
- **Lore is not a mere observer.** It has synchronous query RPCs (`tribe.ask`, `tribe.brief`). Extracting it to a summary-post-only peer = product regression.
- **Implicit SQLite `rowid` is not a durable cursor.** Rows can change rowid under `VACUUM`. Durable sequence needs explicit `seq INTEGER PRIMARY KEY`.
- **Crash-recovery liveness gap.** Pure journal projection of "who's live" is wrong after `SIGKILL` leaves ghost `join` events.
- **Plugin process explosion.** N peer processes on day one was over-ambitious. ONE observer host first, split only where failure isolation demands it.
- **Cross-scope infected everything** — cursors, dedup, chief projection, retention, plugin lifecycle. Separate RFC.

The revision keeps the core insight — **journal is authority, daemon is thinner, plugins are out-of-process** — and removes the overreach.

## The reframe, restated

**The daemon is a journal writer + fanout multiplexer + small read/admin surface. Sessions, chief, and coordination state are reducer-backed materialized views over the journal, not in-memory mutable state. Plugins live in a separate observer host process. Lore stays in-process behind a narrow query bridge until its extraction gets a dedicated RFC.**

This is still a significant simplification:
- `register` vs `tribe.join` collapses to one `hello` lifecycle.
- `tribe.send` vs `tribe.broadcast` collapses to one `post` write.
- The `chiefClaim` mutable global becomes a reducer over join/leave/claim events.
- Role/name-prefix magic disappears.
- Plugins sit behind a real process boundary, not a TS interface.

But it keeps:
- A small read/admin surface (`members`, `chief`, `history`, `state`, `dedup.claim`) so clients don't reimplement projections.
- Daemon as the sole writer to SQLite (WAL single-writer model).
- Per-project daemon (no scope sprawl).
- Lore's current synchronous query surface.

## The wire

JSON-RPC over Unix socket (unchanged transport).

### Methods a participant may call

| Method | Purpose | Reply |
|--------|---------|-------|
| `hello` | Join the tribe; single-shot per connection | snapshot + replay-base + daemon epoch |
| `post` | Append to the journal; daemon fans out to subscribers | `{id, seq, ts}` |
| `members` | Snapshot current participants | array of `{id, name, claims, joined_at_seq}` |
| `chief` | Current chief id (derived) | `{id, name}` or `null` |
| `history` | Read back journal slice with filters | paged `{rows, next_seq}` |
| `state.get` / `state.set` | Typed coordination KV (replaces `coordination` table's current RPC usage) | value / ack |
| `dedup.claim` | Atomic first-wins claim | `{claimed: bool}` |
| `retro` / `debug` / `health` / `reload` | Admin surface preserved | typed results |
| `lore.*` | Lore's existing query surface — untouched in this RFC | typed results |

### Notifications the daemon pushes

- `channel` — one notification per delivered journal row for this participant. Shape below.

### `hello` — join

```jsonc
// participant → daemon
{
  "method": "hello",
  "params": {
    "id": "<16-hex>",                    // per-connection id, see "identity" below
    "name": "tribe-refactor",            // the primary handle — pick well, see "identity"
    "claims": ["watch"],                  // optional capability claims (addressable as @watch)
    "protocolVersion": 5,
    "lastSeenSeq": 12340                  // optional: resume from here
  }
}
```

Daemon response:

```jsonc
{
  "result": {
    "accepted": true,
    "id": "<echo>",
    "name": "<accepted-name>",            // daemon may suffix -2 on collision; see naming
    "nameWarnings": [ "another tribe-refactor exists; consider renaming" ],
    "namingNorms": "kebab-case; 2-4 tokens; describe your focus, not your identity",
    "adopted": true | false,              // true if this hello resumed a prior session by name
    "daemonEpoch": "<epoch-id>",          // changes every daemon boot
    "replayBaseSeq": 12340,               // the seq AFTER which replay begins
    "currentSeq": 12503,                  // journal tip at hello time
    "chief": { "id": "<id>", "name": "..." } | null,
    "members": [ /* {id, name, claims, joined_at_seq} */ ]
  }
}
```

On rejected names (too generic, e.g. `member-12345`, `agent`, `session-abc`), daemon
responds with `{accepted: false, error: "name-too-generic", nameWarnings: [...], namingNorms: "..."}`
and the agent retries with a better name.

The `replayBaseSeq..currentSeq` range tells the participant exactly what they're about to receive via `channel` before the connection is "live." After delivering up to `currentSeq`, the daemon emits a `channel.sync` notification so the client can distinguish "replaying history" from "now live."

### `post` — write

```jsonc
// participant → daemon
{
  "method": "post",
  "params": {
    "to": "alice" | "@chief" | "*" | ["alice", "bob"],
    "type": "notify" | "bead.claim" | ...,
    "content": "hello",
    "bead_id": "km-tribe.foo",            // optional
    "ref": "<message-id>"                 // optional
  }
}
```

**Addressing is user-friendly first, id-based as backend detail.** This is team
coordination, not a distributed-systems protocol — people and agents address each
other by handle and role, the way you would in Slack or on IRC. The `to` field
accepts:

- **`"alice"`** — by name. The primary form. Names are unique per tribe.
- **`"@chief"`** — by role. Resolved at write time via the chief projection.
  Other reserved role-addresses: `"@observers"`, `"@watchers"`. Any role/claim
  a participant asserts in `hello` becomes addressable as `@role-name`.
- **`"*"`** — broadcast.
- **`["alice", "bob"]`** — multi-recipient; expands to one row per recipient.

The daemon resolves the `to` field at write time and stores both the resolved
`to_id` AND the `to_name` snapshot on each journal row. If alice later renames
herself to `alice2`, historical rows still show `to_name="alice"` — conversation
context survives rename. If there's no participant currently holding a given
name or role, the post is rejected with a typed error (the sender learns
immediately; no silent drop to a void).

Directs write one row per recipient (not a comma-joined string) so replay,
unread counts, and per-recipient filtering stay well-indexed.

Daemon reply: `{ "id": "<uuid>", "seq": 12504, "ts": 1713489000000,
"resolved": [{ "to": "alice", "to_id": "<id>" }, ...] }`.

### `channel` — receive

```jsonc
// daemon → participant
{
  "method": "channel",
  "params": {
    "id": "<message-uuid>",
    "seq": 12504,
    "from_id": "<stable-id>",
    "from_name": "bob",                   // display snapshot at write time
    "to_id": "<id>" | "*",
    "type": "notify",
    "kind": "post" | "event",
    "content": "hello",
    "bead_id": null,
    "ref": null,
    "ts": 1713489000000,
    "phase": "replay" | "live"
  }
}
```

`channel.sync` notification (no params) signals the transition from `phase="replay"` to `phase="live"`.

## Identity — name-first, role-aware, id as backend

**This is ad-hoc team coordination, not a distributed-systems protocol.** The design prioritises how humans and agents actually refer to each other — by name and by role — over theoretical stable-id purity. Think Slack/IRC, not Raft.

Three layers, in order of importance to users:

### 1. Name — the primary handle

**Names are the handle everyone uses to address each other.** They are unique per tribe at any point in time (the daemon enforces uniqueness on `hello` and rename). They are meaningful, not auto-generated.

**Getting a good name is first-class work for agents.** Today too many participants end up as `member-12345` because nothing pushes them to do better; that's the failure mode this spec fixes. An agent joining a tribe should:

- Pick a name that reflects its actual focus, not its PID. Examples: `tribe-refactor`, `km-tui-perf`, `docs-cleanup`, `cvss-sweep`, `chief`.
- Derive the name from real signals: the bead it's claiming, the package it's working in, its sub-agent's task description, the user's stated goal for the session.
- Rename itself as focus shifts — "I started as `general` but I'm now really doing the tribe refactor" → `post type="session.rename" to="@self" name="tribe-refactor"`.
- Treat rename as cheap and normal, not a special event.

**The daemon enforces name quality.** `hello` rejects obviously low-effort names:

- `member-\d+`, `session-\d+`, `bun-\d+`, `agent` (generic), any name ending in a long number suffix, empty/whitespace-only names.
- On reject, the daemon returns the list of current names in the tribe + a short guidance message so the agent can retry with something better.
- On collision with a living session, the daemon suffixes (`alice` → `alice-2`) but also emits a warning in the `hello` response: "another alice exists; consider renaming."

**The daemon publishes naming norms** in its project-scoped config (e.g. "use kebab-case; 2-4 tokens; describe focus, not identity"). Agents see these in `hello` response and can steer accordingly.

### 2. Role / claims — addressable capability

**Roles are addressable too.** `post to="@chief"` routes to whoever currently holds the chief role, resolved at write time. Claims declared in `hello` (`["watch"]`, `["observer"]`, custom roles) all become addressable as `@role-name`.

Reserved roles: `chief`, `observer`, `watcher`. Any participant can claim any non-reserved role in `hello`; claiming a reserved role goes via the normal post-based handoff flow (`chief.claim` / `chief.release`).

### 3. id — backend continuity token

**The id is for the daemon's bookkeeping, not the user's mental model.** Users never see ids; they see names. But the daemon needs a stable per-session token because:

- The delivery cursor needs to survive rename (alice renames to alice2; her cursor position shouldn't reset).
- Historical journal rows record `from_id` + `from_name` snapshots so a replayed conversation still shows who said what, even after renames.
- Observers/watchers need to track who is who across name changes.

**Id generation rule:**

```
id = sha256(project_realpath + "\0" + claude_session_id)[:16]
```

If no `claude_session_id` is available (plugin peers, CLI ad-hoc invocations), the participant generates a random UUID per connection. The daemon never mints ids — participants assert them in `hello`.

**The id formula deliberately does NOT try to span Claude Code restarts.** That's what **names** are for. If alice restarts Claude Code and rejoins with name `alice`, the daemon recognises her by name:

1. Is there a `_proj_participants` row with name=alice whose session's socket is currently dead (no live connection)?
2. If yes, adopt: transfer her `last_delivered_seq` from the dead session to the new id; mark the old session as `left` in projections; welcome her back with her prior cursor intact.
3. If no (alice is a brand-new name), seed a fresh cursor at `currentSeq`.

This is how humans think about it: "alice is still alice, even though her Claude Code process is new." The backend bookkeeping handles the id swap transparently.

### Why this is not the v1 formula

v1 tried to make the id alone carry all continuity semantics — `sha256(claude_session_id || pid || role || project)`. Pro correctly pointed out that `pid` + `role` are not stable; including them churns ids for no benefit.

v2 separates concerns: **name carries user-facing continuity** (alice stays alice); **id carries within-session technical continuity** (survives rename, drives cursor). Neither has to do the other's job. That's what makes the model simple enough for humans and precise enough for the journal.

## Materialized projections (cached views)

The journal is the truth. The daemon maintains cheap-to-read, rebuildable-from-journal tables:

```sql
CREATE TABLE _proj_participants (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  claims       TEXT NOT NULL DEFAULT '[]',
  joined_seq   INTEGER NOT NULL,
  left_seq     INTEGER              -- null means currently joined
);

CREATE TABLE _proj_chief (
  singleton    INTEGER PRIMARY KEY CHECK (singleton = 0),
  id           TEXT,                -- current chief id, nullable
  derived_seq  INTEGER NOT NULL      -- last journal seq reflected
);

CREATE TABLE _proj_state (
  project_id   TEXT NOT NULL,
  key          TEXT NOT NULL,
  value        TEXT,
  set_by_id    TEXT,
  set_at_seq   INTEGER NOT NULL,
  PRIMARY KEY (project_id, key)
);

CREATE TABLE _proj_meta (
  last_applied_seq INTEGER NOT NULL
);
```

On every `post` that advances join/leave/claim/release/state semantics, the daemon updates both the journal row and the matching projection atomically in the same transaction. On daemon boot, the projections rebuild from the journal starting at `_proj_meta.last_applied_seq` (typically zero on first boot, journal tip on clean restart).

**Why cached, not pure-recompute**: pro reviews argued — correctly — that pushing projection cost into every client call would regress performance and make cold-start clients reimplement the reducer logic N times. Keeping the projections in the daemon preserves the simple `members`/`chief` RPCs and makes them cheap.

**Why still "journal is authority"**: any projection can be dropped and rebuilt from the journal. Corruption in a projection table is a routine recovery (DELETE + replay); corruption in the journal is a real outage.

## Durable sequence: explicit `seq`

SQLite's `rowid` is not a durable cursor — it can change under `VACUUM`. The `messages` table (keep the name; the rename is cosmetic and not worth migration risk) gets a new column:

```sql
ALTER TABLE messages ADD COLUMN seq INTEGER;
CREATE UNIQUE INDEX idx_messages_seq ON messages(seq);
-- Backfill: seq = rowid for existing rows.
-- Future inserts: explicit max(seq)+1 under the single-writer lock.
```

`sessions.last_delivered_seq` now references the explicit `seq`, not rowid. Migration v10 in `database.ts` handles the backfill and switches the replay query to use `seq` instead of `rowid`.

## Plugins — observer host process

Plugins today share the daemon's event loop via `TribePluginApi`. New model:

1. Daemon spawns ONE observer-host process (`bun tools/tribe-observer.ts`) at boot.
2. Observer host connects to the daemon over the socket with `id = sha256("observer-host" + project_realpath)` and `claims: ["observer"]`.
3. Each built-in observer (git / beads / github / health / accountly) runs inside the host process, subscribing to the daemon's channel and `post`ing back.
4. Observer host exposes the existing plugin helpers (`dedup.claim`, `hasRecentMessage`, roster snapshot) via the daemon's read RPCs — no new in-process API surface leaks.

**Why one host, not N**: pro noted that 5 separate bun processes × ~30 MB is a real cost, and launching N processes on day one multiplies operational complexity. One host gets the boundary win (daemon isolated from plugin crashes via observer-host restarts) without paying for process-per-plugin up front. If one plugin starts needing true failure isolation, it can be split out in a follow-up.

The `claims: ["observer"]` marker also tells the daemon "don't count this session toward `autoQuit` liveness" — so a daemon with only the observer host connected still auto-idles correctly.

## Lore — unchanged in this RFC

Pro pushed back hard on extracting lore in Phase 1: its sync-query surface (`tribe.ask`, `tribe.brief`) is real product behavior, and extracting it to summary-posts-only would be a regression.

Decision: **lore stays in-process behind its existing handler surface.** Its sync RPCs are kept as-is. The summarizer's *writes* into lore can flow through `post type="lore.summary"` once the wire is ready, but the *reads* (sync query) stay callable directly.

Lore extraction gets its own follow-up RFC if/when the cost of in-process coupling outweighs the convenience. That's not this RFC.

## What survives, what changes

### Survives (untouched)
- Per-project daemon, Unix socket, JSON-RPC transport.
- `messages` table name and structure (plus the new `seq` column).
- `_schema_meta` versioned migrations.
- `sessions(id, last_delivered_ts, last_delivered_seq)` for delivery cursors.
- `dedup`, `retros` tables and their RPCs.
- Lore in-process + its sync query RPCs.
- km-tribe.delivery-correctness fixes (paginated replay, no-DELETE-on-disconnect, cursors/reads drop). Load-bearing under the new design.
- All read/admin RPCs: `members`, `chief`, `history`, `state.get/set`, `retro`, `debug`, `health`, `reload`.

### Changes
- `register` RPC → `hello` method. Same connection-level handshake, clearer response shape with snapshot + replayBase + daemonEpoch.
- `tribe.send` + `tribe.broadcast` → `post` method with `to_ids`.
- Directs are one row per recipient (good for indexing + unread), not comma-joined strings.
- Ids are stable and participant-asserted; routing is id-based; names are display snapshots in `channel`.
- `role` column on `sessions` → encoded as `claims` JSON array; observer host uses `claims: ["observer"]` (replaces watch/member/pending name-prefix and role-column dual encoding).
- `coordination` table access moves behind `state.get`/`state.set` RPCs (unchanged semantics, tidied API).
- Chief becomes a derived-and-cached projection instead of a mutable global.
- Plugins move from in-process to the observer host process.
- Explicit `seq INTEGER` column on `messages`; durable cursors reference `seq`, not rowid.

### Dissolves
- `TribePluginApi` / `TribeClientApi` / `plugin-loader.ts` — plugins use the wire, not a TS interface.
- `role` column (migration v11 after observer host is live and the claims encoding is in).
- `chiefClaim` mutable global — replaced by `_proj_chief.id` + a `post` with `type="chief.claim"` or `type="chief.release"`.
- `handleClaimChief` / `handleReleaseChief` — dispatched via `post` types instead.

## Crash recovery — daemon epoch

Every daemon boot generates a fresh `daemon_epoch` (UUID). Returned in the `hello` response. Stored in `_schema_meta.value` under key `epoch`.

Liveness rule for projections: a participant is "live" iff they have a `session.join` event *whose seq ≥ the latest `daemon.boot` event's seq* AND they have no subsequent `session.leave` event. This closes the "ghost join" gap that pure journal-projection liveness would have after `SIGKILL`.

On boot, the daemon writes a `daemon.boot {epoch}` event at the journal tip before accepting any connection.

## Acceptance criteria (revised)

- [ ] `hello` method exists; returns snapshot (`members`, `chief`), `replayBaseSeq`, `currentSeq`, `daemonEpoch`, `adopted` flag, `namingNorms`.
- [ ] `channel.sync` notification emitted once replay reaches `currentSeq` from the hello response.
- [ ] `post` method exists; direct posts write one row per recipient.
- [ ] Addressing is name-first: `to: "alice"`, `to: "@chief"`, `to: "*"`, `to: ["alice","bob"]` all resolve. `channel` payload always includes `from_id` AND `from_name` snapshot.
- [ ] Name policy enforced at `hello`: generic patterns (`member-\d+`, `agent`, `session-*`, empty) rejected with guidance. Collisions suffix-renamed with a `nameWarnings` entry encouraging rename.
- [ ] Name-based session adoption: a participant reconnecting with the same name takes over the dead-socket prior session's cursor (id swaps, cursor persists).
- [ ] Id formula uses only durable inputs (project realpath + claude_session_id) OR random UUID fallback. No `pid`, no `role`, no mutable state. Id churn does NOT break user-facing continuity — name does that.
- [ ] `_proj_participants`, `_proj_chief`, `_proj_state`, `_proj_meta` tables exist and are updated atomically with the corresponding journal writes.
- [ ] `messages.seq INTEGER` column exists and is unique; `last_delivered_seq` references it.
- [ ] `daemon.boot` event is written on every boot with a fresh `epoch`; liveness uses it.
- [ ] Observer host process spawns at daemon boot (unless `TRIBE_NO_OBSERVER=1`); `claims: ["observer"]` excludes it from auto-quit liveness counting.
- [ ] Legacy `register` / `tribe.send` / `tribe.broadcast` RPCs still work as shims during Phase 1.
- [ ] Read/admin RPCs (`members`, `chief`, `history`, `state.get`, `state.set`, `retro`, `debug`, `health`, `reload`) are unchanged in behavior.
- [ ] All lore RPCs continue to work.
- [ ] Existing slow tests (`tribe-durability`, `tribe-self-heal`, `tribe-session-identity`, `tribe-unified-daemon`, `tribe-plugin-boundary`, `tribe-role-typing`, `derive-chief`) pass.
- [ ] One new slow test: `tribe-minimal-protocol.slow.test.ts` — hello snapshot + id-based routing + replay/sync transition + daemon-epoch crash recovery.

## Migration — 5 phases

### Phase 0 — data-model prep (no wire change)
- Add `messages.seq INTEGER` column + unique index; backfill from `rowid`.
- Add `_proj_participants`, `_proj_chief`, `_proj_state`, `_proj_meta` tables (empty; unused yet).
- Add `daemon.boot` event writer on startup.
- Switch `sessions.last_delivered_seq` references from `rowid` to `seq` in replay + fanout paths.
- Migration v10 in `database.ts`.

**Effort**: half day. Zero user-visible change. All existing tests must pass unchanged.

### Phase 1 — canonical write protocol
- Add `hello` method. `register` calls into it as a shim.
- Add `post` method. `tribe.send` / `tribe.broadcast` call into it as shims.
- Directs write one row per recipient.
- `channel` payload carries `from_id` + `from_name`.
- `hello` response returns snapshot + seq range.
- `channel.sync` notification on replay completion.
- Stable id formula changes to durable inputs only (clients assert it in `hello`).
- Observer-host-aware auto-quit counting.

**Effort**: 2-3 days. Worktree-isolated. Old clients keep working via shims.

### Phase 2 — materialized projections + read-side cleanup
- Populate `_proj_*` tables on every relevant journal write.
- Switch `members` / `chief` / `state.*` RPCs to read from projections.
- Write a reducer replay routine for cold start + corruption recovery.
- Once projections are authoritative, drop the `role` column (migration v11).
- Delete `handleClaimChief` / `handleReleaseChief` in favor of `post type="chief.claim"` with projection reduction.

**Effort**: 3-4 days.

### Phase 3 — observer host process
- Implement `tribe-observer.ts` as a daemon-spawned peer.
- Migrate each plugin (git, beads, github, health, accountly) to the host.
- Delete `plugin-api.ts`, `plugin-loader.ts`, in-process plugin registration.
- Observer host uses the same `hello`/`post`/`channel` wire as any other participant.
- Daemon's `autoQuit` logic excludes `claims: ["observer"]` sessions.

**Effort**: 2 days.

### Phase 4 — delete write-side legacy
- Drop `register` / `tribe.send` / `tribe.broadcast` shims after a cycle of coexistence.
- Delete dead code in `handlers.ts`.

**Effort**: half day.

### Phase 5 — lore decision (separate mini-RFC)
- Reassess whether lore extraction earns its cost.
- If yes: design the sync-query replacement (probably `lore.*` stays as RPCs on the daemon, but the summarizer process extracts).
- If no: close the bead.

**Effort**: TBD after Phase 4. Likely 2-3 days if we proceed, zero if we don't.

### Separate RFC (not this spec)
- km-tribe.scope-model (multi-scope / per-machine daemon). Revisit only after the above phases land and we have a concrete need for it.

## Effort estimate

Realistic total for Phases 0-4: **~1.5-2 weeks** in a worktree, not the 3-5 days v1 claimed.

Phase 0 alone (half a day) gets us an explicit durable seq + projection table scaffolding — worth doing even if we pause before Phase 1.

## Recommendation

Proceed with Phase 0 immediately. It is low-risk, prep-only, and unblocks everything else. Revisit Phase 1 after Phase 0 is in, with the slow test suite green.
