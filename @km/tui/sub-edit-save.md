---
id: "@km/tui/sub-edit-save"
aliases:
  - km-tui.sub-edit-save
  - km-tui-sub-edit-save
created_by: Bjørn Stabell
created_at: 2026-04-02T00:11:17Z
closed_at: 2026-04-02T00:16:24Z
---

# [x] Sub-item edit changes not saved when cursoring out @km/tui #bug #P1 @Bjørn Stabell

When editing a sub-item (child of a card) and pressing ctrl-n/arrow to navigate away, the edit is not saved. The explicit save() call in handleEditBlockNavigate fires but activeEditTargetRef.current may be null for sub-items. The auto-save on unmount (useEditContext line 326-329) should catch it, but may not be wired correctly for sub-item edit fields.