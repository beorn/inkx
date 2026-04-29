---
id: "@km/inkx/editctx-contract"
aliases:
  - km-inkx.editctx-contract
  - km-inkx-editctx-contract
created_by: claude:fcaad2fa
created_at: 2026-02-17T23:52:56Z
closed_at: 2026-02-18T00:23:16Z
owner: bjorn@stabell.org
---

# [x] Document and enforce useEditContext confirm/cancel contract @km/inkx #task #P2

useEditContext has an implicit auto-save-on-unmount that fires onConfirm if cancelledRef is not set. This caused @km/_orphan/qaco9 (date dialog double-confirm).

DONE:
1. JSDoc warning added to useEditContext documenting the auto-save hazard
2. Created useDialogInput hook in @km/tui that encapsulates safe dialog text input
3. Refactored all 4 dialogs (DatePromptDialog, NewItemDialog, SearchDialog, ProjectPicker) to use useDialogInput
4. useDialogInput never passes onConfirm/onCancel to useEditContext, making the bug structurally impossible

REMAINING:
- Consider making onConfirm/onCancel non-passable at the type level (would break InlineEditField which legitimately needs them)
- Alternative: add runtime warning if onConfirm is passed AND the component unmounts within N ms of confirm being called