---
id: "@km/silvercode/acp-comp-settings-panels"
aliases:
  - km-silvercode.acp-comp-settings-panels
  - km-silvercode-acp-comp-settings-panels
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:40Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.acp-comp-settings-panels
    depends_on_id: km-silvercode.ide-shell
    type: parent-child
    created_at: 2026-04-26T08:55:13Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-comp-settings-panels
    depends_on_id: km-silvery.overlay-vocabulary
    type: blocks
    created_at: 2026-04-26T08:37:57Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [ ] silvercode settings — SettingsList, General, Keybinds, Models, Providers, Keybind chip @km/silvercode #feature #P4

blocks:: [[@km/silvercode/ide-shell]], [[@km/silvery/overlay-vocabulary]]

Settings shell + per-section panels:
- <SettingsList> (left-rail nav + right pane)
- <SettingsGeneral>, <SettingsKeybinds>, <SettingsModels>, <SettingsProviders>
- <Keybind> chip primitive

Estimated ~900-1,300 LOC. Depends on: @km/silvery/overlay-vocabulary (<RadioGroup>, <Switch>).

Source plan: hub/silvery/future/ai-terminal/component-parity-plan.md § Tier 3 bead 10.