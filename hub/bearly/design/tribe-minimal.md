# tribe-minimal — journal + fanout, everything else derived

**Status**: Design spike (2026-04-19). Internal / WIP. Not implementation-ready until reviewed.
**Bead**: [km-tribe.minimal-protocol](https://github.com/beorn/km/.beads/)
**Supersedes (if adopted)**: km-tribe.stable-identity, km-tribe.daemon-authority, km-tribe.scope-model, km-tribe.role-register-cleanup, km-tribe.plugin-boundary-tightening, km-tribe.polish-v2
**Complements**: km-tribe.delivery-correctness (already fixed), km-tribe.testing (still needed)

## The problem

The daemon is currently five things:

1. A message bus (write → fanout).
2. A session registry (sessions table, names, roles, identity tokens).
3. A plugin host (loadPlugins with TribePluginApi in-process surface).
4. A memory service (lore handlers absorbed in Phase 5 — summaries, focus cache).
5. A liveness monitor (clients Map, chief derivation, auto-rename on disconnect).

Each added responsibility creates a consistency surface with the others. Every
open pro-review finding is a variant of "the five responsibilities disagree":

| Pro finding | Inconsistency it exposes |
|-------------|--------------------------|
| duplicate register vs tribe.join | bus doesn't know session exists until RPC; registry seeds it early via socket hello |
| role-name prefix magic | registry encodes role in the `role` column AND by name prefix (`watch-*`) |
| chief is a mutable claim on a derived view | registry holds `chiefClaim`; derivation reads clients map |
| plugin-boundary leaks | plugin host reaches into registry + bus internals |
| scope model unclear | is the daemon per-project or per-user? Both, partially. |
| stable identity awkward | tribe.send by name; identity_token is in registry; name can change mid-session |

These aren't independent bugs. They're symptoms of the daemon owning too much
mutable state that the bus would model more simply as messages.

## The reframe

**The daemon is a journal + fanout multiplexer. Everything else is a
projection of the journal or a peer participant.**

- **The wire is the API.** `hello` and `post` are the only two write verbs a
  participant ever sends. `channel` is the only notification verb the daemon
  ever pushes. No more register RPC vs tribe.join duplication, no more
  in-process plugin API distinct from the wire.
- **The journal is the only source of truth.** Sessions, roles, membership,
  chief, lore summaries, retro lessons — all either live as messages
  (kind='post'), as typed journal events (kind='event'), or are derived on
  demand from the journal.
- **Plugins are sessions.** The git/beads/github/health observers connect
  over the socket exactly like a Claude Code session does. No in-process
  plugin host, no `TribePluginApi`.
- **lore is a peer.** The Phase 5 merge was a tactical consolidation —
  the memory service re-emerges as a session that subscribes to posts and
  writes summaries back. Unmerging for principle is clean, not a rollback.

## The minimal protocol

Every participant — Claude Code session, git observer, beads observer, lore,
watch dashboard — opens the same Unix socket and exchanges the same three
message kinds.

### `hello` — join the tribe

```jsonc
// participant → daemon, sent as the first frame on every connection
{
  "kind": "hello",
  "id": "<sha256-hex-truncated-to-16>",   // stable identity (see below)
  "name": "alice",                         // display name, metadata only
  "pid": 12345,
  "cwd": "/Users/beorn/Code/pim/km",
  "claims": ["watch"]                      // optional — see "claims" below
}
```

- `id` is derived by the participant from stable inputs it owns
  (`sha256(claudeSessionId || pid || role || project)[:16]`). Not negotiated —
  the participant asserts it.
- The daemon records the hello as a journal row (kind='event', type='join')
  and remembers `id → socket` in memory for fanout routing.
- Reconnect: same `id`, same `name`. The daemon replays anything past the
  recorded `last_delivered_seq` for this `id`.
- If `id` clashes with a currently-connected `id`, the daemon closes the
  new socket with an error notification. (One connection per `id` at a time.)

### `post` — write to the journal

```jsonc
// participant → daemon
{
  "kind": "post",
  "to": "*" | "bob" | "bob,charlie",       // recipient set
  "type": "notify" | "bead.claim" | ...,   // participant-chosen type
  "content": "hello everyone",
  "bead_id": "km-tribe.foo",               // optional
  "ref": "<message-id>"                    // optional reply-to
}
```

- The daemon assigns the message a monotonic rowid and `ts`, writes it to
  the journal synchronously, and fans out to every connected participant
  matching `to`.
- There is no `send` vs `broadcast` distinction — it's all `post`, differing
  only in `to`. `to: "*"` is a broadcast.
- Events (`kind='event'` on the journal) are posted only by the daemon in
  response to lifecycle transitions (`join`, `leave`, `chief.changed`). The
  wire never lets a participant post events directly.

### `channel` — receive from the journal

```jsonc
// daemon → participant (async notification)
{
  "method": "channel",
  "params": {
    "id": "<message-uuid>",
    "from": "bob",
    "to": "*",
    "type": "notify",
    "kind": "post",
    "content": "hello everyone",
    "bead_id": null,
    "ref": null,
    "rowid": 12345,
    "ts": 1713489000000
  }
}
```

- Same shape for replay (on reconnect, after hello) and live fanout.
- The daemon advances `last_delivered_seq` for the participant's `id`
  immediately after the write succeeds, exactly as the event-bus already
  does today.

That's it. Three wire forms.

## How each current feature maps

### Session registry → journal projection

Today: `sessions` table with id, name, role, pid, cwd, identity_token,
claude_session_id, last_delivered_ts/seq, updated_at.

Minimal: `sessions` table becomes two things:
1. **Delivery cursor** — `(id, last_delivered_seq)`. Still a table, because
   we need durable delivery tracking. This is the minimum residual registry.
2. **Identity snapshot from the last hello** — derived view over the journal:
   `SELECT id, name, pid, cwd FROM (SELECT * FROM journal WHERE type='event.join' ORDER BY rowid DESC) GROUP BY id`.

No role column. No identity_token column (the `id` IS the token). No
updated_at (take the journal's rowid instead).

### `tribe.join` / rename / role change → posts

Today: three separate RPCs that UPDATE the sessions row.

Minimal: `post` with `type="session.rename"` / `type="session.role"`. The
journal records the fact; any derived view that cares replays from the
journal. Rename history becomes free (it's in the log).

### Chief → pure projection

Today: `chiefClaim` global + `deriveChiefId` over clients map.

Minimal: `chief(at=rowid)` is a pure function over the journal:
- Eligible participants are those with a `session.join` event not followed
  by `session.leave`.
- Chief is the longest-connected eligible participant (lowest join rowid),
  unless a `session.chief.claim` is the most recent, in which case that
  participant is chief until their `leave` or `session.chief.release`.

No `chiefClaim` variable. No ad-hoc `claimChief` RPC — it's just a post.
Consumers that want live chief status subscribe (they already see every
post) and run the projection locally.

### Plugins → peer sessions

Today: `loadPlugins(tribeClientApi)` — in-process, shares the daemon's event
loop, gets a narrowed-but-still-in-process API.

Minimal: each plugin is a separate process that opens a socket, sends
`hello` with `id = sha256("plugin:<name>:<pid>")`, subscribes to whatever
it cares about by filtering `channel` notifications, and writes back via
`post`. The daemon ships a `tribe plug <name>` launcher that starts plugin
processes at daemon start.

**Benefits**:
- Plugin boundary is not a TypeScript interface but a Unix socket — truly
  narrow, externally testable, cross-language viable.
- A crashing plugin can't take down the daemon.
- `TRIBE_NO_PLUGINS=1` is no longer a special code path — it just means
  "don't spawn the plugin launchers."
- Third-party plugins (any language, any process model) become possible.

**Costs**:
- Process overhead per plugin (~30 MB RSS, ~10 ms startup for bun).
- More moving parts to supervise. (Daemon restarts its children on crash;
  children reconnect on daemon restart.)

### lore (memory) → peer participant

Today: `lore-handlers.ts` absorbed into the daemon; handlers share DB, ctx,
and the fanout hook.

Minimal: lore runs as a peer process (same launcher mechanism as plugins)
with `id = sha256("peer:lore")`. It subscribes to `channel` to harvest
posts, runs its summarizer, writes summaries back as posts with
`type="lore.summary"`. The summaries go into the journal like every
other post.

Participants that want lore don't call a `lore.*` RPC — they subscribe
to `type="lore.summary"` posts, or query the journal directly.

### Retro → pure function over the journal

Today: `retro.ts` writes to its own `retros` table; handlers compose
lessons from it + sessions + messages.

Minimal: retro is a read-only projection. `tribe-cli retro` runs a SQL
query over the journal's `type='event.*'` + post stream between two
timestamps, classifies, and prints. No `retros` table. No
`handleRetro` RPC.

### Watch TUI → subscriber

Today: watch is a special session (name prefix `watch-*`, role="watch"
bypasses fanout filtering).

Minimal: watch sends `hello` with `claims: ["watch"]`. The daemon's
fanout rule becomes `post.to matches recipient's id OR recipient claimed
"watch"`. No more name-prefix or role-column dual encoding.

Alternative: watch clients self-filter — they see every post already if
they subscribe to broadcasts. The "watch wants to see directs too" case
is solved by a hello claim, not a role column.

### Scope (per-project vs per-user) → journal-per-scope

Today: one daemon, one socket, one DB. The project_id column on sessions
and the coordination table hint at multi-project but nothing enforces it.

Minimal: one daemon per machine (not per project). It hosts N journals,
one per *scope*. A scope is just a filesystem path — most commonly the
project root. Participants in their `hello` include `scope: "/path/to/proj"`
and the daemon routes them onto that scope's journal.

A single daemon serving multiple projects is cheaper to run (no per-project
socket race), cleaner to reason about (scope is in the hello, not the db
name), and makes cross-project signals expressible (post to scope="*"
reaches every scope's subscribers). This resolves km-tribe.scope-model
cleanly.

## What survives, what dissolves

### Survives (still needed)

- **The `_schema_meta` versioned migrations** — structural.
- **The `sessions(id, last_delivered_seq)` table** — durable delivery tracking.
- **The `messages` journal** (renamed `journal`) — with `id, rowid, kind,
  from_id, to, type, content, bead_id, ref, ts`. Drop `sender` text column;
  use `from_id`.
- **The `dedup(key, id, ts)` table** — atomic claim mechanism for plugins.
  (Could fold into journal with a dedup-post type, but the perf wins of the
  current table are worth keeping it.)
- **The event-bus `onMessageInserted` → socket.write fanout hook** — the
  delivery mechanism is already right.
- **km-tribe.delivery-correctness fixes** (a12dc91, afb35e7) — the replay
  pagination and no-DELETE-on-disconnect semantics are correct under this
  reframe too.

### Dissolves (removed or absorbed)

- `role` column on sessions → carried in post type or derived from journal.
- `identity_token` column → the `id` IS the token.
- `claude_session_id` / `claude_session_name` columns → metadata in the
  hello event, not a column.
- `updated_at` → take `MAX(rowid) WHERE from_id = ?` from the journal.
- `coordination` table → posts with `type="coord.set"` and a projection.
- `retros` table → journal projection.
- `plugins.ts` / `plugin-loader.ts` / `plugin-api.ts` (TribePluginApi,
  TribeClientApi) → replaced by the peer-launcher.
- `lore-handlers.ts` (absorbed in Phase 5) → re-extracted as a peer.
- `handleJoin`, `handleRename`, `handleChief`, `handleClaimChief`,
  `handleReleaseChief`, `handleRetro`, `handleHistory`, `handleDebug` RPCs
  → either become posts or are deleted (projections done client-side).
- register handler → replaced by `hello` processing.
- chief-related globals (`chiefClaim`) → pure projection function.
- clients Map (partially) → still needed for socket lookup by `id`, but
  not for role, name, or session metadata.

### Open questions (for /pro)

1. **Durability of projections.** If retro, chief, membership are all pure
   functions over the journal, we pay their cost on every query. At current
   volume (<10k msgs/day), cost is negligible. But some projections
   (membership) are read O(N) per query. Acceptable? Or do we need cached
   views with invalidation?

2. **Plugin process isolation cost.** 5 plugins × ~30 MB = 150 MB RSS
   overhead per machine. Acceptable tradeoff for boundary cleanliness?

3. **History vs journal trimming.** With retention at 7 days, projections
   over the journal lose long-tail context (retros from 2 weeks ago). Do
   we need a "projection snapshot" concept, or is history search
   sufficient?

4. **`hello` collision policy.** Two sessions claiming the same `id` —
   daemon drops the new socket. But what if the first socket is actually
   dead (no TCP keepalive yet fired)? Hello timeouts + stale-socket
   detection? (Or: include a nonce in the hello so the newest wins.)

5. **Cross-scope posts.** The per-scope journal model means a post with
   `scope="*"` needs to hit every journal. Writes fan out to each — cheap
   for small N, expensive later. Defer until we have a use case?

6. **Migration path.** A phased migration is cheaper than a rewrite. Can
   we keep the current socket wire compatible while moving to the new
   schema underneath? Likely yes: register → treat as hello, existing
   session rows backfill from hello events, observability plugins get
   migrated one at a time.

## Acceptance criteria

The reframe is done when:

- [ ] Three wire forms (hello, post, channel) — zero others.
- [ ] `role` column gone from sessions.
- [ ] `identity_token` column gone from sessions (id is the token).
- [ ] `coordination` table gone, replaced by journal projection.
- [ ] `retros` table gone.
- [ ] `handleJoin`, `handleRename`, `handleChief`, `handleClaimChief`,
      `handleReleaseChief`, `handleRetro`, `handleHistory`, `handleDebug` —
      all gone. Only the register-now-hello entry point remains.
- [ ] `tools/lib/tribe/plugins.ts`, `plugin-loader.ts`, `plugin-api.ts` — gone.
      Plugins are spawned via a separate launcher.
- [ ] lore handlers in `lore-handlers.ts` — extracted to a peer process.
- [ ] watch role encoded as `claims: ["watch"]` in hello, not as a name prefix.
- [ ] Existing test suites pass: `tribe-self-heal.slow.test.ts`,
      `tribe-durability.slow.test.ts`, `tribe-session-identity.slow.test.ts`,
      `tribe-unified-daemon.slow.test.ts`, `tribe-plugin-boundary.test.ts`,
      `tribe-role-typing.test.ts` (adapted to the new shape), `derive-chief.test.ts`.
- [ ] One new test: `tribe-hello-protocol.slow.test.ts` — end-to-end of
      the three-verb wire against a fresh daemon.

## Migration sketch (if adopted)

Phase A (in place — no breakage):
- Add `hello` as an alias for register; keep register working. Accept
  participant-generated `id` from hello.
- Add `post` as an alias for tribe.send/tribe.broadcast; keep the old
  RPCs working.
- Extract lore back to a peer process; start it via a launcher.

Phase B (drop the old RPCs):
- Delete `handleJoin`, `handleRename`, role-change RPCs; switch internal
  callers to posts.
- Migrate plugins to peer-launcher. Delete in-process plugin host.
- Drop the `role` column (migration v10).

Phase C (polish):
- Drop `coordination`, `retros` tables (migration v11).
- Rename `messages` → `journal`.
- Add cross-scope routing if a use case appears.

Estimated: 3-5 days. Phase A is 1 day and unblocks phase B; phase B is
the bulk of the work (2-3 days) and is worktree-isolated; phase C is
cleanup (half a day).

## Recommendation

Adopt after /pro review resolves the open questions. The reframe pays for
itself by collapsing 6+ pro-review beads into one coherent change. The
delivery-correctness work that just landed is load-bearing under this
design too — the journal-as-source-of-truth invariant is exactly what
P0.6's "don't delete on disconnect" already enforces.

The first concrete step (if we proceed) is Phase A: implement `hello` and
`post` alongside the existing RPCs, write `tribe-hello-protocol.slow.test.ts`,
and ship. Phase B is where real deletion happens.
