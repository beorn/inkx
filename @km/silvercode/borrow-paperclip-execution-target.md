---
aliases:
  - km-silvercode.borrow-paperclip-execution-target
  - km-silvercode-borrow-paperclip-execution-target
created_at: 2026-05-07T19:15:23.329Z
---

# Borrow Paperclip's execution-target abstraction for sandboxed/SSH/remote agent spawn #P1

Study and selectively port `@paperclipai/adapter-utils/execution-target` (and its supporting modules: `prepareAdapterExecutionTargetRuntime`, `runAdapterExecutionTargetProcess`, `adapterExecutionTargetIsRemote`, `adapterExecutionTargetUsesManagedHome`, `startAdapterExecutionTargetPaperclipBridge`, `shapePaperclipWorkspaceEnvForExecution`). Goal: when silvercode grows the ability to spawn an ACP agent inside a sandbox, on a remote SSH host, or in a Daytona/Modal-style cloud workspace, the abstraction is already there. Source-of-truth lives in github.com/paperclipai/paperclip under packages/adapter-utils/src/{execution-target.ts, sandbox-managed-runtime.ts, remote-managed-runtime.ts, ssh.ts, sandbox-callback-bridge.ts, sandbox-shell.ts}.

Acceptance:
- Document in apps/silvercode/docs/execution-target.md what we'd adopt vs adapt vs skip; explicit out-of-scope list (Paperclip-bridge HTTP, paperclip-specific env shaping).
- Decide vendored fork vs npm dep on `@paperclipai/adapter-utils` — note their per-target tests are tight and the package is published.
- Wire one execution-target — local-cwd as the trivial target — through the silvercode ACP spawn path so the seam exists, even if the only target is local. This is the carve-out cost.
- Defer SSH/Docker/sandbox targets behind beads (followups). The point of this bead is the seam, not the targets.
- Cross-reference: hub/silvercode/future/ai-terminal/06-commander.md (exec engine) and apps/silvercode/src/controller.ts (current spawn path).
