---
id: "@km/silvercode/connection-system/phase1"
aliases:
  - km-silvercode.connection-system.phase1
  - km-silvercode-connection-system-phase1
created_by: claude:4de4a3ab
created_at: 2026-04-26T22:13:27Z
closed_at: 2026-04-26T23:08:15Z
close_reason: "Shipped at 59b936a9 (silvery) + d1c7d3690 (km). 83 tests in
  @silvery/config; 8 tests in cli-resolve.test.ts; doctor checkers consolidated
  4→1; all /complete grep criteria pass (--track/--layout/--bare/--pane-headers
  all 0 hits; resolveConnection + mountConfigCommand wired; typecheck clean;
  help output lowercase + tight per /silverize convention; ~/...  paths shown in
  friendly form). Two follow-ups tracked: km-storage.adopt-silvery-config (P3)
  for km-cli unification; km-silvercode.zero-config (existing) for env-var
  auto-discovery."
---

# [x] Phase 1: CLI integration — drop legacy flags, wire resolveConnection, mount config command @km/silvercode #task #P1

blocks:: [[@km/silvercode/connection-system]], [[@km/silvery/config-package]]

Phase 1 of `km-silvercode.connection-system`. Plan at `hub/silvery/design/bead2-connection-system-plan.md`.

**Scope** (single agent in worktree per refactor lessons):

In `apps/silvercode/src/index.tsx`:
- DROP `.option("--track <kind>", ...)` declaration
- DROP `.option("--layout <mode>", ...)` declaration
- DROP `.option("--bare", ...)` declaration
- DROP `.option("--pane-headers", ...)` declaration
- REPLACE `--agent <id>` validator with simple string accept (no enum check; resolver handles validity)
- REWRITE action body: call `resolveConnection(opts.agent, config)` from `./resolve-connection.ts`. Map result → App props. Keep using `builtinToAcpRegistryId` shim for now.
- MOUNT `silvercode config` subcommand via `mountConfigCommand` from `@silvery/config/commander`, with `acp` (AcpEntryKind) + `mcp` (McpKind) registries.
- UPDATE `addHelpText("after", ...)` Examples block: drop `--bare/--layout/--pane-headers`; add `silvercode config` examples.
- DELETE inline account-existence check (the long error block) — `resolveConnection` + doctor handle it.

Add `apps/silvercode/tests/cli-resolve.test.ts`:
- ≥6 tests covering: registry label resolution, connection-string resolution, built-in id resolution, env var fallback, default fallback, missing entry error.

**/complete grep criteria**:
```bash
rg '\.option\("--track' apps/silvercode/src/index.tsx              # → 0
rg '\.option\("--layout' apps/silvercode/src/index.tsx             # → 0
rg '\.option\("--bare' apps/silvercode/src/index.tsx               # → 0
rg '\.option\("--pane-headers' apps/silvercode/src/index.tsx       # → 0
rg 'resolveConnection\(' apps/silvercode/src/index.tsx             # ≥1
rg 'mountConfigCommand' apps/silvercode/src/index.tsx              # ≥1
rg -- '--bare\b' apps/silvercode/src/index.tsx                     # → 0 (Examples updated)
rg -- '--layout\b' apps/silvercode/src/index.tsx                   # → 0
rg -- '--pane-headers\b' apps/silvercode/src/index.tsx             # → 0
rg -- '--track\b' apps/silvercode/src/index.tsx                    # → 0
bun vitest run apps/silvercode/tests/ --reporter=default | tail -5  # all green
bun run typecheck 2>&1 | grep "apps/silvercode/src/index"           # 0 errors
```

**Constraints**:
- No backwards-compat shims, no `@deprecated`, no fallbacks
- App.tsx contract stays as-is; index.tsx resolves CLI → App props internally
- Use a worktree (parallel agents on foundational code MUST use worktrees per project memory)

**Depends on**: @km/silvery/config-package (shipped), draft files in apps/silvercode/src/{config-schema,resolve-connection}.ts (shipped).