---
mentions:
  - km
  - Bjørn
id: "@km/infra/exec-to-import"
aliases:
  - km-infra.exec-to-import
  - km-infra-exec-to-import
created_by: Bjørn Stabell
created_at: 2026-04-12T05:10:49Z
closed_at: 2026-04-12T05:39:11Z
close_reason: "Audit found no valid targets. 28 exec/spawn sites: all 26 KEEP
  are legitimate (external tools git/npm/gh/find/macOS open, daemonize+detach
  for km daemon, PTY harness via termless, per-file test timing isolation,
  autoresearch LLM CLIs, and crucially the release verify step which needs fresh
  Node subprocess to test published tarball in clean module cache). 2 AMBIGUOUS
  are autoresearch→complexity-report calls — negligible benefit,
  complexity-report has no main() export and itself forks bunx oxlint anyway.
  The @silvery/examples static-registry pattern works inside ONE CLI but doesn't
  generalize to cross-package invocation in km. Pattern proven where it applies;
  no further migration warranted."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.exec-to-import
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T22:11:09Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Switch from exec/spawn to dynamic import everywhere @km/infra #task #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

Replace child_process exec/spawn of local CLIs with dynamic import + await mod.main() across the codebase.

**Why**: The @silvery/examples bundle refactor proved the pattern works and is superior:

- No process boundary overhead (instant vs fork+exec)
- Shared module cache, shared memory, single process
- No ERR_UNKNOWN_FILE_EXTENSION issues from Node stripping TS types in node_modules
- No tarball-includes-raw-source bugs (bin field points at bundled dist, not raw src)
- Bundled output is what ships; local tests use the same code path consumers will
- Easier to test (can mock, can measure, can await results)

**Pattern** (from vendor/silvery/examples/bin/cli.ts):

- Static registry (imports all modules at top)
- CLI entry calls `await mod.main()` instead of spawning a subprocess
- Build to dist/*.mjs via tsdown, publish only dist

**Scope**: Audit all places that exec/spawn local CLI tooling:

- release.ts verify step (currently spawns bin/<cli> --help)
- Any test harness that forks @km/_orphan/cli or silvery-cli
- Test fixtures that spawn examples
- Any skill that shells out to a local bun script when it could just import

Keep exec/spawn for:

- Real subprocess needs (pty, signal handling, isolation)
- External tools (git, npm, gh)
- Cross-runtime boundaries (node→bun or vice versa)

**Acceptance**: All local-to-local CLI invocations use dynamic import. Subprocess only for genuine process-isolation needs.

