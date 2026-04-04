# Tribe: Cross-Session Coordination for Claude Code

> **Status: Phase 1 implemented** — Channel plugin at `vendor/bearly/tools/tribe.ts`, tests at `vendor/bearly/tests/tribe.test.ts`.

Tribe is a coordination layer that lets multiple independent Claude Code sessions discover each other, exchange messages, and coordinate work. One session acts as **chief** (coordinator); the rest are **members** (workers). The chief bridges to the outside world via existing channel plugins (Telegram, etc.).

## Problem

When running multiple Claude Code sessions on the same project:

- Sessions can't discover each other
- No way to send messages between sessions
- The user manually coordinates by telling each session about the others
- Beads provides shared task state but no real-time communication
- Recall provides shared knowledge but no signaling

Tribe fills the gap: **real-time inter-session messaging**.

## Design Principles

1. **No daemon** — SQLite WAL handles multi-process access. No server to start/stop.
2. **Voluntary participation** — Sessions join and leave freely. No lifecycle control.
3. **Advisory coordination** — The chief suggests work; members decide what to do.
4. **Build on what exists** — Beads for tasks, recall for knowledge, Telegram for external. Tribe only adds messaging.
5. **Standard MCP channel** — Uses the documented `claude/channel` capability. No custom protocol.

## Architecture

```
                    External World
               Telegram / Email / Webhooks
                         │
                         │ (existing channel plugins)
┌────────────────────────▼─────────────────────────────┐
│              Chief Session                           │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│   │ Telegram  │  │  Tribe   │  │  Beads   │          │
│   │ Channel   │  │ Channel  │  │          │          │
│   └──────────┘  └────┬─────┘  └──────────┘           │
└──────────────────────┴───────────────────────────────┘
                        │
              .beads/tribe.db (SQLite WAL)
                        │
          ┌─────────────┼─────────────┐
          │             │             │
   ┌──────▼──────┐ ┌───▼────────┐ ┌──▼───────────┐
   │  Member A   │ │  Member B  │ │  Member C    │
   │  domain:    │ │  domain:   │ │  domain:     │
   │   silvery   │ │   tui      │ │   storage    │
   │   flexily   │ │   cards    │ │   parser     │
   └─────────────┘ └────────────┘ └──────────────┘
```

### Layers

| Layer | Primitive | Role | Status |
|-------|-----------|------|--------|
| Tasks | Beads | Create, assign, track, close work items | Exists |
| Knowledge | Recall | Search past session insights | Exists |
| External | Telegram channel | Bridge to users/world | Exists |
| Isolation | Git worktrees | Parallel edits without conflicts | Exists |
| **Messaging** | **Tribe channel** | **Real-time inter-session communication** | **Build** |

## Shared State: tribe.db

A single SQLite database at `.beads/tribe.db` (WAL mode for concurrent access).

### Schema

```sql
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,          -- stable uuid, survives renames
  name       TEXT NOT NULL UNIQUE,      -- human-readable: "chief", "silvery-worker"
  role       TEXT NOT NULL,             -- "chief" | "member"
  domains    TEXT NOT NULL DEFAULT '[]', -- JSON array: ["silvery", "flexily"]
  pid        INTEGER NOT NULL,          -- OS process ID (liveness check)
  cwd        TEXT,                      -- working directory (detect worktrees)
  started_at INTEGER NOT NULL,          -- unix ms
  heartbeat  INTEGER NOT NULL           -- unix ms, updated every 10s
);

-- Aliases allow messages to old names to still route correctly
CREATE TABLE aliases (
  old_name   TEXT PRIMARY KEY,          -- previous name
  session_id TEXT NOT NULL,             -- points to sessions.id
  renamed_at INTEGER NOT NULL           -- unix ms
);

CREATE TABLE messages (
  id         TEXT PRIMARY KEY,          -- uuid
  type       TEXT NOT NULL,             -- message type (see below)
  sender     TEXT NOT NULL,             -- session name (at time of send)
  recipient  TEXT NOT NULL,             -- session name or "*" for broadcast
  content    TEXT NOT NULL,             -- message body (what Claude sees)
  bead_id    TEXT,                      -- associated bead (optional)
  ref        TEXT,                      -- references another message id (for replies)
  ts         INTEGER NOT NULL
);

CREATE TABLE reads (
  message_id TEXT NOT NULL,             -- which message
  session_id TEXT NOT NULL,             -- which session read it
  read_at    INTEGER NOT NULL,          -- unix ms
  PRIMARY KEY (message_id, session_id)
);

CREATE TABLE cursors (
  session_id TEXT PRIMARY KEY,          -- stable id, not name
  last_read_ts INTEGER NOT NULL         -- unix ms, advance after processing
);

CREATE INDEX idx_messages_recipient_ts ON messages(recipient, ts);
CREATE INDEX idx_messages_sender ON messages(sender);
CREATE INDEX idx_aliases_session ON aliases(session_id);
```

