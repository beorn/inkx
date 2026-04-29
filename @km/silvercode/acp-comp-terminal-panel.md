---
id: "@km/silvercode/acp-comp-terminal-panel"
aliases:
  - km-silvercode.acp-comp-terminal-panel
  - km-silvercode-acp-comp-terminal-panel
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:39Z
---

# [ ] silvercode terminal panel — pipeBackend at v0, vt100/vterm integration spike @km/silvercode #feature #P4

blocks:: [[@km/silvercode/acp-comp-workspace-shell]], [[@km/silvercode/ide-shell]]

Terminal-as-tab:
- <TerminalPanel> with pipeBackend (default v0, ~80% of agent commands)
- <TerminalLabel>

Estimated ~400-600 LOC. Depends on: @km/silvercode/acp-comp-workspace-shell (file-tabs / sortable-tab pattern). May split a vt100/vterm vendor-eval sub-bead.

Source plan: hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 2 bead 9.