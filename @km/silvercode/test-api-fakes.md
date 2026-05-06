---
mentions:
  - km
  - claude
id: "@km/silvercode/test-api-fakes"
aliases:
  - km-silvercode.test-api-fakes
  - km-silvercode-test-api-fakes
created_by: claude:0940ca20
created_at: 2026-04-24T21:55:51Z
closed_at: 2026-04-24T22:46:33Z
close_reason: "Fake factories for accountly (account+plan+quotas), claude
  --version, git branch, and HOME/XDG_CACHE_HOME isolation. Module-level
  overrides via
  setAccountFactoryOverride/setVersionFactoryOverride/setGitFactoryOverride;
  renderScenario({account,version,branch,fsRoot}) wires them per-test; dispose
  restores. Hook useClaudeAccount(factory?) accepts optional injection.
  SILVERCODE_FAKE_CLAUDE_VERSION env var handles SidePanel's module-load const
  probe. setup-fakes.ts is a global vitest setupFile so probes return fake
  before any test loads SidePanel. boundary-fakes.test.tsx adds 5 contract tests
  (one per faked boundary). Verification: tsc --noEmit clean; HOME=/tmp/empty
  bun vitest run apps/silvercode/tests/visual/ passes 20/20; full silvercode
  suite 19 files/73 tests pass. Commit 6be6ef66e."
started_at: 2026-04-24T22:37:05Z
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.test-api-fakes
    depends_on_id: km-silvercode.test-system
    type: parent-child
    created_at: 2026-04-24T14:55:56Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.test-system
---

# [x] Visual tests: fake accountly / git / version probe / fs reads @km/silvercode #feature #P2 @claude:0940ca20

blocks:: [[@km/silvercode/test-system]]

## Goal

Complete the v1 test-system promise that 'Anthropic/OpenAI fakes + multilayered' would cover all third-party API side effects. v1 shipped ScriptedFakeSession (Claude session path) but left these boundaries real or probed-at-module-load:

## Boundaries to fake

- **accountly** — `checkProfileQuota(profile)`, `keychainSlot`, `readKeychainForProfile`, `isLoggedIn`. Used by `useClaudeAccount` + SidePanel quota rows. Tests currently hit real disk cache at `~/.cache/silvercode/quota-*.json` or race-load the probe.
- **Claude CLI version probe** — `spawnSync("claude", "--version")` at module load in `claude-version.ts`. Reads whatever's installed in the test env.
- **Git branch** — `gitBranchFor()` shells out to git; depends on test cwd's repo state.
- **MCP subprocesses** — @km/_orphan/mcp-server + tribe-mcp. Not reached today because ScriptedFakeSession bypasses Claude spawn, but no explicit fake exists for their tool-call surface if tests start using real agent path.
- **File system reads/writes** — `~/.silvercode/`, log dirs. Tests that exercise history-view or multi-session-log functionality need a fake fs or a per-test temp dir.
- **Anthropic OAuth flow** — not exercised in current scenarios, but a full "contract test" mode will eventually exercise it.

## Approach

Factory pattern mirroring `spawnFactory` that already exists on AppProps:

- `accountFactory`: returns a fake `AccountProbe` with scripted quotas + plan
- `versionFactory`: returns a fake CLI version string
- `gitFactory`: returns a fake branch name
- `fsFactory` or scoped HOME/CACHE env vars during test

All factories default to real implementations in production. Test harness injects fakes.

## Acceptance

- Visual tests become fully deterministic (no disk state, no shell-outs, no real network)
- `tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/bearly | wc -l` → 0
- `bun vitest run apps/silvercode/tests/` count unchanged or higher
- One new scenario per faked boundary demonstrates the fake path works
- Doc entry in `apps/silvercode/docs/test-system-design.md` listing every faked boundary + factory entry point

## Relationship to parent

Child of `km-silvercode.test-system` epic. Required before `km-silvercode.test-live-mode` (contract-test toggle) makes sense — fakes must be complete before 'real vs fake' contract tests become meaningful.

