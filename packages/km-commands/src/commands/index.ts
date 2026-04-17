export { navigationCommands } from "./navigation.ts"
export { selectionCommands } from "./selection.ts"
export { viewCommands } from "./view.ts"
export { editCommands } from "./edit.ts"
export { taskCommands, type TaskOp } from "./task.ts"
export { historyCommands } from "./history.ts"
export { tuiCommands } from "./tui.ts"
export { textEditingCommands } from "./text-editing.ts"
export { blockEditCommands } from "./block-edit.ts"
export { dialogCommands, filterDialogCommands } from "./dialog.ts"
export { paneCommands } from "./pane.ts"
export { omniboxCommands } from "./omnibox.ts"

import { navigationCommands } from "./navigation.ts"
import { selectionCommands } from "./selection.ts"
import { viewCommands } from "./view.ts"
import { editCommands } from "./edit.ts"
import { taskCommands } from "./task.ts"
import { historyCommands } from "./history.ts"
import { tuiCommands } from "./tui.ts"
import { textEditingCommands } from "./text-editing.ts"
import { blockEditCommands } from "./block-edit.ts"
import { dialogCommands, filterDialogCommands } from "./dialog.ts"
import { paneCommands } from "./pane.ts"
import { omniboxCommands } from "./omnibox.ts"

export const allCommands = [
  ...navigationCommands,
  ...selectionCommands,
  ...viewCommands,
  ...editCommands,
  ...taskCommands,
  ...historyCommands,
  ...tuiCommands,
  ...textEditingCommands,
  ...blockEditCommands,
  ...dialogCommands,
  ...filterDialogCommands,
  ...paneCommands,
  ...omniboxCommands,
]
