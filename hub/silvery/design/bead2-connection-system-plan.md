# Bead 2 Refactor Plan — `km-silvercode.connection-system`

**Workflow**: `/refactor plan` per `.claude/skills/refactor/SKILL.md`.
**Lessons applied**: `docs/lessons/refactoring.md` — delete first, fix second; no compat shims; phase order Update → Absorb → Purge → Remove → Fix; new packages get tests in same commit.

## Current state (as of 2026-04-26 ~15:00)

`apps/silvercode/src/index.tsx` is in a half-done state:

- `loadConfig({ appName: "km" })` is called but its result is dropped (no resolver hookup)
- `--config <path>` is wired (Agent A landed this)
- All legacy flags STILL DEFINED: `--track`, `--layout`, `--bare`, `--pane-headers`, `--account` (full form)
- `--agent` still validates against the old ACP registry ids (not the new label/string/builtin form)
- `mountConfigCommand` not called — `silvercode config <key>` subcommand doesn't exist
- Examples block still references `--bare`, `--layout`, `--pane-headers`

Files added by the bead 2 draft agent (correct, complete):

- `apps/silvercode/src/config-schema.ts` — `AcpEntryKind`, `McpKind`, `BUILTIN_AGENTS` (197 LOC)
- `apps/silvercode/src/resolve-connection.ts` — `resolveConnection(input?, config)` (166 LOC)

Two agents still in flight on top of this state:

- **Agent A** (`--config` wiring + env docs) — mostly done, --config flag is wired
- **Agent C** (doctor checks + claude-code-spawn shim) — adds checkers under `apps/silvercode/src/doctor/checkers/`

## Target state

```
silvercode [-a <label-or-string>] [--cwd P] [--resume ID] [--model M] [--account A] [--config P] [--log-dir P]
silvercode config [args...]                  # mounted via @silvery/config/commander
silvercode doctor [checker]
```

- `--track`, `--layout`, `--bare`, `--pane-headers` GONE from CLI (in-TUI controls planned later)
- `--agent <X>` accepts: registry label (looked up in `ai.acp.<X>`) / connection-string (`?` or `=`) / built-in id (claude-code, codex, gemini, copilot, claude-code-spawn)
- `--model`, `--account` stay as transient overrides (per-invocation only)
- `silvercode config ai.acp.foo=bar` and `silvercode config acp list|show|add|rm|default` wired
- Examples block + help text reflect the new surface
- `App.tsx` props: keep `layout` / `paneHeaders` / `bare` / `account` etc. — these are *internal* App contracts, set by index.tsx after resolution. CLI surface drops them; App contract stays for now.

## Phases

### Phase 1 — `km-silvercode.connection-system.phase1` — CLI integration

