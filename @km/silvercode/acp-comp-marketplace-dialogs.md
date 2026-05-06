---
mentions:
  - km
id: "@km/silvercode/acp-comp-marketplace-dialogs"
aliases:
  - km-silvercode.acp-comp-marketplace-dialogs
  - km-silvercode-acp-comp-marketplace-dialogs
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:40Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.acp-comp-marketplace-dialogs
    depends_on_id: km-silvercode.ide-shell
    type: parent-child
    created_at: 2026-04-26T08:55:13Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-comp-marketplace-dialogs
    depends_on_id: km-silvery.overlay-vocabulary
    type: blocks
    created_at: 2026-04-26T08:37:58Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.ide-shell
      - type: link
        target: km-silvery.overlay-vocabulary
---

# [ ] silvercode marketplace dialogs — Model/Provider/MCP pickers @km/silvercode #feature #P4

blocks:: [[@km/silvercode/ide-shell]], [[@km/silvery/overlay-vocabulary]]

Provider/model/MCP marketplace UI (mostly dialog scaffolding + assets):

- <DialogSelectModel>, <DialogSelectProvider>, <DialogConnectProvider>, <DialogCustomProvider>, <DialogManageModels>
- <ModelTooltip>, provider-icon set
- <DialogSelectMcp>, <DialogSelectServer>

Estimated ~1,300-2,000 LOC. Depends on: @km/silvery/overlay-vocabulary (<HoverCard> for tooltip).

Source plan: hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 3 bead 11.

