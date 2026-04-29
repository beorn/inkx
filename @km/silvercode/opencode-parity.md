---
id: "@km/silvercode/opencode-parity"
aliases:
  - km-silvercode.opencode-parity
  - km-silvercode-opencode-parity
created_by: claude:4de4a3ab
created_at: 2026-04-27T18:16:24Z
---

# [ ] [epic] Reach feature parity with opencode — LSP integration, fork/branch ergonomics, file-watch diagnostics, single-binary distribution @km/silvercode #epic #P2

blocks:: [[@km/silvercode]]

Reach feature parity with opencode on the four ergonomics gaps identified in the 2026-04-27 honest comparison. Catching up unlocks 'silvercode is a strict superset' positioning.

Children — file as separate beads:

P1 @km/silvercode/lsp                    LSP integration
  Per-workspace LSP client(s); diagnostics in side panel + inline squiggles; hover + go-to-def via autolinks; agent-facing tools (lsp_diagnostics, lsp_hover, lsp_definition) in @km/_orphan/mcp-server; doctor checker.
  Default registry: typescript-language-server / rust-analyzer / gopls / pyright. Configurable via ai.lsp.<name>.

P1 @km/silvercode/fork-branch-ux         Fork / branch ergonomics
  Replace flat session list with branch tree; /fork-here from any turn; auto-generated editable branch labels; branch-comparison split view; sub-100ms switch when agent supports loadSession (codex / pi / claude-acp).

P2 @km/silvercode/file-watch             File-watch + diagnostic surfacing
  chokidar wrapper (debounced, gitignore-respecting) + LSP-aware re-diagnose on change.
  Per-pane diagnostic badge; 'files changed' chip + popover; agent tools (workspace_recent_changes, workspace_diagnostics, workspace_diagnostics_summary, workspace_diff_since); apply-patch preview shows projected diagnostic delta; auto-surface via [AMBIENT] gated by @km/silvercode/ambient-context-excellence; doctor checker.
  Sister-coupling: lsp + ambient-context-excellence. Ship as a unit.

P3 @km/silvercode/single-binary          Single-binary distribution
  bun build --compile of silvercode + agent-harness + claude-acp + @km/_orphan/mcp-server + tribe-mcp.
  Distribute via npm: '@beorn/silvercode' (after audit). macOS arm64 + Linux x64/arm64. GH release platform binaries.

EPIC ACCEPTANCE — close when:
  1. All four children closed.
  2. README's 'Where opencode is ahead' caveat dropped from internal comparison.
  3. silvercode doctor lsp + silvercode doctor file-watch both ship.

Reference (2026-04-27 honest comparison, no public artifact):
  silvercode advantages: parallel multi-agent, ACP-native, typed [AMBIENT] pipeline, Silvery TUI, subscription-compatible Claude in-tree, descriptor-driven UI, cross-host tribe-mcp, in-tree storybook, doctor.
  opencode advantages (this epic): LSP, fork/branch UX, file-watch, single-binary.