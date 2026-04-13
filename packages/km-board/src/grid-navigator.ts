import { createLogger } from "loggily"

const log = createLogger("km:grid-navigator")

// === Types ===

/** Axis-aligned rectangle in screen coordinates. */
export interface GridRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CrossAxisResult {
  itemIndex: number
  usedStickyY: boolean
}

export interface GridNavigator {
  // === Position tracking ===
  register(section: number, item: number, rect: GridRect): void
  unregister(section: number, item: number): void
  getPosition(section: number, item: number): GridRect | undefined
  hasSection(section: number): boolean
  getItemCount(section: number): number
  findItemAtY(section: number, targetY: number): number
  findInsertionSlot(section: number, targetY: number): number

  // === Column bounds (for mouse click targeting) ===
  /** Register a column's bounding box (x, y, width, height) for mouse hit testing. */
  registerColumnBounds(section: number, rect: GridRect): void
  /** Unregister a column's bounding box. */
  unregisterColumnBounds(section: number): void
  /** Get a column's bounding box, or undefined if not registered. */
  getColumnBounds(section: number): GridRect | undefined
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

  // === Lifecycle ===
  clear(): void
  dump(): string
}

// === Factory ===

export function createGridNavigator(): GridNavigator {
  // Position storage: sectionIndex -> Map<itemIndex, GridRect>
  const sections = new Map<number, Map<number, GridRect>>()

  // Head data: Map keyed by `${section}:${item}`
  const heads = new Map<string, { y: number; height: number }>()

  // Column bounds: Map keyed by section index → bounding rect of the whole column
  const columnBounds = new Map<number, GridRect>()

  let stickyY: number | null = null
  let stickyX: number | null = null

  // Deferred navigation state
  let deferredNav: { targetSection: number; stickyY: number; resolvedItemIndex?: number } | null = null
  let deferredResolve: ((itemIndex: number) => void) | null = null

  function headKey(section: number, item: number): string {
    return `${section}:${item}`
  }

  // --- Position queries (inlined from PositionRegistry) ---

  function posGetPosition(sectionIndex: number, itemIndex: number): GridRect | undefined {
    return sections.get(sectionIndex)?.get(itemIndex)
  }

  function posHasSection(sectionIndex: number): boolean {
    const sectionMap = sections.get(sectionIndex)
    return sectionMap !== undefined && sectionMap.size > 0
  }

  function posGetItemCount(sectionIndex: number): number {
    return sections.get(sectionIndex)?.size ?? 0
  }

  function posFindItemAtY(sectionIndex: number, targetY: number): number {
    const sectionMap = sections.get(sectionIndex)
    if (!sectionMap || sectionMap.size === 0) return -1

    // First pass: intersection with item bounding box
    for (const [idx, rect] of sectionMap) {
      const top = rect.y
      const bottom = top + rect.height
      if (targetY >= top && targetY < bottom) return idx
    }

    // Second pass: closest midpoint
    let closestIdx = -1
    let closestDist = Infinity
    for (const [idx, rect] of sectionMap) {
      const mid = rect.y + rect.height / 2
      const dist = Math.abs(mid - targetY)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = idx
      }
    }

    // If above all items, return -1 (section header)
    const firstEntry = sectionMap.get(0)
    if (firstEntry && targetY < firstEntry.y) return -1

    return closestIdx
  }

  function posFindInsertionSlot(sectionIndex: number, targetY: number): number {
    const sectionMap = sections.get(sectionIndex)
    if (!sectionMap || sectionMap.size === 0) return 0

    const sorted = Array.from(sectionMap.entries()).sort((a, b) => a[0] - b[0])

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]!
      if (targetY < entry[1].y) return i
    }

    return sorted.length
  }

  function posDump(): string {
    const lines: string[] = []
    if (sections.size === 0) {
      lines.push("(no items registered)")
    } else {
      for (const [secIdx, sectionMap] of sections) {
        const entries = Array.from(sectionMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([idx, rect]) => `${idx}:y${rect.y}:h${rect.height}`)
          .join(", ")
        lines.push(`sec[${secIdx}]: ${entries}`)
      }
    }
    return lines.join("\n")
  }

  const navigator: GridNavigator = {
    // === Position tracking ===

    register(section: number, item: number, rect: GridRect): void {
      let sectionMap = sections.get(section)
      if (!sectionMap) {
        sectionMap = new Map()
        sections.set(section, sectionMap)
      }
      sectionMap.set(item, rect)

      log.debug?.(`register sec=${section} item=${item} y=${rect.y} h=${rect.height}`)

      // Resolve deferred navigation when target section's items are registered.
      if (deferredNav && deferredResolve && deferredNav.targetSection === section) {
        const targetItemIdx = posFindItemAtY(section, deferredNav.stickyY)
        if (targetItemIdx >= 0 && targetItemIdx !== deferredNav.resolvedItemIndex) {
          deferredNav.resolvedItemIndex = targetItemIdx
          deferredResolve(targetItemIdx)
        }
      }
    },

    unregister(section: number, item: number): void {
      const sectionMap = sections.get(section)
      if (sectionMap) {
        sectionMap.delete(item)
        if (sectionMap.size === 0) {
          sections.delete(section)
        }
      }
      heads.delete(headKey(section, item))
    },

    getPosition(section: number, item: number): GridRect | undefined {
      return posGetPosition(section, item)
    },

    hasSection(section: number): boolean {
      return posHasSection(section)
    },

    getItemCount(section: number): number {
      return posGetItemCount(section)
    },

    findItemAtY(section: number, targetY: number): number {
      return posFindItemAtY(section, targetY)
    },

    findInsertionSlot(section: number, targetY: number): number {
      return posFindInsertionSlot(section, targetY)
    },

    // === Column bounds (for mouse click targeting) ===

    registerColumnBounds(section: number, rect: GridRect): void {
      columnBounds.set(section, rect)
      log.debug?.(`registerColumnBounds sec=${section} x=${rect.x} w=${rect.width}`)
    },

    unregisterColumnBounds(section: number): void {
      columnBounds.delete(section)
      log.debug?.(`unregisterColumnBounds sec=${section}`)
    },

    getColumnBounds(section: number): GridRect | undefined {
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
      const rect = posGetPosition(section, item)
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

      const itemIndex = posFindItemAtY(toSection, targetY)
      return { itemIndex, usedStickyY }
    },

    // === Lifecycle ===

    clear(): void {
      sections.clear()
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
      lines.push(posDump())
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
