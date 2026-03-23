import type { PositionRegistry, ScreenRect } from "@silvery/ag-react"
import { createPositionRegistry } from "@silvery/ag-react"
import { createLogger } from "loggily"

const log = createLogger("km:grid-navigator")

// === Types ===

export interface CrossAxisResult {
  itemIndex: number
  usedStickyY: boolean
}

export interface GridNavigator {
  // === Delegated position queries (facade) ===
  register(section: number, item: number, rect: ScreenRect): void
  unregister(section: number, item: number): void
  getPosition(section: number, item: number): ScreenRect | undefined
  hasSection(section: number): boolean
  getItemCount(section: number): number
  findItemAtY(section: number, targetY: number): number
  findInsertionSlot(section: number, targetY: number): number

  // === Column bounds (for mouse click targeting) ===
  /** Register a column's bounding box (x, y, width, height) for mouse hit testing. */
  registerColumnBounds(section: number, rect: ScreenRect): void
  /** Unregister a column's bounding box. */
  unregisterColumnBounds(section: number): void
  /** Get a column's bounding box, or undefined if not registered. */
  getColumnBounds(section: number): ScreenRect | undefined
  /** Find which column index the mouse x-coordinate falls in, or -1 if none. */
  findColumnAtX(mouseX: number): number

  // === Head/anchor region tracking ===
  updateHead(section: number, item: number, y: number, height: number): void
  getHead(section: number, item: number): { y: number; height: number } | undefined

  // === Sticky cursor memory ===
  stickyY: number | null
  stickyX: number | null
  setStickyY(y: number): void
  setStickyX(x: number): void
  clearStickyY(): void // also clears deferred
  clearStickyX(): void

  // === Deferred navigation (off-screen sections) ===
  setDeferredNavigation(section: number, stickyY: number): void
  setDeferredResolve(resolve: (itemIndex: number) => void): void

  // === Cross-axis navigation (methods, not standalone) ===
  getItemMidY(section: number, item: number): number
  findCrossAxisTarget(fromSection: number, fromItem: number, toSection: number): CrossAxisResult

  // === Advanced access ===
  readonly positions: PositionRegistry

  // === Lifecycle ===
  clear(): void
  dump(): string
}

// === Factory ===

