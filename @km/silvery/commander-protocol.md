---
id: "@km/silvery/commander-protocol"
aliases:
  - km-silvery.commander-protocol
  - km-silvery-commander-protocol
created_by: claude:6443387f
created_at: 2026-04-24T05:31:47Z
closed_at: 2026-04-24T06:15:35Z
close_reason: Moved out of beads (2026-04-23). Speculative brainstorming, not
  roadmap — docs at hub/silvery/future/ai-terminal/. Revisit after km + silvery
  1.0 ship, or when a concrete trigger emerges (showcase demo needs panes,
  CAP-adjacent opportunity, etc.).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.commander-protocol
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T22:32:02Z
    created_by: claude:6443387f
    metadata: "{}"
---

# [x] CAP: Commander App Protocol — AI-native CLI integration standard @km/silvery #feature #P4

blocks:: [[@km/silvery]]

A protocol that CLI apps speak to shells/agents — successor to OSC 133 shell integration for the structured/AI era. The leverage point that makes "millions of apps" tractable: apps adopt the protocol once, commander + agents integrate all CAP-speaking apps generically.

## Problem

Current shell integration (OSC 133, OSC 7, OSC 9) is stream-level and text-native. Agents parsing --help is fragile; no typed output; no capability discovery; no bidirectional control; no live introspection. Every integration is bespoke; long tail is uneconomic.

## What CAP carries

### 1. Manifest (JSON, on $PREFIX/share/cap/<app>.json or `<app> --cap-manifest`)
- Subcommands, flags, arg types (JSON Schema)
- Input/output types
- Exit codes + meanings
- Permissions required
- Capabilities (streaming, resumable, interactive, idempotent)
- Intent description for AI ranking

### 2. Typed streams (alongside classic stdout/stderr)
- **Blocks**: typed output units — table, log, diff, progress, prompt, image, tree
- **Events**: semantic — started, step(name), asks-user, wants-permission, finished

### 3. Bidirectional control
- Typed input to answer asks-user events
- Live-state queries (progress, current file, cancel cost)
- Structured cancellation
- Resume/suspend

### 4. Typed completion
- `<app> --cap-complete <partial>` returns typed entries (branch, file, PR, subcommand)
- Commander picks per-type picker UI

### 5. App-as-MCP-server
- Manifest doubles as MCP tool schema
- Agents call operations via typed tool calls, not text commands
- Human front-end: commander UI; agent front-end: MCP tools

## AI-native specifics

- **Intent-first palette**: "resize an image" → query CAP manifests by intent, rank by context
- **Natural-language flag forms**: describe-it field; agent fills flags; user reviews
- **Typed composition graphs**: agent proposes DAG of CAP ops; type-check at design time
- **Explainability**: blocks carry "how-i-got-here" provenance trail
- **Conversational refinement**: block is queryable dataset, not frozen text

## Scale model

- silvery-native apps (AutoCompletor, ff, etc.) adopt CAP natively — manifest is small, get integration free
- Non-silvery tools wrapped via `cap-wrap <cmd>` — heuristic manifest + output mapping
- Legacy tools fall through to current behavior — protocol is opt-in, not required
- Flywheel: author writes manifest → users + agents get rich experience → more authors adopt

## v0 (4-6 weeks)

1. Manifest format + JSON Schema — hand-write manifests for 5-10 canonical tools (git, ff, AutoCompletor, …)
2. Block stdout mode via CAP_OUTPUT=blocks env var — first 3-4 block types (log, table, progress, prompt)
3. Typed completion via --cap-complete
4. App registry — scan PATH at palette open
5. cap-wrap tool — wrap classic CLIs

## Relation to other beads

- `@silvery/commander` (@km/silvery/shell) — consumes CAP manifests for palette, forms, block rendering; CAP is what makes commander interesting beyond "Warp with a pretty palette"
- `km-silvery.multiplex` — CAP events flow through pane metadata; block search indexes CAP blocks
- `km-silvery.agent-harness` — agents use CAP-as-MCP to call apps directly instead of emitting text commands

## Comparison

- MCP: same shape, but server-side/always-running. CAP apps are CLI-invoked MCP servers.
- Raycast extensions: GUI-only, macOS-only, proprietary registry
- VS Code extensions: tied to VS Code
- nushell: structured data but no per-app protocol; wraps classics with parsers
- Shell integration (OSC 133): too thin, no manifest, no structured data

## Origin

2026-04-23 discussion — user's "millions of apps" framing + AutoCompletor/ff as existing silvery-native tools. The leverage realization: commander is only "better Warp" without a protocol; with CAP, it's a platform.