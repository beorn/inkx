---
id: "@km/silvercode/inproc-mcp"
aliases:
  - km-silvercode.inproc-mcp
  - km-silvercode-inproc-mcp
created_by: claude:0940ca20
created_at: 2026-04-24T20:43:25Z
closed_at: 2026-04-24T20:49:32Z
---

# [x] In-process MCP — eliminate km-mcp/tribe-mcp grandchild subprocesses @km/silvercode #task #P2

blocks:: [[@km/silvercode]], [[@km/silvercode/mcp-daemon]]

Research: can we eliminate the 2 MCP grandchild subprocesses (@km/_orphan/mcp, tribe-mcp) that Claude spawns per silvercode session? They contribute seconds to Ctrl+C shutdown because Node must drain the SIGTERM→stdio-close chain across all three processes.

Design doc: apps/silvercode/docs/in-process-mcp.md

Conclusion: Claude Code's --mcp-config JSON schema supports only stdio | sse | http — no UDS, no fd transport. In-process MCP exists in the Claude Agent SDK (createSdkMcpServer, type: "sdk") but not in the bare CLI.

Recommendation:
1. Task 1 (~1 day): Merge @km/_orphan/mcp + tribe-mcp into one bin. Halves the grandchild count for Track 1 (subscription) users. Immediate, structural, no upstream dependency.
2. Task 2 (~2-3 days): Wire createSdkMcpServer into the existing Track 2 (sdk-adapter.ts) path. Eliminates MCP grandchildren entirely for API-key users.
3. Task 3: File Anthropic feature request — in-process MCP for the bare CLI, or UDS/fd transport in the MCP spec. Only way to fully solve the problem for Track 1.

Not viable / rejected:
- UDS / fd / socket transport: not in Claude's public MCP transport enum.
- worker_threads shim: still spawns a shim child per MCP; doesn't help.
- proc.unref / SIGKILL: explicitly rejected by user.

Open questions in doc §Open questions — key one is whether Track 2 SDK can use subscription OAuth (CLAUDE_CONFIG_DIR path), which would let us default-switch everyone.