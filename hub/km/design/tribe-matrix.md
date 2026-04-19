# Tribe on Matrix (via a Room adapter) — decision record

**Status**: Decision committed 2026-04-19 after six-alternative review + two deep-research surveys (Matrix-general + XMPP-vs-Matrix) + live scan of OpenClaw, Hermes, Nanoclaw, pi-mom, Gas Town.
**Supersedes**: `hub/bearly/design/tribe-minimal.md` (spec v1/v2/v3 — custom-wire-daemon direction, retired).
**Complements**: km-infra.bd-v1-compat (km-native bd; tribe's durable ledger eventually).

## Decision (two layers)

**Layer 1 — Abstraction: `@bearly/room`.** km and tribe consume a substrate-agnostic `Room` interface. They never import a specific protocol SDK directly.

**Layer 2 — Production adapter: Matrix.** The reference adapter implementation is `@bearly/room-matrix`, wrapping `matrix-js-sdk` and talking to a Conduit homeserver. This is what ships by default and what the rest of the DR focuses on. Alternative adapters (`room-xmpp`, `room-file`, `room-memory`, `room-slack`, `room-openclaw`, etc.) are pluggable extensions behind the same interface.

**Matrix-specific decisions:**
- **Server**: Conduit (Rust single-binary homeserver, ~20MB, ~50MB RAM). Bundled, user-global, localhost-bound by default.
- **Client SDK**: `matrix-js-sdk`, lean imports, consumed only by the `room-matrix` adapter — not by km or tribe directly.
- **Mobile observability**: Element (web/desktop/iOS/Android).
- **Structure**: km repo = Matrix Space; channels = rooms in the space; `chats/<channel>/` = materialized room history in the vault.
- **Identity**: personas as files (`agents/<name>.md`, `users/<name>.md`); matrix users bound to personas; sessions assume personas.
- **Scope**: user-global (one homeserver per user; all their km repos as spaces under it).
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

One tree, two lenses:

```
km repo                                Matrix space
───────                                ────────────
~/Code/pim/km/                    ⟷    !km-<id>:matrix.beorn.dev
  docs/                           ⟷      (folder nodes, not rooms)
  chats/                          ⟷      (rooms in the space)
    general/                      ⟷        #general room
      2026-04-19T14:30-<eid>.md   ⟷          m.room.message event
    design/                       ⟷        #design room
  agents/                         ⟷      (matrix users that are agents)
    silvery-refactor.md           ⟷        @silvery-refactor:matrix.beorn.dev
    chief.md                      ⟷        @chief:matrix.beorn.dev
  users/                          ⟷      (matrix users that are humans)
    beorn.md                      ⟷        @beorn:matrix.beorn.dev
```

Files ARE events; events ARE files. Matrix is the real-time face of km; km is the durable face of matrix.

## Persona model

**Personas are durable; sessions are ephemeral.** The same persona can be assumed by different Claude Code sessions over time (sequentially by default, opt-in multi-device later).

### Persona file schema

`agents/<name>.md`:

```markdown
---
matrix_id: "@silvery-refactor:matrix.beorn.dev"
focus: ["silvery", "refactoring"]
rooms: ["#silvery", "#design", "#general"]
style: ["tdd", "small-commits", "recall-first"]
created: 2026-04-15
last_active: 2026-04-19T15:00:00Z
last_session: sess_abc123
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

### Assumption lifecycle

- **Startup** (`claude --agent silvery-refactor`): SessionStart hook reads the persona file, fetches matrix credentials, logs in as the matrix user, joins rooms, injects persona body as seed context, appends session-start entry.
- **Shutdown** (graceful): append summary to working memory, update `last_active`, leave matrix (or keep device key for fast reconnect), commit persona file changes.
- **Crash**: matrix user stays online until socket timeout; next session sees "was active until X, didn't log off cleanly." No special handling.

### Default: single-holder, opt-in multi-device

By default, only one session at a time can hold a persona. Others see "silvery-refactor is busy (on beorn-laptop)." Opt-in via `claude --agent silvery-refactor --device laptop` to use matrix's native multi-device support.

### Spawning and archiving

- `km agent create <name> --focus=... --room=...` — creates the persona file, provisions the matrix user, invites to rooms.
- `km agent archive <name>` — moves to `agents/_archive/`, marks matrix user inactive.
- `km agent revive <name>` — inverse.

### Chief

Chief is a persona anyone can assume. Room-scoped via matrix power levels. `agents/chief-<room>.md` documents historical claimants per room (not a projection; matrix power level is the canonical truth).

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

### Event ↔ file mapping

- **Messages** → one file per event: `chats/<channel>/<iso-timestamp>-<event-id>.md`.
- **Edits** (m.replace) → overwrite file + append `_history/<event-id>-<seq>.md` with prior content.
- **Redactions** → overwrite with tombstone, preserve in `_history/` if repo policy requires.
- **Threads** → stored flat (one file per event); rendered nested via parent references in frontmatter.
- **Typing / presence / receipts** → ephemeral, not persisted to files.

### Git

By default, `chats/` is committed to git (history is durable, diffable, branchable). For high-volume rooms, opt into `.gitignore chats/high-volume/` and let matrix be the sole durable store.

### Encryption

Start unencrypted (single-user self-hosted Conduit on localhost). Add E2E when:
- Sharing a space/room with a collaborator across machines with untrusted network segments
- Bridging to a public matrix network

E2E complications (device verification, key sharing for bot accounts) addressed incrementally.

## Channel view in silvery

New view type alongside cards/columns/tabs: **channel view**.

- Files sorted newest-at-bottom (toggle for newest-at-top)
- Each file renders as a message card (author + timestamp + body + reactions)
- Input box at bottom = post new message (appends file + emits matrix event)
- Thread grouping: replies nested visually, stored flat
- Presence bar: live members from matrix presence
- Typing indicators from matrix

## Phased rollout

### Phase 0 — `Room` interface + minimal adapters (4-5 days)
- Design the `Room` interface (`@bearly/room`): core methods + capability set.
- Implement `@bearly/room-memory` (in-process, for tests) — ~100 LOC.
- Implement `@bearly/room-file` (jsonl + fs.watch) — ~300 LOC.
- Skeleton `@bearly/tribe` MCP server consuming a `Room` instance. Tools: `tribe.broadcast`, `tribe.send`, `tribe.members`, `tribe.history`.
- Validate against `room-memory` and `room-file`: two Claude Code sessions, same room, see each other's hellos.

Deliverable: interface exists, two adapters prove it, tribe runs on either. No Matrix yet — we validate the shape first.

### Phase 1 — Matrix adapter + Conduit (3-4 days)
- Implement `@bearly/room-matrix` wrapping `matrix-js-sdk`. All capabilities (presence, threads, reactions, structured, dm, spaces).
- Bundle Conduit via Docker compose in km install flow.
- `km matrix init` command: starts Conduit on localhost, creates the space for current repo, registers the user's matrix account, writes tribe config pointing at `room-matrix`.
- Tribe works identically on `room-matrix` as it did on `room-file` in Phase 0.
- Element connects and reads the room.

Deliverable: Matrix is the production adapter. Two Claude Code sessions on different machines (via Tailscale or similar) coordinate through the user's homeserver. Phone-observable from Element.

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
- **No custom wire daemon.** Everything rides on Matrix + Conduit.
- **No top-down orchestration.** Agents are peers in rooms; chief is a role anyone can assume, not a master.
- **No Matrix-federation-first.** Single homeserver, localhost-bound, user-global. Federation is a later toggle.
- **No pure-federation design**. We don't try to replicate state across untrusted peer matrix servers. One user, their homeserver, that's the scope.

## Open questions (defer to Phase 0 spike)

1. **Conduit maturity check**: is Conduit production-ready in 2026-04 for our single-user single-homeserver use? Synapse fallback if not.
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
- [ ] `room-matrix` passes the same conformance suite, plus spaces/presence/threads
- [ ] Bundled Conduit starts on `km matrix init`; stops cleanly on shutdown
- [ ] A fresh km repo auto-creates its matrix space on first `claude` invocation
- [ ] Two sessions on different machines (via Tailscale or similar) coordinate through the homeserver
- [ ] Element Web/Desktop reads the room

Phase 2 done when:
- [ ] Persona files drive agent identity; rename and restart preserve the matrix user (via `room-matrix`)
- [ ] Humans post from Element, agents see via MCP notification
- [ ] `tribe.send to="@chief"` routes to the current chief-persona holder
- [ ] History query works: `tribe.history --channel=#design --since="2h"`

## Budget

Rough scope for Phases 0-4: **~3 weeks** of focused work.

Per-phase:
- Phase 0: 4-5 days (interface + 2 adapters + conformance tests)
- Phase 1: 3-4 days (room-matrix + Conduit bundling)
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
