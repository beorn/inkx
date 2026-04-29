---
id: "@km/tribe/github-resource"
aliases:
  - km-tribe.github-resource
  - km-tribe-github-resource
created_by: claude:19080504
created_at: 2026-03-31T07:44:20Z
closed_at: 2026-03-31T07:53:05Z
close_reason: GitHub plugin (464 lines) polls API, broadcasts to all sessions.
  15 tests. github-channel.ts deprecated.
---

# [x] GitHub as tribe resource — centralized notifications via daemon @km/tribe #feature #P3

Move github-channel.ts from standalone MCP server to tribe resource plugin.

Currently: each Claude session spawns its own github-channel.ts process via .mcp.json. Wasteful — N sessions = N GitHub API polling loops.

Proposed: one proxy provides GitHub as a resource. Other proxies discover and connect directly (v2 Phase 3 pattern).

Requirements:
- GitHub plugin detects .git/ + gh auth status
- Provides: notifications, PR status, CI checks, issue updates
- Broadcast capability: push GitHub events to all sessions in the project (not just on request)
- Targeted delivery: route PR review requests to specific agents by domain
- Resource socket locking: first proxy to bind becomes the GitHub provider
- Watch TUI: show which session provides github resource

Implementation:
- New plugin in lib/tribe/plugins/ or lib/tribe/resources/
- ResourcePlugin interface with broadcast support (onChange → daemon broadcast or direct push to peers)
- Remove github from .mcp.json once resource plugin works
- daemon broadcast supports scoped delivery: all, project, or named session