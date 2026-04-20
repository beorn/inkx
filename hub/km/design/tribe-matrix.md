# Matrix as km's chat substrate — decision record

**Status**: Decision committed 2026-04-20 after multi-pass review (six-alternative scan, two pro-review cycles, two deep-research surveys, live scan of OpenClaw/Hermes/Nanoclaw/pi-mom/Gas Town/freema-openclaw-mcp/Enderfga-openclaw-claude-code, XMPP-vs-Matrix, ATProto/Nostr rejection). Simplified 2026-04-20 to reuse km primitives instead of inventing new abstractions.
**Complements**: [`vision.md`](vision.md), [`docs/roadmap.md`](../../../docs/roadmap.md), `km-infra.bd-v1-compat`.
**Supersedes**: `hub/bearly/design/tribe-minimal.md` (v1/v2/v3 custom-wire chain, retired).

## Decision in one sentence

**km chat is a Matrix homeserver + a matrix connector + `type: chatlog` frontmatter on tree nodes. Messages are children. Personas are agent nodes in `agents/`. That's the whole thing.**

## What exists vs what's new

| Need | Reuse from km today | New |
|---|---|---|
| Live chat substrate | — | Matrix homeserver (Synapse or Conduit) |
| Chat → vault sync | CalDAV-style connector pattern | `@km/connector-matrix` package |
| Room identity | `KNode.name` (`#design`, `#silvery`) | — |
| Message storage | Tree children | — |
| Authoring | Markdown files | — |
| Task assignment | `@mention` in task title | — |
| Agent identity | `agents/<name>.md` node with `matrix_id:` frontmatter | — |
| Role leases (chief, etc.) | `km-beads` task with `assigned_to` + `due_at` | — |
| Message kinds | Markdown conventions (`[ ]` tasks, `@` mentions, `[[wikilinks]]`, bead IDs) | — |
| Mobile observability | — | Element (matrix client) |
| References | Wikilinks by `name` | — |
| Backlog / history | Recall, tree navigation, query | — |

Three new things. Everything else uses km's existing machinery.

## The structure

### A room = a node with `type: chatlog` and a remote URI

```markdown
---
type: chatlog
remote: matrix:r/design:beorn.matrix.local
---

# #design

Design channel for the km project.
```

The `@km/connector-matrix` pulls events from the Matrix room and writes them as child nodes under this chatlog. Pushes local changes back to Matrix.

Room name = node name = `#design`. Matrix room alias derived deterministically. Wikilinks `[[#design]]` resolve like any other node reference.

### Messages are daily-log entries under the author; rooms are saved queries

This unifies chat, daily journals, and agent working-memory into one personal-timeline model that km's existing transclusion (`embed_of` / `![[target]]`) + query-rule primitives already support.

**Every author has a daily log under their node:**

```
users/@bjorn/
  2026-04-20/
    10:20-claimed-tui47.md      # source of a message (gets transcluded into #design below)
    10:45-private-note.md       # journal only — no transclusion anywhere, stays private
    eod-summary.md              # private reflection

agents/@silvery-refactor/
  2026-04-20/
    10:25-tui47-stuck.md        # source; transcluded into #silvery
    14:00-fixed.md              # source; transcluded into #silvery and DM to @bjorn
```

An entry is just a KNode, content is plain markdown:

```markdown
---
ts: 1713500000000
ref: <other-entry-id>     # optional; only used for imports/compat — replies are tree children
---

Claimed TUI-47.
```

No `type: entry`, no `to:`, no `kind:` — just a node with a timestamp. Markdown structure (`@mentions`, `[ ]` task markers, `[[wikilinks]]`, bead ids) carries semantics; existing km parsers extract it.

**Routing = sigils in content, auto-transcluded on save (Twitter-style).** You write an entry with `#channel` or `@user` sigils in the text. Save-time tooling parses the content, extracts the sigils, and creates transclusions in the referenced targets.

```markdown
# users/@bjorn/2026-04-20/10:20-claimed.md

Claimed TUI-47 #design @silvery-refactor — let me know if you hit the output-phase issue.
```

Save-time, km tooling:
1. Parses content, finds `#design` and `@silvery-refactor`.
2. Adds a transclusion under `com/rooms/#design/` pointing at this entry.
3. Adds a transclusion under `users/@silvery-refactor/inbox/` (or similar DM convention).

End state:

