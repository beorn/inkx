---
id: "@km/bear/mcp-wrapper"
aliases:
  - km-bear.mcp-wrapper
  - km-bear-mcp-wrapper
created_by: Bjørn Stabell
created_at: 2026-04-17T06:28:53Z
closed_at: 2026-04-17T06:38:10Z
close_reason: "Phase 1 done: @bearly/bear MCP server wrapping recall library.
  New package vendor/bearly/plugins/bear/ with server.ts (220 LOC), tests (190
  LOC, 7 test cases), README, package.json. Three tools shipped: bear.ask
  (recallAgent wrapper), bear.current_brief (session-context wrapper),
  bear.plan_only (round-1 planner only, no fanout/synth). Follows tribe-proxy
  house style: Server API, raw JSON schema, CallToolRequestSchema handler, stdio
  transport, error-to-content struct. Registered in .mcp.json. SKILL.md
  migrated: 'use bun recall for in-turn' → 'prefer bear.ask when MCP
  registered'. All 100 tests green (93 history + 7 plugin). /complete verified:
  package dir + 4 files exist, 7 test cases (≥3 target), 1 MCP entry, 0 hits of
  old skill guidance, 2 bear.ask mentions in skill, server starts cleanly. Ready
  for Phase 2 (daemon)."
---

# [x] Phase 1: @bearly/bear MCP server wrapping existing recall library @km/bear #task #P2 @Bjørn Stabell

blocks:: [[@km/bear]], [[@km/bear/test-infra]]

Validates MCP wrapping pattern with minimum risk. Follows tribe-proxy.ts house style (raw JSON schema, Server API, CallToolRequestSchema handler, error-to-content struct, StdioServerTransport).

## Scope

- `vendor/bearly/plugins/bear/` (NEW package) — package.json, server.ts, README.md, CHANGELOG.md
- `plugins/bear/server.ts` — stdio MCP server exposing 3 tools:
  - `bear.ask({ query, options })` → calls `recallAgent()` from recall library
  - `bear.current_brief({ sessionId? })` → calls `getCurrentSessionContext()`  
  - `bear.plan_only({ query })` → calls `planQuery()` for round 1 only; returns variants + plan without fanout (fast exploration)
- `plugins/bear/package.json` — publishable as `@bearly/bear`, private initially
- `plugins/bear/tests/server.test.ts` — 1 test per tool minimum (era2 Lesson 4)
- `.mcp.json` — add bear entry
- `.claude/skills/recall/SKILL.md` — migrate 'use `bun recall`' for in-turn calls to 'use `bear.ask` when bear MCP registered'

## Delete

- Skill-doc references to `bun recall --agent` for Claude-invoked queries (human CLI usage stays)
- `RECALL_AGENT` env-var documentation (the MCP is the agent path now for Claude Code; env var remains functional as a CLI escape hatch)

## New tests

- `plugins/bear/tests/server.test.ts` — 3 tools × ≥1 test = ≥3 tests, mocking the MCP transport and library backends

## /complete criteria

```bash
# Package exists with required files
test -d vendor/bearly/plugins/bear
test -f vendor/bearly/plugins/bear/package.json
test -f vendor/bearly/plugins/bear/server.ts
test -f vendor/bearly/plugins/bear/README.md

# Tests in same commit (era2 Lesson 4)
ls vendor/bearly/plugins/bear/tests/*.test.ts  # → ≥1 file
grep -c '^\s*test(' vendor/bearly/plugins/bear/tests/*.test.ts  # → ≥3

# MCP registered
rg '"bear"' .mcp.json  # → ≥1

# Skill migrated
rg 'use .bun recall. for in-turn' .claude/skills/recall/SKILL.md  # → 0
rg 'bear\.ask' .claude/skills/recall/SKILL.md  # → ≥1

# Server starts without error
timeout 2 bun vendor/bearly/plugins/bear/server.ts --help || test $? -eq 124  # → 124 (timed out = server running) or 0

# All new tests pass
bun vitest run vendor/bearly/plugins/bear/tests/ 2>&1 | tail -3  # → 0 failed
```

## MANDATORY first step

Read docs/lessons/refactoring.md IN FULL before writing any code.