### Naming & Renames

**Two names, decoupled:**

| Name | Set by | Changed by | Used for |
|------|--------|------------|----------|
| Claude Code session name | `/rename` | `/rename` | Display in Claude Code UI |
| Tribe member name | MCP server args / env | `tribe_rename()` tool | Message routing in tribe.db |

They are independent. `/rename` in Claude Code does NOT affect tribe identity. Tribe name is set at startup:

```json
{ "command": "bun", "args": ["tribe-channel.ts", "--name", "silvery-worker"] }
```

Or via env: `TRIBE_NAME=silvery-worker`

**Tribe-level rename:**

When a member wants to change its tribe name (e.g., "worker-1" → "silvery-worker"), it calls `tribe_rename(new_name)`. The plugin:

1. Check `new_name` isn't taken (`SELECT FROM sessions WHERE name = ?`)
2. Insert alias: `INSERT INTO aliases (old_name, session_id, renamed_at) VALUES (old, id, now)`
3. Update session: `UPDATE sessions SET name = ? WHERE id = ?`
4. Broadcast: `notify` → "Member 'worker-1' is now 'silvery-worker'"
5. Update local state (plugin's in-memory name)

**Message routing with aliases:**

The polling loop resolves aliases when checking for incoming messages:

```sql
SELECT * FROM messages
WHERE ts > :cursor
AND (
  recipient = :current_name          -- messages to current name
  OR recipient = '*'                 -- broadcasts
  OR recipient IN (                  -- messages to any old name
    SELECT old_name FROM aliases WHERE session_id = :session_id
  )
)
ORDER BY ts;
```

This means messages sent to the old name still arrive — no messages lost during rename.

**Why stable IDs matter:**

- `cursors` key on `session_id` (not name) — cursor survives renames
- `events` reference `session_id` — retro analysis is consistent
- `aliases` provide the redirect chain — you can trace name history
- Old messages keep their original `sender`/`recipient` text (historical accuracy)

**Chief rename is special:**

If the chief renames, all members need to update who they send `status` and `request` messages to. The broadcast notification handles this — members see the rename and update their target. But as a safety net, the polling loop also checks aliases when routing:

```sql
-- Members sending to "chief" when chief renamed to "coordinator":
-- The alias table maps "chief" → session_id of the coordinator
-- The coordinator's poll picks up messages to "chief" via alias resolution
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `assign` | chief → member | "Please claim bead X" |
| `status` | member → chief | "Bead X done, committed abc123" |
| `query` | any → any | "What's the state of the scroll container?" |
| `response` | any → any | Reply to a query (via `ref`) |
| `notify` | any → * | Broadcast: "I just refactored the theme system" |
| `request` | member → chief | "I need to modify a shared file, OK?" |
| `verdict` | chief → member | "Approved" / "Wait, member B is editing that" |

## Tribe Channel Plugin

An MCP channel server (~200 lines) that each Claude Code session loads. It bridges the session to tribe.db.

### Startup

1. Parse config: session name, role, domains (from MCP server args or env)
2. Open `.beads/tribe.db` (create if missing, WAL mode)
3. Register in `sessions` table (upsert by name)
4. Initialize cursor if first time
5. Start heartbeat timer (every 10s)
6. Start poll timer (every 1s)
7. Connect to Claude Code via stdio transport

### Polling Loop (every 1s)

```
1. SELECT * FROM messages
   WHERE (recipient = ? OR recipient = '*')
   AND ts > (SELECT last_read_ts FROM cursors WHERE session_name = ?)
   ORDER BY ts
   -- priority: assign > request > verdict > query > response > status > notify

2. For each message:
   a. Push to Claude Code as channel notification:
      <channel source="tribe" from="silvery-worker" type="status" bead="km-tui.flicker">
      Fix committed as abc123, all tests pass.
      </channel>
   b. UPDATE messages SET read_at = NOW() WHERE id = ?

3. UPDATE cursors SET last_read_ts = max(ts) WHERE session_name = ?
```

### MCP Tools (exposed to Claude)

```
tribe_send(to, message, type?, bead?)
  → INSERT INTO messages (...)
  → Returns: { sent: true, id: "..." }

tribe_broadcast(message, type?)
  → INSERT INTO messages (..., recipient='*')
  → Returns: { sent: true, id: "..." }

tribe_sessions()
  → SELECT * FROM sessions WHERE heartbeat > NOW() - 30s
  → Returns: [{ name, role, domains, started_at, alive }]

tribe_history(with?, limit?)
  → SELECT * FROM messages WHERE sender/recipient = ? ORDER BY ts DESC LIMIT ?
  → Returns: recent message history

tribe_rename(new_name)
  → Checks uniqueness, creates alias, updates session, broadcasts
  → Returns: { renamed: true, old_name: "...", new_name: "..." }
```

### Heartbeat (every 10s)

```sql
UPDATE sessions SET heartbeat = ? WHERE name = ?;
```

Sessions with `heartbeat < NOW() - 30s` are considered dead. The chief can detect this and reassign their work.

### MCP Server Config

```json
{
  "mcpServers": {
    "tribe": {
      "command": "bun",
      "args": ["tribe-channel.ts", "--name", "chief", "--role", "chief", "--domains", "all"]
    }
  }
}
```

Or via environment:

```bash
claude --dangerously-load-development-channels server:tribe
# with TRIBE_NAME=silvery-worker TRIBE_ROLE=member TRIBE_DOMAINS=silvery,flexily
```

### Instructions (system prompt injection)

```
Messages from other Claude Code sessions arrive as <channel source="tribe" from="..." type="...">.

You are the chief. You coordinate work across the tribe:
- Use tribe_sessions() to see who's online
- Use tribe_send() to assign work or answer queries
- Use tribe_broadcast() to announce changes that affect everyone
- Use beads (bd create, bd update) for task tracking
- Messages from Telegram are external requests — translate them into beads and assign to members

When a member reports status, update the relevant bead and reply to Telegram if the external user is waiting.
```

(Member variant omits the Telegram bridging instructions.)

## Coordinator (Chief) Responsibilities

The chief is just a Claude Code session with:
1. The Telegram channel loaded (external bridge)
2. The tribe channel loaded (internal bridge)
3. System prompt instructions for coordination

Its job:
- **Receive** external requests (Telegram) → create beads → assign to members
- **Route** inter-member queries (if member A needs info from member B's domain)
- **Aggregate** status from members → report to external
- **Detect** dead members (heartbeat timeout) → reassign work
- **Sequence** risky operations (member requests approval for shared-file edits)

The chief does NOT control member lifecycle. Members start/stop independently.

## Member Responsibilities

Each member:
1. Loads the tribe channel with its name and domains
2. Monitors for `assign` messages from the chief
3. Claims beads, does work, commits, reports `status`
4. Responds to `query` messages from other sessions
5. Sends `request` before risky shared-state operations
6. Heartbeats every 10s

## Message Flow Examples

### External request → distributed work

```
User (Telegram): "Fix the card flicker and add tests"

Chief receives via Telegram channel
Chief creates beads:
  bd create --title="Fix card hover flicker" --type=bug --priority=1
  bd create --title="Card hover flicker tests" --type=task --priority=2
  bd dep add km-tui.flicker-tests km-tui.flicker-fix

Chief checks tribe_sessions():
  [{ name: "tui-worker", domains: ["tui", "cards"], alive: true },
   { name: "test-worker", domains: ["tests", "specs"], alive: true }]

Chief sends:
  tribe_send("tui-worker", "Claim km-tui.flicker-fix — card flickers on hover", "assign", "km-tui.flicker-fix")
  tribe_send("test-worker", "Claim km-tui.flicker-tests — blocked by fix, will notify when ready", "assign", "km-tui.flicker-tests")

tui-worker receives <channel source="tribe" from="chief" type="assign">
  → Claims bead, investigates, fixes, commits
  → tribe_send("chief", "km-tui.flicker-fix done, committed abc123", "status", "km-tui.flicker-fix")

Chief receives status, notifies test-worker:
  tribe_send("test-worker", "Fix landed (abc123), km-tui.flicker-tests is unblocked", "notify")

test-worker receives, claims bead, writes tests, commits
  → tribe_send("chief", "km-tui.flicker-tests done, 8 tests added", "status", "km-tui.flicker-tests")

Chief aggregates, replies to Telegram:
  "Fixed card hover flicker (abc123) and added 8 tests (def456)."
```

### Cross-member query

```
test-worker needs to understand scroll container behavior:
  tribe_send("tui-worker", "How does the scroll container handle sticky children?", "query")

tui-worker receives <channel source="tribe" from="test-worker" type="query">
  → Reads code, responds:
  tribe_send("test-worker", "Sticky children are positioned relative to...", "response")
```

### Shared-file coordination

```
silvery-worker wants to edit theme.ts (shared across packages):
  tribe_send("chief", "Need to modify vendor/silvery/src/theme.ts for new token", "request")

Chief checks: is anyone else editing silvery?
  tribe_sessions() → no other silvery-domain member active
  tribe_send("silvery-worker", "Go ahead, no conflicts", "verdict")

-- OR if tui-worker is also editing silvery: --
  tribe_send("silvery-worker", "Wait — tui-worker is editing silvery. Coordinate with them first.", "verdict")
  tribe_send("tui-worker", "silvery-worker needs theme.ts — please sync", "notify")
```

## Lineage: Lessons from Prior Systems

### From nanoclaw (validated patterns)

| Pattern | Nanoclaw | Tribe |
|---------|----------|-------|
| Message bus | SQLite + filesystem IPC | SQLite WAL (no filesystem IPC needed) |
| Cursor tracking | `lastAgentTimestamp` per group, rollback on failure | `cursors` table, same rollback logic |
| Concurrency | Per-group queue, global max containers | Advisory — chief sequences risky ops |
| Authorization | Directory ownership (can't escape mount) | `sender` field in messages (self-reported but trusted — all sessions are local) |
| Heartbeat | Container idle timeout (30min) | Session heartbeat (10s interval, 30s timeout) |
| Priority | Tasks > messages (tasks won't be re-discovered) | `assign` > `request` > `query` > `status` > `notify` |
| Memory tiers | Global CLAUDE.md → group CLAUDE.md → session | Coordinator prompt → member prompt → session context |

### From openclaw (adapted patterns)

| Pattern | OpenClaw | Tribe |
|---------|----------|-------|
| Routing | Config-driven bindings (channel+peer → agent) | Capability-based (chief routes by domain match) |
| Session identity | Session keys encoding (agent, channel, peer) | Session name + domains |
| Subagent coordination | Subagent registry (spawn → await → announce) | Beads (create → assign → close) |
| Async execution | Ack immediately, result streams later | Member acks implicitly by claiming bead |

### What tribe does NOT inherit

| System | Pattern | Why not |
|--------|---------|---------|
| PAM | CRDT branch isolation | Git worktrees already provide isolation |
| PAM | Staged side effects + approval | Overcomplicated for trusted local sessions |
| PAM | Trust escalation matrix | All sessions are the same user, same trust |
| OpenClaw | Central gateway daemon | No daemon — SQLite is enough |
| NanoClaw | Container lifecycle management | Sessions are independent; no spawn/kill |
| Cloudi | Gmail as storage backend | Local SQLite is simpler and faster |

## Relation to km Agent System

The existing [agents.md](../future/agents.md) describes an **in-process** agent system where km spawns and manages agents via `km agent spawn`. Tribe is complementary:

| Dimension | km agents | Tribe |
|-----------|-----------|-------|
| Scope | Agents within a single km process | Independent Claude Code sessions |
| Lifecycle | km spawns/stops agents | Sessions start/stop independently |
| Communication | Unix socket + changes.jsonl | SQLite message bus + MCP channel |
| Coordination | Hub TUI dashboard | Chief session + beads |
| Use case | Specialized km workers (reviewer, researcher) | Parallel Claude Code sessions on same project |

Future integration: km agents could register as tribe members, bridging the two systems.

## Relation to tRPC Agent Hub Vision

The recall history shows a vision for a tRPC-based agent hub where apps self-describe capabilities. Tribe is a stepping stone:

| Tribe concept | Future tRPC equivalent |
|---------------|----------------------|
| Session registration (name, domains) | Agent hub registration (capabilities, endpoints) |
| `tribe_send` / `tribe_broadcast` | tRPC procedure calls |
| Chief routing by domain | Hub routing by capability |
| SQLite bus | WebSocket transport |

Once tribe validates the coordination patterns, the same design can extend to km's `withAI()` mode, pam executors, and cross-app agent networks.

## Coordination Protocol: When Members Communicate

Members don't coordinate on everything — only on **state transitions** and **boundary crossings**. This minimizes chatter while ensuring critical information flows to the chief.

### Auto-Reported (Plugin Detects)

The tribe plugin watches for these events and auto-sends status messages:

| Event | Trigger | Message |
|-------|---------|---------|
| Heartbeat | Every 10s, check if alive | (Silent, just updates `heartbeat` column) |
| Bead claimed | `git log` detects "Claimed" message | `status` to chief: "Claimed km-tui.X" |
| Commit pushed | `git log` new commit in this session's worktree | `status` to chief: "Committed {hash}, message: {summary}" |
| Bead closed | Detects `bd close` command | `status` to chief: "Closed km-tui.X {reason}" |
| Bead reopened | Detects `bd update --status open` | `status` to chief: "Reopened km-tui.X" |

The plugin can watch these via:
- **Git hooks** (post-commit, post-push) — if in a worktree
- **File system watch** on `.beads/` — if bead changes are visible
- **Polling** `bd list` periodically — less elegant but doesn't require integration

### Human-Decided (System Prompt Instructs)

The member's system prompt guides Claude when to send messages:

| Situation | Action | Why |
|-----------|--------|-----|
| Root cause found during investigation | `status` to chief + commit hash | Chief can unblock dependents or update external |
| Blocked on another member's work | `status` to chief immediately | Chief can reprioritize or ask other member to accelerate |
| Need to edit a shared/foundational file | `request` to chief before editing | Chief checks if another member is also editing it |
| Made a breaking API change | `notify` broadcast | Everyone on the project needs to know |
| Discovered a related bug while investigating | `notify` broadcast + `bd create` | Prevent others from wasting time on the same discovery |
| All assigned beads closed, ready for more | `status` to chief: "Available" | Chief knows capacity |
| Soft-blocked (uncertain, need advice) | `query` to relevant member | "How does the scroll cache invalidate on resize?" |

Example system prompt snippet for members:

```
When you claim a bead, the plugin auto-sends a status. When you commit, the plugin auto-sends the hash.

Additionally:
- If you discover the root cause of a bug BEFORE committing a fix, send a status describing it.
- If you realize you're blocked (waiting for another member's work), send a status saying so.
- Before editing vendor/silvery/ or any shared file, send a request to the chief asking for OK.
- If you make a breaking change to a public API, notify the tribe immediately.
- If you discover a related bug (unrelated to your current bead), create a new bead and notify the tribe.
```

### Polling & Escalation (Chief Initiates)

The chief doesn't passively wait. It proactively checks:

```
Every 5 minutes:
  - SELECT beads WHERE status='in_progress' AND last_update > 30 minutes ago
    → send query to the member's session: "Status check on km-X?"
  - Check heartbeat column: any member with heartbeat > 30s stale?
    → tribe_send("member-X", "You alive? Haven't heard from you in a while", "query")