export function createGridNavigator(positions?: PositionRegistry): GridNavigator {
  const pos = positions ?? createPositionRegistry()

  // Head data: Map keyed by `${section}:${item}`
  const heads = new Map<string, { y: number; height: number }>()

  // Column bounds: Map keyed by section index → bounding rect of the whole column
  const columnBounds = new Map<number, ScreenRect>()

  let stickyY: number | null = null
  let stickyX: number | null = null

  // Deferred navigation state
  let deferredNav: { targetSection: number; stickyY: number; resolvedItemIndex?: number } | null = null
  let deferredResolve: ((itemIndex: number) => void) | null = null

  function headKey(section: number, item: number): string {
    return `${section}:${item}`
  }

  const navigator: GridNavigator = {
    // === Facade: delegated position queries ===

    register(section: number, item: number, rect: ScreenRect): void {
      pos.register(section, item, rect)

      // Resolve deferred navigation when target section's items are registered.
      // We resolve on EVERY register for the target section — each call sees
      // more registered items, producing progressively better Y-matching. React
      // batches all dispatches within the same synchronous pass; the last wins.
      // We track resolvedItemIndex to skip duplicate dispatches.
      if (deferredNav && deferredResolve && deferredNav.targetSection === section) {
        const targetItemIdx = pos.findItemAtY(section, deferredNav.stickyY)
        if (targetItemIdx >= 0 && targetItemIdx !== deferredNav.resolvedItemIndex) {
          deferredNav.resolvedItemIndex = targetItemIdx
          deferredResolve(targetItemIdx)
        }
      }
    },

    unregister(section: number, item: number): void {
      pos.unregister(section, item)
      heads.delete(headKey(section, item))
    },

    getPosition(section: number, item: number): ScreenRect | undefined {
      return pos.getPosition(section, item)
    },

    hasSection(section: number): boolean {
      return pos.hasSection(section)
    },

    getItemCount(section: number): number {
      return pos.getItemCount(section)
    },

    findItemAtY(section: number, targetY: number): number {
      return pos.findItemAtY(section, targetY)
    },

    findInsertionSlot(section: number, targetY: number): number {
      return pos.findInsertionSlot(section, targetY)
    },

    // === Column bounds (for mouse click targeting) ===

    registerColumnBounds(section: number, rect: ScreenRect): void {
      columnBounds.set(section, rect)
      log.debug?.(`registerColumnBounds sec=${section} x=${rect.x} w=${rect.width}`)
    },

    unregisterColumnBounds(section: number): void {
      columnBounds.delete(section)
      log.debug?.(`unregisterColumnBounds sec=${section}`)
    },

    getColumnBounds(section: number): ScreenRect | undefined {
      return columnBounds.get(section)
    },

    findColumnAtX(mouseX: number): number {
      for (const [section, rect] of columnBounds) {
        if (mouseX >= rect.x && mouseX < rect.x + rect.width) return section
      }
      return -1
    },

    // === Head/anchor region tracking ===

    updateHead(section: number, item: number, y: number, height: number): void {
      heads.set(headKey(section, item), { y, height })
    },

    getHead(section: number, item: number): { y: number; height: number } | undefined {
      return heads.get(headKey(section, item))
    },

    // === Sticky cursor memory ===

    get stickyY() {
      return stickyY
    },
    set stickyY(_) {
      /* use setStickyY */
    },

    get stickyX() {
      return stickyX
    },
    set stickyX(_) {
      /* use setStickyX */
    },

    setStickyY(y: number): void {
      stickyY = y
      log.debug?.(`setStickyY: ${y}`)
    },

    setStickyX(x: number): void {
      stickyX = x
      log.debug?.(`setStickyX: ${x}`)
    },

    clearStickyY(): void {
      if (stickyY !== null) {
        log.debug?.("clearStickyY")
        stickyY = null
      }
      // Vertical nav invalidates any pending deferred h/l correction
      deferredNav = null
      deferredResolve = null
    },

    clearStickyX(): void {
      if (stickyX !== null) {
        log.debug?.("clearStickyX")
        stickyX = null
      }
    },

    // === Deferred navigation ===

    setDeferredNavigation(section: number, targetStickyY: number): void {
      deferredNav = { targetSection: section, stickyY: targetStickyY }
      deferredResolve = null
      log.debug?.(`setDeferredNavigation: sec=${section} stickyY=${targetStickyY}`)
    },

    setDeferredResolve(resolve: (itemIndex: number) => void): void {
      if (deferredNav) {
        deferredResolve = resolve
        log.debug?.(`setDeferredResolve: attached for sec=${deferredNav.targetSection}`)
      }
    },

    // === Cross-axis navigation (methods) ===

    getItemMidY(section: number, item: number): number {
      const rect = pos.getPosition(section, item)
      if (!rect) return 0

      const head = heads.get(headKey(section, item))
      if (head) {
        return head.y + head.height / 2
      }

      return rect.y + rect.height / 2
    },

    findCrossAxisTarget(fromSection: number, fromItem: number, toSection: number): CrossAxisResult {
      let targetY: number
      let usedStickyY = false

      if (stickyY !== null) {
        targetY = stickyY
        usedStickyY = true
      } else {
        targetY = navigator.getItemMidY(fromSection, fromItem)
        navigator.setStickyY(targetY)
      }

      const itemIndex = pos.findItemAtY(toSection, targetY)
      return { itemIndex, usedStickyY }
    },

    // === Advanced access ===

    get positions(): PositionRegistry {
      return pos
    },

    // === Lifecycle ===

    clear(): void {
      pos.clear()
      heads.clear()
      columnBounds.clear()
      stickyY = null
      stickyX = null
      deferredNav = null
      deferredResolve = null
      log.debug?.("cleared all state")
    },

    dump(): string {
      const lines: string[] = [`stickyX=${stickyX}, stickyY=${stickyY}`]
      lines.push(pos.dump())
      if (heads.size > 0) {
        lines.push(
          `heads: ${Array.from(heads.entries())
            .map(([k, v]) => `${k}:y${v.y}:h${v.height}`)
            .join(", ")}`,
        )
      }
      return lines.join("\n")
    },
  }

  return navigator
}
