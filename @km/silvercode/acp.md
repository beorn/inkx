---
id: "@km/silvercode/acp"
aliases:
  - km-silvercode.acp
  - km-silvercode-acp
created_by: claude:cd034ca4
created_at: 2026-04-26T08:10:52Z
closed_at: 2026-04-27T07:19:14Z
close_reason: "All 28 sub-beads closed. ACP boundary adapter shipped
  (foundation, client, session, adapters for Claude/Codex/Gemini/pi, fake,
  storybook, multi-agent, channels, tribe-mcp, km-mcp, permission UI, probe
  runner, session/load). Recent OSC 8 hyperlinks + cwd-aware autolinks (commits
  21f00d6e4, f3cae30fb) round out the user-visible polish. Quarterly re-evaluate
  gate (per description): keep boundary adapter until Zed reaches 100% spec
  coverage AND protocol bumps to v2 — neither holds yet, so the adapter stays.
  Reopen if either gate flips."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.acp
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T01:10:52Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] [TRACKING] ACP adoption — silvercode's bet on Agent Client Protocol as canonical domain model @km/silvercode #feature #P1

blocks:: [[@km/silvercode]]

Tracking bead for all ACP-related work in silvercode. The bet (revised 2026-04-26 after adoption research): use ACP at the I/O boundary, not as the canonical internal vocabulary. Silvercode defines its own canonical types — shaped like ACP at v1 because ACP got the shape mostly right — and converts at the adapter layer. Same way silvercode would treat LSP or any other vendor protocol.

## Why a boundary adapter, not canonical adoption
- Zed doesn't fully implement its own spec months after release (session resume / permission requests / plan updates) — independently confirmed by OpenClaw's ACP audit
- ACP SDK type surface churned twice in 5 months (v0.7.0, v0.8.0 breaking changes). Wire stable, types are not
- Naming collision with IBM/A2A 'Agent Communication Protocol' — Linux Foundation governance there, single-vendor (Zed) here
- @agentclientprotocol/claude-agent-acp is Zed-published, not Anthropic-published (Anthropic issue claude-code#6686 still a feature request)
- See full research in conversation transcript and hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Reality check

## Why still bet on ACP at all
- Subscription-plan auth (Claude Pro/Max, ChatGPT Plus/Pro, Gemini Advanced) requires Type-A wrapping — direct API would force per-token billing
- Goose, OpenCode, Gemini CLI, Augment, Copilot CLI all ship ACP servers. JetBrains, Neovim, Emacs ship clients. Real ecosystem
- Free outbound interop: implementing ACP server for silvery agents = consumable by Zed/Neovim/OpenACP for free
- Boundary adapter is ~50-100 LOC, isolates breaking changes to one file

## Re-evaluate quarterly
Promote ACP types to canonical (drop silvercode-types layer) when BOTH:
1. Zed reaches 100% spec coverage in its own client
2. Protocol version bumps to 2 with a real deprecation policy

## Scope (sub-beads)
- @km/silvercode/acp-foundation — silvercode canonical types + ACP boundary adapter
- @km/silvercode/acp-client — scope-bound ClientSideConnection factory
- @km/silvercode/acp-session — signals/projections/trees over silvercode SessionUpdate
- @km/silvercode/acp-adapter-claude — Claude Code stream-json → silvercode types
- @km/silvercode/acp-adapter-codex — Codex stream-json → silvercode types
- @km/silvercode/acp-adapter-gemini — Gemini CLI stream-json → silvercode types
- @km/silvercode/acp-adapter-pi — pi (via pi-acp or pi --mode rpc bridge) → silvercode types
- @km/silvercode/acp-storybook — silvercode component storybook (consumes silvercode types)

## Reference
- Architecture + research: hub/silvery/future/ai-terminal/10-agent-router-landscape.md
- ACP SDK: @agentclientprotocol/sdk (npm), github.com/zed-industries/agent-client-protocol
- Existing ACP servers: @zed-industries/claude-code-acp, @zed-industries/codex-acp, opencode acp, pi-acp ecosystem