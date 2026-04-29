---
id: "@km/tribe/testing"
aliases:
  - km-tribe.testing
  - km-tribe-testing
created_by: claude:19080504
created_at: 2026-03-26T17:03:17Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.testing
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:00:13Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Tribe testing system: simulated multi-session environment with fake resources @km/tribe #feature #P2

blocks:: [[@km/tribe]]

Build a comprehensive testing system for tribe coordination that can run without real Claude Code sessions.

Requirements:
1. Simulated sessions — spawn N fake tribe MCP clients that register, heartbeat, send/receive messages, claim beads, and commit (mimicking real Claude Code sessions)
2. Fake cloud resources — mock SQLite DB, mock git repo (in-memory or tmpdir), mock beads directory with issues.jsonl
3. Scenario runner — define test scenarios as sequences of actions: "session A claims bead X, session B sends query, chief assigns work, session C dies, chief prunes and reassigns"
4. Assertions — verify message delivery, dedup, cursor recovery, prune behavior, name collision handling, auto-reload triggers
5. Stress testing — spawn 20+ concurrent sessions, rapid heartbeats, SQLite contention under load
6. Plugin testing — test git/beads plugins in isolation with mock PluginContext
7. Integration tests — full MCP server lifecycle: startup, registration, messaging, pruning, shutdown

Architecture:
- Use vitest for test runner
- Factory functions for creating mock sessions, mock DBs, mock git repos
- Scenario DSL: describe sequences of events and expected outcomes
- No real network, no real Claude Code — pure in-process simulation