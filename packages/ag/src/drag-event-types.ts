/**
 * Drag Event Type Definitions
 *
 * Pure type interfaces for the silvery drag-and-drop event system.
 * These live in @silvery/ag because they're used by core prop types (BoxProps).
 * The runtime drag event processing lives in @silvery/ag-term/drag-events.
 */

import type { AgNode } from "./types"

// ============================================================================
// Drag Event (simplified for prop typing)
// ============================================================================

/**
 * Drag event payload passed to handler props.
 */
export interface DragEventPayload {
  /** The node being dragged */
  source: AgNode
  /** Current Silvery layout-space position of the pointer */
  position: { x: number; y: number }
  /** The current or final drop target under the pointer, when one exists */
  dropTarget: AgNode | null
}

// ============================================================================
// Drag Event Handler Props (added to BoxProps)
// ============================================================================

export interface DragEventProps {
  /** Fired on the draggable source when the pointer crosses the drag threshold */
  onDragStart?: (event: DragEventPayload) => void
  /** Fired on the draggable source after pointer release, whether or not a drop target exists */
  onDragEnd?: (event: DragEventPayload) => void
  /** Fired on the draggable source when an active drag is canceled */
  onDragCancel?: (event: DragEventPayload) => void
  /** Fired when a dragged node enters this node's bounds */
  onDragEnter?: (event: DragEventPayload) => void
  /** Fired when a dragged node leaves this node's bounds */
  onDragLeave?: (event: DragEventPayload) => void
  /** Fired repeatedly as a dragged node moves over this node */
  onDragOver?: (event: DragEventPayload) => void
  /** Fired when a dragged node is dropped on this node */
  onDrop?: (event: DragEventPayload) => void
}