```

If a member doesn't respond to a query within 2 minutes, the chief assumes they're AFK and may:
- Reassign their beads
- Notify Telegram of the blockage
- Ask another member to take over

## Message Flow: Typical Workflow

```
Chief: tribe_send("tui-worker", "Claim km-tui.flicker-fix", "assign", "km-tui.flicker-fix")

tui-worker:
  1. Sees <channel source="tribe" from="chief" type="assign">
  2. bd update km-tui.flicker-fix --claim
     → Plugin auto-sends: status "Claimed km-tui.flicker-fix"
  3. Investigates, finds root cause
     → Claude sends: status "Root cause found: dirty flag not propagating through sticky children"
  4. Fixes, commits
     → Plugin auto-sends: status "Committed abc123, message: 'fix: propagate dirty flag through sticky'"
  5. Runs tests, all pass
     → (No auto-send, Claude must choose:)
     → Sends: status "Tests pass, km-tui.flicker-fix ready for review"
  6. bd close km-tui.flicker-fix
     → Plugin auto-sends: status "Closed km-tui.flicker-fix ✓"

Chief:
  1. Receives status "Claimed..."
     → bd update km-tui.flicker-fix --assignee tui-worker
  2. Receives status "Root cause found..."
     → (For external user waiting) Sends Telegram: "Found root cause, fix in progress"
  3. Receives status "Committed..."
     → Knows fix landed, can notify test-worker
     → bd update km-tui.flicker-tests --status ready (if blocked)
  4. Receives status "Closed..."
     → Updates Telegram: "Fix shipped"
