---
id: "@km/infra/llm-entry-point-audit"
aliases:
  - km-infra.llm-entry-point-audit
  - km-infra-llm-entry-point-audit
created_by: claude:0590a583
created_at: 2026-04-20T23:31:48Z
closed_at: 2026-04-20T23:35:35Z
close_reason: "Audited 14 entries (2 plugin CLIs + 12 tools/*); 0 double-firing;
  llm fix in 285fc04 verified via 3 invocation paths (shim, direct run,
  simulated import+call). Only 3 files are imported as modules
  (tools/{llm,recall}.ts → guarded plugin cli.ts, tests → worktree.ts also
  guarded). 8 spawn-only tools have unguarded top-level work but are safe today
  (never imported). Report: /tmp/bearly-entry-audit.md"
---

# [x] Audit bearly CLI entry wrappers for double-fire pattern @km/infra #task #P2 @claude:0590a583

blocks:: [[@km/infra]]

Root cause: commit bearly@943c8154 (2026-04-17) left module-level main() in plugins/llm/src/cli.ts AND added await main() in tools/llm.ts shim. Every bun llm invocation fired twice concurrently for 3 days (Apr 17 - Apr 20), double-billing ~$10-30 on Pro calls. Fixed in bearly@285fc04 with import.meta.main guard.

Audit scope:
1. Every tools/*.ts in vendor/bearly — check for the pattern: wrapper imports main() from plugins/*/src/cli.ts AND plugin's cli.ts has unguarded module-level main() invocation.
2. Every plugins/*/src/cli.ts — ensure import.meta.main guard on any top-level async invocation.
3. Other bun-run CLIs in tools/: refactor.ts, recall.ts, tribe-cli.ts, tty.ts, worktree.ts, playwright-tty-mcp.ts, qmd-watchdog.ts.

For each entry point:
- Grep for module-level main()/run() calls + paired await in a wrapper.
- Run a single smoke invocation, count side-effectful outputs (network calls, file writes, stderr lines).
- Fix with import.meta.main guard where unprotected.

Process layer (already agreed, tripwire NOT needed):
- feedback-cost-inducing-cli-changes.md is now canonical for CLI-wrapper cost discipline.
- Before committing any llm/cli entry wrapper change, run one cheap smoke call and confirm single-fire.