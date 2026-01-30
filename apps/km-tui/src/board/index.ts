/**
 * Board module - board action handlers
 */

export { handleCommandAction, type ActionHandler } from "./board-actions.ts"

export {
  handleDeleteNode,
  handleConfirmMove,
  handleTaskStatusCycle,
  handleShiftCard,
} from "./board-actions-edit.ts"

export {
  handleCursorMove,
  handleNavBack,
  handleNavForward,
  handleNavSiblingBoard,
  handlePageJump,
} from "./board-actions-nav.ts"

export {
  handleExtendSelectVertical,
  handleExtendSelectHorizontal,
} from "./board-actions-selection.ts"

export {
  handleZoomIn,
  handleZoomInNode,
  handleZoomInwards,
  handleZoomOutwards,
} from "./board-actions-zoom.ts"