```

## Avoiding Over-Communication

The key constraint: **Don't notify unless it changes what someone else should do.**

- Investigating? Silence. (Chief will query if you're stuck.)
- Reading code to understand something? Silence.
- Ran a test locally and it passed? Silence.
- Only speak when you've found something that affects others.

This keeps the tribe bus from being noisy while ensuring critical information propagates.

## Observability & Retrospection

The messages table is already a complete audit trail. Layer structured events on top for timing analysis, pattern detection, and self-improvement.

### Events Table

```sql
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,       -- event type (see below)
  session    TEXT,                -- which session
  bead_id    TEXT,                -- which bead (if applicable)
  data       TEXT,                -- JSON payload (details)
  ts         INTEGER NOT NULL     -- unix ms
);

CREATE INDEX idx_events_type_ts ON events(type, ts);
CREATE INDEX idx_events_bead ON events(bead_id);
CREATE INDEX idx_events_session ON events(session);
```

### Event Types

| Type | When | Data |
|------|------|------|
| `tribe.started` | First session registers | `{ chief: "name" }` |
| `tribe.ended` | Chief closes tribe | `{ duration_ms, members_count, beads_total }` |
| `session.joined` | Session registers | `{ name, role, domains }` |
| `session.died` | Heartbeat timeout detected | `{ name, last_heartbeat, beads_in_progress }` |
| `bead.assigned` | Chief assigns bead to member | `{ bead_id, assignee, assigner }` |
| `bead.claimed` | Member claims bead | `{ bead_id, member, latency_ms }` (time from assign → claim) |
| `bead.blocked` | Member reports blocked | `{ bead_id, member, blocked_by, reason }` |
| `bead.unblocked` | Blocker resolved | `{ bead_id, member, blocked_duration_ms }` |
| `bead.committed` | Member commits | `{ bead_id, member, commit_hash }` |
| `bead.closed` | Bead completed | `{ bead_id, member, cycle_time_ms }` (assign → close) |
| `bead.reassigned` | Chief moves bead to different member | `{ bead_id, from, to, reason }` |
| `conflict.detected` | Two members editing same file/area | `{ file, members[], resolution }` |
| `query.unanswered` | Query timed out without response | `{ from, to, content, waited_ms }` |
| `external.received` | Request came in via Telegram | `{ source, summary }` |
| `external.replied` | Chief replied to external | `{ source, summary, total_latency_ms }` (received → replied) |

### Derived Metrics

Computed from events at retro time — no real-time aggregation needed:

```
Cycle Time         = bead.closed.ts - bead.assigned.ts
Claim Latency      = bead.claimed.ts - bead.assigned.ts
Block Duration     = bead.unblocked.ts - bead.blocked.ts
External Latency   = external.replied.ts - external.received.ts
Member Throughput  = count(bead.closed WHERE session = X) / session_duration
Conflict Rate      = count(conflict.detected) / count(bead.assigned)
Reassignment Rate  = count(bead.reassigned) / count(bead.assigned)
Query Response Time = response.ts - query.ts (via ref linkage)
Silent Periods     = gaps between successive messages from a member
```

### Retrospective Process

When a tribe session ends (chief closes, or all beads done), run a retrospective:

**1. Gather** — Query events table for this tribe session:

```sql
SELECT * FROM events WHERE ts BETWEEN :tribe_start AND :tribe_end ORDER BY ts;
```

**2. Analyze** — Compute metrics and identify patterns:

- **Bottlenecks**: Which beads had the longest cycle time? Why? (blocked? reassigned? member died?)
- **Coordination failures**: Conflicts detected, unanswered queries, reassignments
- **Responsiveness**: External latency — how long did the Telegram user wait?
- **Imbalance**: Did one member do all the work while others idled?
- **Discovery yield**: How many new beads were created vs. assigned? (indicates scope underestimation)

**3. Diagnose** — Classify what went well and what didn't:

```markdown
## Tribe Retro: 2026-03-22 14:00-16:30