```
users/@bjorn/2026-04-20/
  10:20-claimed.md                                    ← source

com/rooms/#design/
  ![[users/@bjorn/2026-04-20/10:20-claimed]]          ← auto-added by #design in content

users/@silvery-refactor/inbox/
  ![[users/@bjorn/2026-04-20/10:20-claimed]]          ← auto-added by @silvery-refactor in content
```

**Cross-post** to multiple rooms: include multiple hashtags in your text (`#design #silvery`).
**Private entry**: no sigils → no transclusions created → stays in author's timeline only.
**Remove from channel**: delete the transclusion in `com/rooms/#design/` OR remove `#design` from the content (on save, tooling syncs).
**Explicit transclusion** still works: add an embed manually without putting the sigil in the text.

This is precisely Twitter's mental model: `#hashtag` → hashtag search page; `@mention` → user's attention. km implements it via its existing transclusion primitive, with the tooling resolving sigils to transclusions on save.

### Parseable signals

The existing km markdown parser already extracts `@mentions` into `data.mentions` (used for task assignment). Extending to extract `#sigil` references into `data.channel_refs` is one more pattern, not a new subsystem. Both drive save-time transclusion creation.

### Sigil semantics: title authoritatively classifies, body references

One action (sigil → transclusion at target), with a single rule for meaning:

**Titles classify / assign. Bodies mention / reference.**

| Where the sigil appears | `@silvery-refactor` means | `#design` means |
|---|---|---|
| Task's own **title** (`[ ] Do X @silvery-refactor #design`) | **Assign** — sets `assigned_to` on the task (existing km-beads behavior) | **Classify** — task is in the #design area |
| Any other entry's title or body | **Mention / notify** — transclusion into her inbox | **Post to #design** — transclusion in #design's room |
| Reference to another node (`[[TUI-47]] @silvery-refactor`) | **Mention** — she sees it in her inbox; the referenced TUI-47 is NOT reassigned | **Post** — this entry appears in #design; TUI-47 area unchanged |

**Why references don't mutate referents:** a wikilink is read-only by design. `[[TUI-47]] @silvery-refactor can you take this` expresses a *request*, not an atomic assignment. The assignment is a separate explicit action — silvery-refactor runs `km bd claim TUI-47`, or the bead's own title is edited to include her @mention. Implicit reassignment via writing a link would be too magical.

This rule matches km-beads's existing parser: `@mentions` in a bead's title set `assigned_to`; `@mentions` elsewhere go into `data.mentions` as notifications without mutating ownership.

### Receiver views (queries over transcluded content)

On a persona/user's node:
- **Inbox** — all transcluded entries, newest first (mixed tasks, mentions, refs)
- **Assigned tasks** — `[ ] + me in mentions + status open` (existing km-beads view)
- **Mentions (non-task)** — entries mentioning me without task markers
- **DMs** — 1:1 thread ancestry

All expressible with existing km queries. No new views required.

### Why this model

Shape resembles **Twitter** more than Slack: authors post to their own timeline, optionally tagged into topic streams (rooms = hashtag search pages). Replies nest as threads. No channel owns content.

- **One authoring act, multiple surfaces.** Write once in your daily log; entries with `to:` broadcast to rooms, entries without stay private.
- **Unified personal archive.** `users/@bjorn/` is bjørn's complete communication + journal history. Browse the node, see everything.
- **Agent working memory = agent's daily log.** No separate concept.
- **Recall, search, retro** unify across chat + journal. One query language.
- **Clear authorship.** Messages belong to their author. Rooms own nothing; they're views.
- **Portable.** Archive a persona = their messages go with them.
- **Edit propagation is free.** km's transclusion already handles it.
- **Matches Matrix's data model** — events are authored by a user; rooms aggregate.

### Mental model analogs

| Our model | Twitter | Slack |
|---|---|---|
| @author timeline | profile | — |
| Entry with `to: [#room]` | tweet with `#hashtag` | message in channel |
| Entry with no `to:` (journal) | protected draft | — |
| Reply (tree child) | reply chain | thread |
| Multiple `to:` (cross-post) | tweet with several hashtags | — |
| `to: [@alice]` | DM | DM |
| `![[other-entry]]` (transclusion) | retweet | — |
| Chatlog node (saved query) | hashtag search page | channel |

### Routing examples

