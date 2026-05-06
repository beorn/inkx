---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-probe-runner"
aliases:
  - km-silvercode.acp-probe-runner
  - km-silvercode-acp-probe-runner
created_by: claude:cd034ca4
created_at: 2026-04-26T16:00:03Z
closed_at: 2026-04-26T16:10:01Z
close_reason: >-
  Shipped `apps/silvercode/tests/probe-acp.ts` — usage: `bun
  apps/silvercode/tests/probe-acp.ts <registryId> [prompt]`. Smoke-tested all 5
  agents:


  - claude-code: ✓ end-to-end (3 text-deltas, end_turn in ~11s, via
  @km/claude-acp local-bin override)

  - codex: ✓ end-to-end (chatgpt subscription auth, end_turn in ~10s)

  - pi-acp: ✓ end-to-end (pi_terminal_login, end_turn in ~9s)

  - gemini: ⚠ connects but stdout pollution breaks parser → tracked
  km-silvercode.acp-gemini-stdout-pollution

  - github-copilot-cli: ⚠ `copilot` binary not installed locally (no env to
  test)


  Side fixes shipped: ACP_REGISTRY commands changed from `npx -y` to `bun x`
  (npx breaks inside km monorepo due to $@silvery/* workspace overrides —
  feedback-npx-mcp-from-workspace.md). registry-adapters.test.ts updated to
  match. 14/14 tests pass.


  Local override for claude-code (private package, not on npm yet) lives in the
  probe itself; will retire when @km/claude-acp publishes.
started_at: 2026-04-26T16:00:05Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-probe-runner
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T09:00:03Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.acp
---

# [x] silvercode probe-acp — smoke test runner for connectAcpRegistry across all 5 agents @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]]

Standalone probe script that exercises any registered ACP agent end-to-end without the full silvercode UI. Lets us smoke-test Claude/Codex/Gemini/Copilot/Pi connectivity individually before wiring the controller.

## Usage

```
bun apps/silvercode/tests/probe-acp.ts <registryId> [prompt]
# Examples:
bun apps/silvercode/tests/probe-acp.ts claude-code 'list files in current directory'
bun apps/silvercode/tests/probe-acp.ts gemini 'hello'
```

## What it prints

- Capabilities + authMethods + protocolVersion from initialize
- SessionUpdate stream summary (kind counts) as it arrives
- Final stopReason
- ToolCall summary if any tools were used

## Auth notes per agent

- claude-code: requires CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in env
- codex: requires ChatGPT subscription auth (codex-acp handles OAuth)
- gemini: requires Google sign-in (gemini-cli handles OAuth)
- github-copilot-cli: requires `copilot` binary on PATH
- pi-acp: requires pi config

## Acceptance

- bun apps/silvercode/tests/probe-acp.ts claude-code 'hi' → completes with stop_reason
- Probe handles missing-binary errors gracefully (prints install hint, exits non-zero)
- ACP names everywhere (uses ContentBlock, ToolCall, SessionUpdate, RequestPermission per acp-naming.md)

