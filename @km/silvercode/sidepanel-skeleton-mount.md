---
id: "@km/silvercode/sidepanel-skeleton-mount"
aliases:
  - km-silvercode.sidepanel-skeleton-mount
  - km-silvercode-sidepanel-skeleton-mount
created_by: claude:2405c72e
created_at: 2026-04-28T19:36:38Z
closed_at: 2026-04-28T20:02:41Z
close_reason: >-
  Fixed the ~10s blank-screen bug at silvercode startup.


  Root cause: App rendered nothing useful until the initial spawn microtask

  resolved a SessionHandle into sessions[]. Both SidePanel and PaneGrid

  early-returned for the empty state, leaving a blank alt-screen until

  ~10s after firstCommit (the actual delay being claude --version probe

  latency under stale OAuth refresh token).


  Fix (4 files):

  - apps/silvercode/src/App.tsx: drop `focused ? <SidePanel /> : null` gate

  - apps/silvercode/src/components/SidePanel.tsx: split into SidePanel
    (entry) → FocusedSidePanel / EmptySidePanel → SidePanelChrome with
    nullable SessionState
  - apps/silvercode/src/components/PaneGrid.tsx: ◈ Spawning session…
    placeholder when sessions=[]
  - apps/silvercode/src/claude-version.ts: void getClaudeVersion() eager
    warmup at module-eval

  Branch: feat/km-silvercode.sidepanel-skeleton-mount

  Commits on origin:

  - 6a43d5812 fix(silvercode): SidePanel + PaneGrid skeleton mount before first
  session

  - e99373a09 test(silvercode): empty-state-render regression for
  sidepanel-skeleton-mount

  Origin SHA verified via git ls-remote:
  e99373a0904266bce629bae48445dfff11a1d738


  Test: apps/silvercode/tests/empty-state-render.test.tsx (1 new test).

  Pins spawnFactory: () => new Promise<never>(() => {}) so sessions[] stays

  empty for the entire render — mirrors the user's 0-to-spawn window.

  Asserts SidePanel mode label, branding row, and PaneGrid placeholder

  all paint, frame has >100 non-whitespace chars.


  Verification:

  - tsc --noEmit: 3 errors (baseline, all pre-existing in unrelated files
    apps/km-tui/tests/keys-as-text.test.ts:274 + packages/km-beads/tests/
    migrate.test.ts:178+185); 0 new from these changes
  - bun fix: clean

  - bun vitest run apps/silvercode/tests/: 709 passed | 5 skipped (714) in 7.96s
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.sidepanel-skeleton-mount
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:36:37Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Render SidePanel + skeleton pane immediately, don't wait for spawn (fixes 10s blank screen) @km/silvercode #bug #P0

blocks:: [[@km/silvercode]]

Currently SidePanel returns null when 'focused' is undefined (RequestPermissionInbox / SessionCard / SidePanel all gate on focused session existing). Initial spawn is async (~10s in user's environment) so the screen stays blank for 10s after firstCommit.

Fix: render placeholders that don't depend on focused session.

- SidePanel: when focused is null, render the panel with sessions list (always available from controller.snapshot()), todos count = 0, account info from useClaudeAccount (already async via Suspense), git branch (sync from gitBranchFor), mode='auto', cwd label. Skip the agent-version block when no focused.
- PaneGrid: when sessions=[] and tree has no leaves, render a centered '◈ Spawning…' placeholder pane.
- ClaudeVersionSuffix: trigger getClaudeVersion() promise EAGERLY at module-eval time so the spawn fires before SidePanel even mounts (it's already cached by getClaudeVersion).

Files: apps/silvercode/src/components/SidePanel.tsx (drop 'if (!focused) return null'), apps/silvercode/src/components/PaneGrid.tsx (empty-tree placeholder), apps/silvercode/src/claude-version.ts (eager warmup).

Acceptance:
- Empty-state SidePanel renders with sessions/cwd/branch/mode rows
- Empty-state PaneGrid renders 'Spawning…' placeholder
- termless test: render App with controller.snapshot()=[] → screen shows SidePanel and 'Spawning…' immediately, NOT blank
- claude-version probe fires within 100ms of process start, not 10s