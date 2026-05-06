---
mentions:
  - km
  - claude
id: "@km/silvercode/zero-config"
aliases:
  - km-silvercode.zero-config
  - km-silvercode-zero-config
created_by: claude:4de4a3ab
created_at: 2026-04-26T21:02:30Z
closed_at: 2026-04-26T23:23:31Z
close_reason: "Shipped at 3fb69fdfe (silvercode zero-config) + 8057ee61c (km-cli
  adopt). Zero-config: autoResolveAccount + preflightCredentials in
  resolve-connection.ts; 8 new tests in zero-config.test.ts; 16/16 pass. Storage
  adopt: hybrid (sync internal + async app boundary) — bd-load-config.ts
  adapter, 17 call sites switched, cosmiconfig dep dropped from km-storage. 8035
  tests pass overall. Architectural deviation from pure spec (sync constraint)
  documented in commit body. Follow-ups: 'km config' top-level subcommand via
  mountConfigCommand needs a KmKind schema (separate bead if pursued);
  getFolderIndexConfig + getCollapseParseConfig stay sync."
started_at: 2026-04-26T23:10:15Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-silvercode.zero-config
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T14:02:35Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-silvercode.zero-config
    depends_on_id: km-silvercode.connection-system
    type: blocks
    created_at: 2026-04-26T14:02:35Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode
      - type: link
        target: km-silvercode.connection-system
---

# [x] silvercode: zero-config first-run via BUILTIN_AGENTS + env-var fallback @km/silvercode #feature #P2 @claude:4de4a3ab

blocks:: [[@km/silvercode]], [[@km/silvercode/connection-system]]

silvercode should Just Work with no config file if creds are present in env vars or ~/.claude/.

**Built-in agents** (in code, not user config):
  claude-code:       transport=acp,   cred_env=[ANTHROPIC_API_KEY], cred_dir=~/.claude
  claude-code-spawn: transport=spawn, cred_env=[ANTHROPIC_API_KEY], cred_dir=~/.claude (legacy)
  codex:             transport=acp,   cred_env=[OPENAI_API_KEY]
  gemini:            transport=acp,   cred_env=[GEMINI_API_KEY, GOOGLE_API_KEY]
  copilot:           transport=acp,   cred_env=[GITHUB_TOKEN]

Each declares: transport, command, args, default_model, cred_env list, cred_dir, supports flags.

**Built-in fallback connection** when ai.acp.default is unset and no --agent given:
  { agent: "claude-code", account: <auto>, model: <agent default> }

**account: <auto> resolution** per agent:

1. If user named an account (--account or via connection): ~/.km/accounts/<name>/
2. Else cred_dir if populated (~/.claude/)
3. Else first matching cred_env env var that's set
4. Else error: "No credentials for <agent>. Set <ENV_VAR> or run `silvercode auth login`."

**ai.custom_agents:** escape hatch for power users (rare):
  custom_agents:
    my-fork-of-claude:
      transport: spawn
      command: ~/Code/claude-fork/cli

**Tests**:

- ANTHROPIC_API_KEY set, no config → connects to Claude
- ~/.claude populated, no env, no config → connects to Claude
- OPENAI_API_KEY set, --agent codex → connects via env
- No creds anywhere → actionable error message

**Depends on**: @km/silvercode/connection-system