### Metrics
- Members: 3 (tui-worker, silvery-worker, test-worker)
- Beads assigned: 7, completed: 6, reassigned: 1
- Avg cycle time: 18 min
- External latency: 3 min (request → first reply), 47 min (request → final reply)
- Conflicts: 1 (theme.ts, caught by request/verdict)
- Member deaths: 0

### What Worked
- silvery-worker proactively reported root cause before committing
  → chief updated Telegram user within 3 min of request
- theme.ts conflict caught via request/verdict protocol
  → no merge conflicts

### What Didn't
- test-worker sat blocked for 12 min before reporting
  → should have reported immediately (instruction gap?)
- tui-worker committed twice without status messages between
  → auto-report missed second commit? (plugin reliability)
- External user asked follow-up that chief couldn't answer
  → chief queried silvery-worker, 4 min round-trip

### Lessons (→ bd remember)
- "test-worker domain should include acceptance tests, not just unit tests"
- "theme.ts is a coordination hotspot — consider worktree isolation by default"
- "12 min block silence: add periodic self-check to member instructions"
```

**4. Persist** — Save insights across three systems:

| Destination | What | Why |
|-------------|------|-----|
| `bd remember` | Coordination lessons | Searchable across all future sessions via recall |
| Bead notes | Per-bead timing data | Attached to the work item for history |
| `tribe.db` retros table | Full retro record | Queryable for trend analysis |

```sql
CREATE TABLE retros (
  id          TEXT PRIMARY KEY,
  tribe_start INTEGER NOT NULL,
  tribe_end   INTEGER NOT NULL,
  members     TEXT NOT NULL,        -- JSON array of member names
  metrics     TEXT NOT NULL,        -- JSON object of computed metrics
  lessons     TEXT NOT NULL,        -- JSON array of lesson strings
  full_md     TEXT NOT NULL,        -- complete retro markdown
  ts          INTEGER NOT NULL
);
```

### Self-Improvement Loop

Retro insights feed forward into future tribes:

```
Tribe Session N
  → events logged
  → retro generated
  → lessons saved to bd remember + retros table