- `to: [#design]` → appears in `#design` chatlog
- `to: [#design, #silvery]` → cross-posts; still one source entry
- `to: [@alice]` → direct message; appears in 1:1 room (or alice's inbox view)
- `to: [@chief]` → resolves via @-mention to the current chief-task holder; routes accordingly
- no `to:` → private journal entry; visible only in the author's own timeline

### Replies = tree children of the parent entry

Threads use km's natural tree hierarchy. A reply to a message lives as a tree child of that message — no `ref:` chains needed. Tree position IS the thread structure.

```
users/@bjorn/2026-04-20/
  10:20-claimed-tui47.md              (top-level, to: [#design])
    10:25-from-@alice.md              (alice's reply; child of bjørn's)
      10:30-from-@bjorn.md            (bjørn's re-reply; child of alice's)
    10:40-from-@silvery-refactor.md   (another reply; child of bjørn's)
```

Each entry has `author:` frontmatter identifying who wrote it. For entries under an author's own dated directory, the author is inferable; for replies physically under another author's tree, `author:` is explicit.

```markdown
# users/@bjorn/2026-04-20/10:20-claimed-tui47/10:25-from-@alice.md
---
ts: 1713500300000
author: "@alice"
# no to: needed — inherited from parent context if the parent is in a room
---

Good — let me know if you hit the output-phase issue.
```

**Tree navigation = thread navigation.** Browse into a message in km-tui → see its replies as children. Standard outline view. No special thread mechanism. Collapse/expand via normal tree UI.

### Trade-off: author ownership vs thread structure

This model prefers tree hierarchy for threads at the cost of distributing an author's replies across the vault (under parent messages they reply to).

| Gain | Give up |
|---|---|
| Threads render as tree children; no ref-chain resolution | @alice's replies don't all live under `users/@alice/` physically |
| Reply = create child node (simple) | Personal-archive via directory browse covers only top-level posts |
| Obsidian-compatible mental model | Must query `author: @alice` for complete personal timeline |

An author's full timeline becomes a saved query:

```markdown
---
type: author-timeline
rules:
  add: "author: @alice"
---
```

Fast via indexed `author:` field. Renders chronologically, aggregates top-level + replies across the vault.

### Ownership and authorship in cross-tree replies

Alice's reply at `users/@bjorn/.../10:25-from-@alice.md`:
- **Physical parent** = bjørn's message
- **Author** = `@alice` (explicit frontmatter)
- **Edit permission** = alice (convention; connector publishes using alice's `matrix_id`)
- **Federated users** → `author: @alice:remote-server` (connector still publishes on their behalf for local echoes; for inbound, matches sender)

### Connector behavior

**Inbound** — Matrix event arrives from `sender = @alice:server`:
1. Connector writes entry to `users/@alice/<date>/<ts>-<eid>.md` (or `users/_external/@alice:remote-server/...` for federated) with `to: [<chatlog-name>]` derived from Matrix room alias.
2. Done. Room views auto-update via rule-query.

**Outbound** — local entry authored with `to: [#design]`:
1. Connector watches for new entries matching its subscribed rooms' queries.
2. Publishes corresponding Matrix event.

### Edits and redactions

- **Edit** — modify the source entry; all room views transclude the updated content automatically.
- **Redaction** — tombstone the source; views render `[redacted]`.
- **Delete** — remove source; `![[...]]` resolves to a broken embed; renderer shows `[deleted]`.

Matrix immutability maps to km-storage versioning. Source truth in one place; history preserved through storage events.

### Different views of the same source

| View | What it renders |
|---|---|
| `users/@bjorn/2026-04-20/` | Today's timeline (chat + journal, private + public) |
| `users/@bjorn/` | All of bjørn's history, chronological |
| `com/rooms/#design` | All entries with `to: #design` across all authors |
| Retro query | Any time range, any filter; chat + journal mixed |

All pulling from the same source tree. Rooms and timelines are views, not storage.

### Rooms vs ephemeral chats = directory convention

Tracked rooms (durable, committed): `com/rooms/`
Ephemeral chats (gitignored): `com/chats/`

Same `type: chatlog` in both. Only the directory location + `.gitignore` policy differs. Promote a chat to a room with `mv` + remove gitignore entry.

### Agents = nodes in `agents/`

```markdown
---
matrix_id: "@silvery-refactor:beorn.matrix.local"
focus: ["silvery", "refactoring"]
---

# silvery-refactor

Mission: refactor silvery output phase.

## Working memory
- Picked up TUI-47
- Started testing
- Commit a12dc91
```

Identity = node `name`. `matrix_id` is the Matrix user bound to this persona. Working memory = children (tree structure) or appended paragraphs. No `persona_id` field.

Sessions assume personas at startup: SessionStart hook reads the persona node, logs into Matrix as `matrix_id`, joins rooms declared (via an `agents/<name>/rooms` list or inferred from activity), starts work.

### Role leases = km-beads tasks

Single-holder persona assumption, chief-role-in-room, any "who holds this right now" = task with `assigned_to` + `due_at`:

```markdown
# [ ] Hold chief role in #silvery @silvery-refactor due:2026-04-19T15:30
```

Parsed by the existing `[ ]` + `@mention` + `due_at` conventions. Heartbeat extends `due_at`. Graceful exit closes the task. Crash → `due_at` passes → task stale → next session can claim. Uses `km-beads` entirely.

### Task assignment to agents = same as humans

`@silvery-refactor` in a task title = assigned to silvery-refactor agent. `km bd ready --assignee=@silvery-refactor` returns their queue. Handoff = edit the mention. No new mechanism.

```markdown
- [ ] Refactor silvery output phase @silvery-refactor #P1
```

## The @km/connector-matrix package

Same shape as `@km/connector-caldav`:

```
@km/connector-matrix
  reads .km/connectors/matrix.yaml for homeserver + auth
  opens matrix-js-sdk client
  for each chatlog node in the vault with remote: matrix:...
    joins the corresponding Matrix room
    on event: writes a child node under the chatlog
    on local child-node creation: posts to Matrix
    maintains per-room sync cursor (.km/connectors/matrix/sync.json)
  handles auth, reconnect, E2E decryption, backoff
```

Scope: ~800-1200 LOC. Bulk of the work is the matrix-js-sdk integration + bidirectional sync. Nothing in km-core, km-storage, or km-tui needs to change — the connector writes KNodes like any other data source.

## The homeserver

User choice at `km matrix init`:
- **Synapse** (default, mature, Python)
- **Conduit** (opt-in, Rust single-binary, smaller)

Installed via native package manager / launchd / systemd user service. No Docker-first path.

Network modes chosen at init:
1. **local-only** — homeserver on `127.0.0.1`. No mobile. Simplest dev default.
2. **tailscale / mesh-VPN** — homeserver on Tailscale interface; Element on phone via Tailscale.
3. **public-TLS** — reverse proxy (Caddy) with automatic TLS for small-group collaboration.

Mode switchable later.

## Watch / observability = km view

The old tribe had a bespoke watch TUI. Here: just `km view com/rooms/` in km-tui. Each chatlog renders as its stream of messages. A chatlog view type (or outline view with chat styling) in silvery.

`km-tui.backlog-view` and a chatlog view share rendering primitives (ordered children with author + time metadata).

On phone: Element talks directly to the homeserver. Displays the same rooms agents write to. No km app required.

## Observers (git, github, health) = connectors

Old tribe had in-process plugins. Replaced by:

- **git observer** → `@km/connector-git` (or a git hook) posts commits as messages in a configured chatlog
- **beads observer** → already flows through `km bd` events; no separate observer
- **github observer** → `@km/connector-github` (future, already in `docs/future/services.md` as planned)
- **health monitor** → standalone process posts to a `#health` chatlog

No plugin host. No shared process. Each observer is independent.

## Retro = query

Old tribe had a retro feature with its own SQL. Here: a time-bounded query over chatlog messages.

```bash
km query 'type:message ts>2026-04-01 ts<2026-04-15 in:com/rooms/'
# or via recall:
bun recall "tribe activity April 1-15"
```

No retro command, no retro table. Saved queries with human-friendly names if desired.

## Presence

Not materialized into the vault (too much churn). Three options:
- **Ephemeral only**: Matrix tracks presence; connector exposes it on demand
- **Transient field on agent nodes**: connector updates `last_active:` every N minutes
- **Ignore entirely**: v1 just uses "who has an active lease task" as the proxy for "who's live"

Recommendation: v1 ignore; add `last_active:` update in v2 if needed.

## What retires

- **`@bearly/tribe` daemon** (8,300 LOC custom Unix socket wire + plugin host + lore handlers) → deprecated after matrix connector ships
- **`hub/bearly/design/tribe-*.md`** (v1/v2/v3 of the custom-wire design chain) → superseded by this DR
- **Tribe beads** dissolved by this model:
  - `km-tribe.minimal-protocol` — closed (superseded)
  - `km-tribe.stable-identity` — dissolved (names = stable ids)
  - `km-tribe.daemon-authority` — dissolved (no daemon)
  - `km-tribe.scope-model` — dissolved (directory layout + remote URI)
  - `km-tribe.role-register-cleanup` — dissolved (role = task via @mention)
  - `km-tribe.plugin-boundary-tightening` — dissolved (no plugins)
  - `km-tribe.polish-v2` — mostly dissolved
- **`km-infra.namespaces`** — close; name already does the job (short IDs go in `name`)
- **`km-infra.facet-system`** — defer indefinitely; fewer new facets needed to force formalization

## Delivery-correctness fixes (shipped this morning) still valid

The bearly commits `a12dc91` + `afb35e7` from 2026-04-19 (paginated replay, no-DELETE-on-disconnect, dead poll-era code removed) remain correct for however long the old `@bearly/tribe` daemon runs. After the matrix connector ships and users migrate, old tribe is retirable.

## Acceptance criteria

Phase 0 done when:
- [ ] `@km/connector-matrix` skeleton connects to a Synapse (or Conduit) homeserver
- [ ] `km matrix init` installs homeserver + writes connector config + creates the repo's base rooms
- [ ] A chatlog node with `remote: matrix:r/design:...` syncs messages as child nodes
- [ ] Element on the same machine reads the room
- [ ] Posting a new child node writes a Matrix event

Phase 1 done when:
- [ ] Personas in `agents/` with `matrix_id:` can log into Matrix and post to rooms
- [ ] Task assignment (`@agent-name` in title) + `km bd ready --assignee=@agent-name` works end-to-end
- [ ] Role lease pattern (task with `assigned_to` + `due_at`) covers single-holder persona assumption
- [ ] Two Claude Code sessions on different machines coordinate through the homeserver
- [ ] Chat view in km-tui renders a chatlog readably

Phase 2 done when:
- [ ] Durable vs ephemeral chatlogs via `com/rooms/` vs `com/chats/` + gitignore
- [ ] Directs (1:1 rooms) work — create + resolve + render
- [ ] Bead references in messages auto-link to beads; bead claim events flow through normal km-bd channels

Phase 3 deferred items:
- E2E encryption (when sharing with a collaborator)
- Matrix federation (when multi-human collaboration becomes a concrete need)
- Additional connectors (git, github, health as standalone packages)
- OpenClaw bridge (via a `@km/connector-openclaw` if that ecosystem becomes a priority)

## Budget

Phase 0: 4-5 days (connector skeleton + homeserver install)
Phase 1: 1-2 weeks (full tool surface + persona binding + lease pattern + tui view)
Phase 2: 1 week (directs, bead linking, polish)

~3 weeks total end-to-end. ~1000-1500 LOC new code in `@km/connector-matrix` + minor km-tui rendering.

Compared to the original custom-wire tribe (8,300 LOC), this is a significant net reduction.

## Explicit non-goals

- **No custom wire protocol.** Everything rides on Matrix.
- **No `@bearly/room` adapter layer.** The connector IS the adapter; adding another chat protocol later = a new connector package with the same shape.
- **No facet system dependency.** `type: chatlog` + `remote:` are ad-hoc frontmatter keys in the current km tradition.
- **No namespace machinery.** `name` plays the short-id role where needed.
- **No structured event types.** Messages are markdown; km parsers extract structure.
- **No top-down orchestration.** Bottom-up peer coordination via shared rooms.
- **No single-homeserver lock-in.** Federation available via Matrix natively when desired.
- **No OpenClaw dep.** Bridge available via future connector if wanted; optional.

## Research trail

- `hub/bearly/design/tribe-minimal.md` (v1/v2/v3) — retired custom-wire designs
- `/tmp/pro-review-*.txt` — pro review transcripts (v1 chain critiques)
- `/tmp/tribe-prior-art-*.txt` — multi-agent coordination prior art surveys
- `/tmp/xmpp-research-*.txt` — XMPP-vs-Matrix surveys
- Live scans: OpenClaw (40k LOC, Karpathy-critiqued), Hermes, Nanoclaw, pi-mom, Gas Town, freema/openclaw-mcp, Enderfga/openclaw-claude-code

The simplifications from the morning (connector model, persona node, lease-as-task, markdown-conventions-as-structure, name-as-short-id) landed 2026-04-20 after the day's convergence on "leverage km primitives."

## Next action

Start Phase 0 spike once W3 omnibox finish lands (per `docs/roadmap.md` P2 sequencing). Targets: matrix homeserver install flow + connector skeleton + first chatlog node syncing. ~4-5 days.
