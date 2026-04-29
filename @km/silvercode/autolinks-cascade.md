---
id: "@km/silvercode/autolinks-cascade"
aliases:
  - km-silvercode.autolinks-cascade
  - km-silvercode-autolinks-cascade
created_by: claude:2405c72e
created_at: 2026-04-25T10:10:30Z
closed_at: 2026-04-25T12:51:31Z
close_reason: "Shipped: km main dc218632c. Cascade: workspace
  ~/.silvercode/links.toml first, per-vault <cwd>/.silvercode/links.toml second;
  vault rules with matching source REPLACE workspace rule at original index,
  otherwise append. Pure cascadeAutolinks() exported for unit testing. 20/20
  autolinks config tests pass (15 prior + 5 new cases: append,
  replace-preserves-position, mixed, empty-workspace, empty-vault)."
started_at: 2026-04-25T12:49:46Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.autolinks-cascade
    depends_on_id: km-silvercode.autolinks-config
    type: parent-child
    created_at: 2026-04-25T03:10:56Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Configurable autolinks: workspace-level + per-vault cascade @km/silvercode #task #P3 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-config]]

Cascade workspace-level (`~/.silvercode/links.toml`) and per-vault (`<cwd>/.silvercode/links.toml`) autolinks. Vault rules win on duplicate patterns. v1 ships per-vault only; this bead adds the workspace layer.

Parent: @km/silvercode/autolinks-config