Tribe Session N+1
  → Chief startup: bun recall "tribe coordination"
    → finds lessons from session N
  → Chief adjusts: "Last time, test-worker was slow to report blocks.
    I'll query test-worker more frequently."
  → Chief adjusts: "theme.ts is a hotspot — assign silvery changes
    to a single member or use worktree isolation."
```

The chief's system prompt should include:

```
Before assigning work, search for past tribe lessons:
  bun recall "tribe retro" OR tribe_retro_history(limit=3)

Apply coordination lessons from past sessions. Common patterns:
- If a file was a conflict hotspot last time, require worktree isolation
- If a member was slow to report blocks, query them more frequently
- If external latency was high, send interim updates earlier
```

### Live Observability

During a tribe session, the chief (or the user) can inspect state:

```
tribe_sessions()     → who's alive, what domains, how long active
tribe_history()      → recent message flow
tribe_metrics()      → live derived metrics (beads open/closed, avg cycle time so far)
tribe_health()       → any members silent too long? any beads stale?
```

The `tribe_health()` tool is particularly useful — it returns a diagnostic:

```json
{
  "members": [
    { "name": "tui-worker", "status": "active", "last_message": "2 min ago", "beads": 2 },
    { "name": "test-worker", "status": "silent", "last_message": "18 min ago", "beads": 1, "warning": "no status in 18 min" }
  ],
  "beads": [
    { "id": "km-tui.flicker", "assignee": "tui-worker", "age": "25 min", "status": "in_progress" },
    { "id": "km-tui.tests", "assignee": "test-worker", "age": "18 min", "status": "blocked", "warning": "blocked 12 min, no update" }
  ],
  "conflicts": [],
  "external_waiting": [
    { "source": "telegram", "age": "25 min", "last_update": "Root cause found, fix in progress" }
  ]
}
```

### Systemic Blockers (Infrastructure-Level)

Beyond per-bead blockers, retros must track **infrastructure-level coordination failures** — shared resources that cause implicit blocking between members:

| Blocker Type | Symptom | Detection | Coordination Protocol |
|-------------|---------|-----------|----------------------|
| **Git worktree/branch conflict** | Two members editing the same branch, merge conflicts | Member reports `request` before shared file edits; chief checks `cwd` field | Chief assigns worktree isolation: "Use `bun worktree` for this work" |
| **CPU contention** | Multiple members running `test:all` simultaneously, everything slows | Member reports "tests running slow"; chief checks who else is testing | Chief sequences test runs: "Wait for member-X to finish tests before running yours" |
| **Broken codebase** | Member A's refactor leaves code in a half-migrated state, member B can't build | Member B reports blocked; `bun fix` or `bun run test:fast` fails | Chief holds off new assignments until refactor is complete, or directs to worktree |
| **Unpublished npm packages** | Member A published a new API in silvery, member B needs the npm version | Member B reports "need @silvery/foo@x.y.z but it's not on npm yet" | Chief asks member A to `npm publish`, or uses workspace overrides |
| **Shared file hotspot** | Multiple members need to edit the same file (theme.ts, package.json) | Repeated `request`/`verdict` on same file across a session | Chief identifies hotspot in retro; future sessions use worktree isolation by default for that file |
| **Stale .km/state.db** | Member's changes to storage/materialization require DB reset; other members' TUI breaks | Member reports "TUI shows wrong data" after another member's commit | Chief broadcasts: "Delete .km/state.db and relaunch" after storage changes |
| **Lock file conflicts** | bun.lock, .beads/ Dolt lock, SQLite locks | "database is locked" errors, bun install conflicts | Chief sequences package installs; tribe.db already uses WAL + busy_timeout |

**Members must report** when they:
- Experience slowdowns (CPU contention from concurrent test runs, etc.)
- Begin or complete a multi-file refactor (codebase stability)
- Publish or need an npm package (dependency chain)
- Create or merge a worktree (branch awareness)
- Modify shared config files (package.json, tsconfig, .mcp.json)

**On `/tribe sync`**, members should additionally report:
- Active worktrees and their purpose
- Any in-flight refactors that leave the codebase in a transitional state
- npm packages they've changed but not yet published
- Any slowdowns or resource contention they're experiencing

**Retro analysis for systemic blockers:**
```
For each tribe session, compute:
- Git conflict count (merge conflicts resolved)
- CPU contention events (overlapping test runs)
- Codebase stability gaps (time between "refactor started" → "refactor complete")
- Package publish latency (time between "need package" → "package available")
- Hotspot files (files mentioned in >2 request/verdict exchanges)
```

### Member Naming & Domain Focus

Members should be named after their domain, not generic numbers. This lets the user see at a glance what each terminal is working on:

```bash
# Good: domain-focused names
TRIBE_NAME=silvery-worker TRIBE_DOMAINS=silvery,flexily claude-tribe
TRIBE_NAME=tui-worker TRIBE_DOMAINS=tui,cards,board claude-tribe
TRIBE_NAME=termless-worker TRIBE_DOMAINS=termless,backends claude-tribe
TRIBE_NAME=storage-worker TRIBE_DOMAINS=storage,parser,markdown claude-tribe