**Update**: bead description with current state (this doc + the agents' draft).
**Absorb**: nothing new (config-schema.ts and resolve-connection.ts already exist).
**Purge**: in `apps/silvercode/src/index.tsx`:

- Delete `--track <kind>` `.option()` (line ~50)
- Delete `--layout <mode>` `.option()` (line ~49)
- Delete `--bare` `.option()` (lines ~45-48)
- Delete `--pane-headers` `.option()` (lines ~67-70)
- Delete `--agent <id>` validator that lists ACP registry ids (lines ~51-61) — replace with simple string accept
- Delete the inline account-existence check (lines ~87-103) — moves into `resolveConnection`'s account-resolution OR doctor

**Remove**: dead references in index.tsx:

- `effectiveLayout` resolution (lines ~81-84) — App still needs `layout="single"` default
- `account` validation block (lines ~87-103)

**Fix** (`tsc`-guided after deletions):

- Replace action body: call `resolveConnection(opts.agent, config)` from `resolve-connection.ts`. Map result → App props (use `builtinToAcpRegistryId` shim from current index.tsx; refine in Phase 4 if needed).
- Mount `silvercode config` subcommand: `mountConfigCommand(program, config, { registries: { acp: { kind: AcpEntryKind, describe: e => e.label ?? e.agent }, mcp: { kind: McpKind, describe: e => e.command } } })`.
- Update help `addHelpText("after", ...)` Examples block: drop `--bare`, `--layout`, `--pane-headers`; add `silvercode config` examples.
- Update `--agent` description to: "connection: registry label, connection-string, or built-in agent id".

**New tests**:

- `apps/silvercode/tests/cli-resolve.test.ts` — exercises `resolveConnection` with: (a) registry label, (b) string form, (c) built-in id, (d) absent + env fallback. ≥6 tests.

**Definition of Done** (per refactoring.md Quick Checklist):

- [ ] Source code uses NewWay (resolveConnection, no legacy flags)
- [ ] Tests use NewWay (cli-resolve.test.ts created; existing tests still pass)
- [ ] CLAUDE.md / silvercode docs updated (Phase 3)
- [ ] grep finds NO OldWay patterns (per /complete below)
- [ ] New files have tests (cli-resolve.test.ts)

**/complete grep criteria**:

```bash
# Public CLI flags removed from action callback / option declarations
rg '\.option\("--track' apps/silvercode/src/index.tsx        # → 0
rg '\.option\("--layout' apps/silvercode/src/index.tsx       # → 0
rg '\.option\("--bare' apps/silvercode/src/index.tsx         # → 0
rg '\.option\("--pane-headers' apps/silvercode/src/index.tsx # → 0

# Resolver wired up
rg 'resolveConnection\(' apps/silvercode/src/index.tsx       # ≥1

# Config command mounted
rg 'mountConfigCommand' apps/silvercode/src/index.tsx        # ≥1

# Help text Examples cleaned
rg -- '--bare\b' apps/silvercode/src/index.tsx               # → 0 (Examples updated)
rg -- '--layout\b' apps/silvercode/src/index.tsx             # → 0
rg -- '--pane-headers\b' apps/silvercode/src/index.tsx       # → 0
rg -- '--track\b' apps/silvercode/src/index.tsx              # → 0

# Tests pass
bun vitest run apps/silvercode/tests/ --reporter=default     # all green
bun run typecheck 2>&1 | grep "apps/silvercode/src/index"    # 0 errors
```

### Phase 2 — `km-silvercode.connection-system.phase2` — Doctor checks (in-flight)

Agent C is doing this. Pending agent return.

**New checkers** under `apps/silvercode/src/doctor/checkers/`:

- `acp-default-points-to-existing-entry.ts` — error if `ai.acp.default` references missing entry
- `acp-entries-parse.ts` — error if any entry fails kind validation
- `mcp-references-resolve.ts` — error if dangling `mcp_servers: [...]` reference
- `acp-credentials-reachable.ts` — warning if no creds reachable (account/env/dir)

**`builtinToAcpRegistryId` shim** in index.tsx:

- `claude-code` → `"claude-code"`
- `claude-code-spawn` → undefined + sets `track: "claude"`
- `codex` → `"codex"`
- `gemini` → `"gemini"`
- `copilot` → `"github-copilot-cli"`
- Other → undefined + warn-log

**/complete grep criteria** (set by Agent C, verify on return).

### Phase 3 — `km-silvercode.connection-system.phase3` — Docs sweep

Update doc references to the new CLI shape:

- `apps/silvercode/CLAUDE.md` (if exists) — describe new flag set
- `CLAUDE.md` (km root) — silvercode CLI section if any
- `apps/silvercode/README.md` (if exists)
- `apps/silvercode/docs/in-process-mcp.md` — already audited, references are about MCP servers (not silvercode CLI), no change needed
- `hub/silvercode/` — search for stale CLI examples
- Bead descriptions — update `km-silvercode.connection-system` description with the actual final shape

**/complete grep criteria**:

```bash
# No stale CLI flag references in active docs (worktree-only matches don't count)
rg -l 'silvercode --(track|layout|bare|pane-headers)' apps/silvercode hub/silvercode CLAUDE.md  # → 0
```

### Phase 4 — `km-silvercode.connection-system.phase4` — Optional cleanup (deferred to follow-up bead)

These are documented follow-ups from the bead 2 draft agent, not in scope for connection-system to close:

- Controller refactor to consume `ResolvedConnection` directly (drop the `builtinToAcpRegistryId` shim) — separate bead `km-silvercode.controller-resolved-connection`
- App.tsx prop cleanup (drop `layout`, `paneHeaders`) — blocks on layout/pane-headers in-TUI beads — separate bead
- BUILTIN_AGENTS env auto-discovery for first-run UX — bead `km-silvercode.zero-config` (already exists)

## Acceptance for the epic (`km-silvercode.connection-system`)

After all 3 phases close:

- `silvercode --help` shows the new flag set, no legacy flags
- `silvercode config ai.acp.default=foo` writes to global, takes effect
- `silvercode --agent codex?model=gpt-5-mini` runs ad-hoc connection-string
- `silvercode --agent <built-in>` works without registry entry (creds via env or `~/.km/accounts/`)
- `silvercode doctor` validates the new schema
- All existing silvercode tests pass
- `bun run typecheck` for `apps/silvercode/src/` shows zero errors not present pre-bead-2
- No `@deprecated`, no compat re-exports, no fallbacks

## Execution strategy

1. **Wait for in-flight agents** (A: `--config` wiring landed; C: doctor checks pending).
2. **Reconcile** their state — verify what landed, what didn't.
3. **Phase 1** — single agent in worktree (per memory: parallel agents on foundational code MUST use worktrees; even though we'll run one agent, isolation prevents conflicts with the main worktree which has other in-flight WIP).
4. **Phase 2** — Agent C should have completed this; verify their /complete criteria.
5. **Phase 3** — quick docs sweep, can do solo or via agent.
6. **Commit + close**.

## Risk register

| Risk                                                                                       | Mitigation                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Bead 2 draft "aspirational done" — agent's report claimed LEGACY: markers that don't exist | Verify on return; trust nothing without grep                                    |
| Agent A and Agent C both editing index.tsx — race                                          | Sequential check after each return; reconcile before Phase 1                    |
| App.tsx props need updating but those are still required                                   | Keep App contract; index.tsx resolves CLI → props internally                    |
| Tests reference --bare / --layout semantics                                                | Agent B's report says minimal change needed; verify post-Phase-1                |
| Controller refactor scope creep                                                            | Explicitly punted to separate bead km-silvercode.controller-resolved-connection |

