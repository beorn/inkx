---
id: "@km/bear"
aliases:
  - km-bear
  - "@km/_orphan/bear"
created_by: Bjørn Stabell
created_at: 2026-04-17T06:03:43Z
owner: bjorn@stabell.org
---

# [ ] (EPIC) bear: workspace daemon unifying recall memory + tribe coordination @km/bear #feature #P3

Unify \`@bearly/recall\` (memory/search) and \`@bearly/tribe\` (coordination) under a single persistent per-user daemon: **bear**.

## Problem

Today bearly has two independent long-lived concerns:
- **Tribe** runs a daemon for cross-session coordination (who's alive, broadcast messages, beads/git events) but has no memory.
- **Recall** has rich memory (FTS5 corpus, LLM planner, session context) but is per-invocation — spawns \`bun\` subprocesses, pays ~400ms startup every hook/call, and has no awareness of other sessions' in-flight work.

Fragmenting them costs: duplicated session detection (tribe has canonical registration; recall uses mtime heuristics), duplicated persistence, no memory-aware coordination, no coordination-aware memory.

## Vision: bear

One per-user daemon process. Tribe is its coordination face. Recall is its memory face. Together they turn a pile of independent Claude Code sessions into a coherent personal workspace.

**New capabilities unlocked**: cross-session collaboration hints (topic-overlap from shared planner variants), pre-summarized workspace state (background summarizer; \`bear status\` is <10ms query), episodic memory consolidation (SessionEnd produces 1KB dense summary), shared dedup state (zero disk round-trips), streaming MCP tools, \`bear watch\` live TUI.

## Phase plan (executable, sequential)

Each phase is independently shippable — codebase clean and complete after every phase. /complete criteria include exact grep commands. No phase leaves OldWay + NewWay both working.

**Phase 0 — Test infra for agent-mode** (\`km-bear.test-infra\`, P1, blocks all others)
LLM-mock harness + agent-mode unit tests. Prerequisite: today 0 tests cover recallAgent/planQuery/synth path selection. Must fix before any bear code ships (era2 Case Study 5 Lesson 4).

**Phase 1 — \`@bearly/bear\` MCP wrapper** (\`km-bear.mcp-wrapper\`, P2, depends on Phase 0)
New package \`vendor/bearly/plugins/bear/\` with stdio MCP server. Tools: \`bear.ask\`, \`bear.current_brief\`, \`bear.plan_only\`. Calls existing recall library directly (no daemon yet). Registered in \`.mcp.json\`. Follows tribe-proxy house style (raw JSON schema, Server API, CallToolRequestSchema handler). Delete: skill-doc references to \`bun recall\` for Claude-invoked calls.

**Phase 2 — \`bear-daemon\` + \`workspace-state.db\`** (\`km-bear.daemon\`, P2, depends on Phase 1)
Persistent process modeled on \`tools/tribe-daemon.ts\`: Unix socket \`\$XDG_RUNTIME_DIR/bear.sock\`, SQLite WAL at \`~/.local/share/bear/bear.db\`, SIGHUP hot-reload, 30min idle quit. SessionStart hook routes to daemon for canonical session registration. Bear MCP proxy becomes reconnecting client. Delete: \`~/.claude/bearly-sessions/pid-*.json\` sentinel files as primary path (fallback-only).

**Phase 3 — focus detection + \`bear.workspace_state()\`** (\`km-bear.focus\`, P2, depends on Phase 2)
Daemon polls alive sessions every 60s, writes focus summary to DB. New MCP tool exposes cross-session snapshot. \`bear status\` CLI. Delete: \`buildQueryContext()\`'s per-call session-tail re-parse (reads from daemon cache instead).

**Phase 4 — background summarizer** (\`km-bear.summarizer\`, P2, depends on Phase 3)
Coroutine in daemon: for changed session tails, Haiku (or local Qwen) produces 1-sentence focus + loose_ends. Model selector \`BEAR_SUMMARIZER_MODEL=local|haiku|off\`. Idle-skip 30min. New MCP tool \`bear.session_state(id)\`. Delete: ad-hoc summary lookups in recall pipeline.

**Phase 5 — dedup + \`bear.inject_delta()\`** (\`km-bear.dedup-inject\`, P2, depends on Phase 4)
Per-session already-shown set in daemon memory. UserPromptSubmit hook migrates to \`bear.inject_delta\` — only new docs injected. Delete: hook's unconditional synth on every prompt.

**Phase 6 — \`bear watch\` TUI** (\`km-bear.watch-tui\`, P3, depends on Phase 5)
Silvery-based live dashboard. Four panes: active sessions, event stream, collaboration hints, attention map. Subscribes to daemon event stream via new \`bear.events()\` tool.

**Phase 7 (deferred) — unified bearly daemon** (\`km-bear.unified-daemon\`, P4, depends on Phase 6 + ≥2wk stability)
Merge tribe-daemon + bear-daemon into one process. Preserve tool namespaces (\`tribe.*\`, \`bear.*\`, \`recall.*\`). Shared event bus and SQLite. Only start when 1–6 have been stable.

## Risk analysis

- **Dual-path trap**: CLI is human-facing UI, daemon is Claude-facing. Hook path moves fully to daemon in Phase 5. \`bun recall --agent\` CLI stays as a human surface, but the library underneath is shared — one implementation, two surfaces. NOT a backwards-compat hack.
- **Bead drift** (Case Study 6): every phase has literal grep commands in /complete. Tracking bead (this one) updated after each phase.
- **Aspirational-done** (Case Study 8): each /complete must be run literally before \`bd close\`.
- **Test gap** (era2 Lesson 4): Phase 0 exists as prerequisite — no bear code ships without LLM-mock test infra.

## Dependencies

Builds on shipped: \`@bearly/tribe\`, bearly recall library (\`vendor/bearly/tools/recall/\`), session-context.ts, agent.ts, fanout.ts, context.ts. No breaking changes to existing CLI or hook interfaces — bear is additive.

## Non-goals

Not rebuilding tribe or recall. Not cross-user or shared-service. Not replacing MEMORY.md (that stays as curated long-term memory; bear is working memory + coordination). Not a product — personal infrastructure.

## Status

- Plan landed: 2026-04-17
- Phase 0 bead created. Phases 1–7 tracked in this description; sub-beads created at the moment each phase starts (avoids bead drift on a multi-week plan).
- Current recall (\`bun recall --agent\`) already delivers most memory value; bear is the consolidation endgame.