# Bad: generic numbers
claude-tribe  # auto-assigns member-1, member-2, ...
```

The chief routes work based on `domains` — a bead about silvery rendering goes to `silvery-worker`, not the first idle member. Members should `/tribe rename` to a meaningful name if they started with a generic one.

When the chief receives a sync report, it should suggest renames if members are unnamed but have a clear domain focus from their work history.

### Failure Taxonomy

Over multiple retros, patterns emerge. Classify and track:

| Failure Mode | Detection | Remedy |
|-------------|-----------|--------|
| **Silent block** | Member blocked but didn't report for >10 min | Add periodic self-check to member prompt |
| **Wrong domain** | Chief assigned to member without relevant domain | Improve domain declarations or add skill matching |
| **Conflict miss** | Two members edited same file, no request sent | Auto-detect via git status polling, not just behavioral |
| **Zombie member** | Member alive (heartbeat) but not working | Add activity detection beyond heartbeat (commits, messages) |
| **Scope creep** | Member created 5 new beads while working on 1 | Chief should gate new bead creation or review |
| **External silence** | Telegram user waiting >15 min with no update | Chief sends interim "still working on it" automatically |
| **Cascade failure** | Member dies, blocked beads pile up | Chief reassigns within 2 min of heartbeat timeout |
| **Git conflict** | Merge conflict on shared branch | Use worktree isolation; chief tracks who's on which branch |
| **CPU starvation** | Overlapping test suites slow everyone | Chief sequences test runs across members |
| **Half-migrated code** | Refactor in progress breaks other members' builds | Chief holds assignments until refactor complete; direct others to worktree |
| **Package lag** | npm publish needed before dependent work can proceed | Chief tracks publish chain; sequences dependent assignments |

Track frequency of each failure type in retros to measure improvement over time.

## Implementation Plan

### Phase 1: Channel plugin (MVP)

Build `tribe-channel.ts` — the MCP channel server:
- Session registration + heartbeat
- Message send/broadcast/history tools
- Poll loop + channel notifications
- SQLite schema creation

Deliverable: Two Claude Code sessions can exchange messages.

### Phase 2: Chief instructions

Write system prompt instructions for the chief role:
- Telegram → bead → assign workflow
- Status aggregation → Telegram reply
- Dead member detection → reassignment
- Shared-file conflict detection

Deliverable: Chief can coordinate a small team.

### Phase 3: CLI integration

Add `tribe` subcommand to km or bd:
- `tribe status` — show active sessions
- `tribe send <to> <message>` — send from CLI
- `tribe log` — recent messages
- `tribe join <name> [--role chief] [--domains ...]` — convenience launcher

Deliverable: User can inspect and interact with tribe from terminal.

### Phase 4: Hub integration

Bridge tribe with km's agent system:
- km agents register as tribe members
- Hub TUI shows tribe sessions alongside km agents
- Unified work queue view

## Open Questions

1. **How does the user launch a tribe?** Start chief session first, then members? Or any order — first session becomes chief?
2. **Multiple chiefs?** Probably not — but what if the chief dies? Auto-election or manual restart?
3. **Cross-project tribes?** Sessions working on different repos? Probably out of scope.
4. **Message retention?** Prune messages older than 24h? Keep forever? Configurable?
5. **Worktree awareness?** Should tribe track which worktree each member is on to prevent conflicts?

## See Also

- [agents.md](../future/agents.md) — In-process km agent system
- [tea-state-machines.md](tea-state-machines.md) — State machine architecture
- [Claude Code channels reference](https://code.claude.com/docs/en/channels-reference) — MCP channel protocol
- nanoclaw (`~/Code/nanoclaw/`) — Single-process orchestrator with filesystem IPC
- openclaw (`~/Code/openclaw/`) — Central gateway with WebSocket routing
