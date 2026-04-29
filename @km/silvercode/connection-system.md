---
id: "@km/silvercode/connection-system"
aliases:
  - km-silvercode.connection-system
  - km-silvercode-connection-system
created_by: claude:4de4a3ab
created_at: 2026-04-26T21:02:10Z
closed_at: 2026-04-26T23:08:15Z
close_reason: "Shipped at 59b936a9 (silvery) + d1c7d3690 (km). 83 tests in
  @silvery/config; 8 tests in cli-resolve.test.ts; doctor checkers consolidated
  4→1; all /complete grep criteria pass (--track/--layout/--bare/--pane-headers
  all 0 hits; resolveConnection + mountConfigCommand wired; typecheck clean;
  help output lowercase + tight per /silverize convention; ~/...  paths shown in
  friendly form). Two follow-ups tracked: km-storage.adopt-silvery-config (P3)
  for km-cli unification; km-silvercode.zero-config (existing) for env-var
  auto-discovery."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.connection-system
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T14:02:10Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-silvercode.connection-system
    depends_on_id: km-silvery.config-package
    type: blocks
    created_at: 2026-04-26T14:02:11Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [x] silvercode: adopt @silvery/config — ai.acp + ai.mcp registries @km/silvercode #feature #P2

blocks:: [[@km/silvercode]], [[@km/silvery/config-package]]

Replace silvercode's flag-soup CLI with @silvery/config-backed registries.

**Schema** (~/.km/config.yaml):
- ai.acp.<name> — connection entries (string or object form). Reserved key: "default".
- ai.acp.default — name of the active connection (mutated by config command).
- ai.mcp.<name> — MCP server definitions.

**Connection entries** support string and object forms:
  - String: "claude-code?account=bjorn@stabell.org&model=opus-4.7&bare"
  - Object: { base: "claude-code?...", label, color, mcp_servers, permissions }

**Connection string grammar**: schemeless by default; <agent>[?<key>=<value>&...]; query params over userinfo (handles emails); type coercion (boolean/number/array/nested); explicit scheme override only for non-default transport (rare: spawn://, acp+http://).

**CLI changes**:
- DROP from top-level: --track, --layout, --pane-headers, --bare, --account
- KEEP: --cwd, --resume, --log-dir, --model (transient override)
- GENERALIZE --agent: accepts registry-label, connection-string, or built-in agent id
- ADD subcommands: config (git-style), acp list|show|add|rm, mcp list|show|add|rm, doctor

**Resolution order** when --agent X given:
  1. registry connection label (ai.acp.<X>)
  2. connection-string (X contains ? or =)
  3. built-in agent id (BUILTIN_AGENTS map)
  4. error with actionable message

**Resolution order** when --agent omitted:
  1. SILVERCODE_CONNECTION env
  2. ai.acp.default
  3. built-in fallback (claude-code with cred env-var auto-discovery)

**Layout/pane-headers** move into TUI (separate bead, not blocking).

**Depends on**: @km/silvery/config-package