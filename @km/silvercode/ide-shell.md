---
id: "@km/silvercode/ide-shell"
aliases:
  - km-silvercode.ide-shell
  - km-silvercode-ide-shell
created_by: claude:cd034ca4
created_at: 2026-04-26T15:55:08Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.ide-shell
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T08:55:12Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [ ] [TRACKING] silvercode IDE-shell — deferred multi-session/workspace chrome @km/silvercode #feature #P4

blocks:: [[@km/silvercode]]

Tracking bead for IDE-shell components that fall OUTSIDE ACP's vocabulary. ACP is session-shaped (one client ↔ one agent at a time) and has zero concept of workspaces, projects, file tabs, settings UI, or model/provider marketplaces — those are IDE chrome.

## Scope (deferred)
silvercode v1 is an ACP session client. IDE chrome is a separate product surface that gets re-evaluated if/when silvercode pivots toward an opencode-equivalent IDE shape.

## Sub-beads (deferred to P4)
- @km/silvercode/acp-comp-workspace-shell — sidebars, titlebar, file tabs
- @km/silvercode/acp-comp-terminal-panel — terminal as a tab (ACP has Terminal in ToolCallContent — that's in scope; standalone tab is not)
- @km/silvercode/acp-comp-settings-panels — General/Keybinds/Models/Providers
- @km/silvercode/acp-comp-marketplace-dialogs — provider/model/MCP pickers

## Re-evaluate
When silvercode has shipped and proven the session-client core (ACP-aligned components in @km/silvercode/acp), revisit whether IDE chrome adds enough value to justify the scope. Likely answer: ship a separate 'silvercode-ide' app rather than mixing concerns.