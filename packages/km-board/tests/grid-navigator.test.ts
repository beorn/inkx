import { describe, it, expect, vi } from "vitest"
import { createGridNavigator } from "../src/grid-navigator.ts"
import type { ScrollRect } from "@silvery/ag-react"

function rect(y: number, height: number, x = 0, width = 100): ScrollRect {
  return { x, y, width, height }
}

describe("GridNavigator", () => {
  // =========================================================================
  // Facade delegation
  // =========================================================================

  describe("facade delegation", () => {
    it("register + getPosition delegates to inner PositionRegistry", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(0, 20))
      nav.register(0, 1, rect(20, 20))

      expect(nav.getPosition(0, 0)).toEqual(rect(0, 20))
      expect(nav.getPosition(0, 1)).toEqual(rect(20, 20))
      expect(nav.getPosition(0, 2)).toBeUndefined()
    })

    it("hasSection returns true for populated sections", () => {
      const nav = createGridNavigator()
      expect(nav.hasSection(0)).toBe(false)

      nav.register(0, 0, rect(0, 20))
      expect(nav.hasSection(0)).toBe(true)
      expect(nav.hasSection(1)).toBe(false)
    })

    it("getItemCount returns count of registered items", () => {
      const nav = createGridNavigator()
      expect(nav.getItemCount(0)).toBe(0)

      nav.register(0, 0, rect(0, 20))
      nav.register(0, 1, rect(20, 20))
      expect(nav.getItemCount(0)).toBe(2)
    })

    it("unregister removes item from inner registry", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(0, 20))
      nav.register(0, 1, rect(20, 20))

      nav.unregister(0, 0)
      expect(nav.getPosition(0, 0)).toBeUndefined()
      expect(nav.getItemCount(0)).toBe(1)
    })

    it("findItemAtY delegates to inner registry", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(0, 20))
      nav.register(0, 1, rect(20, 20))
      nav.register(0, 2, rect(40, 20))

      expect(nav.findItemAtY(0, 10)).toBe(0) // inside item 0
      expect(nav.findItemAtY(0, 30)).toBe(1) // inside item 1
      expect(nav.findItemAtY(0, 50)).toBe(2) // inside item 2
    })

    it("findInsertionSlot delegates to inner registry", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(10, 20))
      nav.register(0, 1, rect(30, 20))

      expect(nav.findInsertionSlot(0, 5)).toBe(0) // before first
      expect(nav.findInsertionSlot(0, 15)).toBe(1) // between
      expect(nav.findInsertionSlot(0, 55)).toBe(2) // after last
    })

    it("positions property exposes inner PositionRegistry", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(0, 20))

      // Should be the same underlying registry
      expect(nav.positions.getPosition(0, 0)).toEqual(rect(0, 20))
    })
  })

  // =========================================================================
  // Head region tracking
  // =========================================================================

  describe("head region tracking", () => {
    it("updateHead stores and getHead retrieves head data", () => {
      const nav = createGridNavigator()
      nav.updateHead(0, 0, 5, 10)

      const head = nav.getHead(0, 0)
      expect(head).toEqual({ y: 5, height: 10 })
    })

    it("getHead returns undefined for untracked items", () => {
      const nav = createGridNavigator()
      expect(nav.getHead(0, 0)).toBeUndefined()
    })

    it("updateHead overwrites previous values", () => {
      const nav = createGridNavigator()
      nav.updateHead(0, 0, 5, 10)
      nav.updateHead(0, 0, 15, 20)

      expect(nav.getHead(0, 0)).toEqual({ y: 15, height: 20 })
    })

    it("head data is preserved across multiple calls", () => {
      const nav = createGridNavigator()
      nav.updateHead(0, 0, 5, 10)
      nav.updateHead(0, 1, 20, 10)
      nav.updateHead(1, 0, 100, 15)

      expect(nav.getHead(0, 0)).toEqual({ y: 5, height: 10 })
      expect(nav.getHead(0, 1)).toEqual({ y: 20, height: 10 })
      expect(nav.getHead(1, 0)).toEqual({ y: 100, height: 15 })
    })

    it("unregister removes head data for the item", () => {
      const nav = createGridNavigator()
      nav.updateHead(0, 0, 5, 10)
      nav.unregister(0, 0)

      expect(nav.getHead(0, 0)).toBeUndefined()
    })
  })

  // =========================================================================
  // Sticky Y/X management
  // =========================================================================

  describe("sticky cursor memory", () => {
    it("stickyY starts as null", () => {
      const nav = createGridNavigator()
      expect(nav.stickyY).toBeNull()
    })

    it("stickyX starts as null", () => {
      const nav = createGridNavigator()
      expect(nav.stickyX).toBeNull()
    })

    it("setStickyY updates stickyY", () => {
      const nav = createGridNavigator()
      nav.setStickyY(42)
      expect(nav.stickyY).toBe(42)
    })

    it("setStickyX updates stickyX", () => {
      const nav = createGridNavigator()
      nav.setStickyX(3)
      expect(nav.stickyX).toBe(3)
    })

    it("clearStickyY sets stickyY to null", () => {
      const nav = createGridNavigator()
      nav.setStickyY(42)
      nav.clearStickyY()
      expect(nav.stickyY).toBeNull()
    })

    it("clearStickyX sets stickyX to null", () => {
      const nav = createGridNavigator()
      nav.setStickyX(3)
      nav.clearStickyX()
      expect(nav.stickyX).toBeNull()
    })

    it("clearStickyY is idempotent when already null", () => {
      const nav = createGridNavigator()
      nav.clearStickyY() // should not throw
      expect(nav.stickyY).toBeNull()
    })

    it("clearStickyX is idempotent when already null", () => {
      const nav = createGridNavigator()
      nav.clearStickyX()
      expect(nav.stickyX).toBeNull()
    })
  })

  // =========================================================================
  // Deferred navigation
  // =========================================================================

  describe("deferred navigation", () => {
    it("register triggers deferred resolve for target section", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredNavigation(1, 25) // target section 1, stickyY=25
      nav.setDeferredResolve(resolve)

      // Register items in section 1
      nav.register(1, 0, rect(0, 20))
      nav.register(1, 1, rect(20, 20))

      // Should resolve: stickyY=25 falls in item 1 (y=20..40)
      expect(resolve).toHaveBeenCalledWith(1)
    })

    it("does not resolve for non-target sections", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredNavigation(1, 25)
      nav.setDeferredResolve(resolve)

      nav.register(0, 0, rect(0, 20)) // section 0, not target
      expect(resolve).not.toHaveBeenCalled()
    })

    it("clearStickyY clears deferred navigation", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredNavigation(1, 25)
      nav.setDeferredResolve(resolve)
      nav.clearStickyY()

      // Now register in section 1 — should NOT resolve
      nav.register(1, 0, rect(20, 20))
      expect(resolve).not.toHaveBeenCalled()
    })

    it("skips duplicate dispatches with same itemIndex", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredNavigation(1, 15)
      nav.setDeferredResolve(resolve)

      // First register: stickyY=15 falls inside item 0 (y=0..20)
      nav.register(1, 0, rect(0, 20))
      expect(resolve).toHaveBeenCalledTimes(1)
      expect(resolve).toHaveBeenCalledWith(0)

      // Re-register same item — same target index, should skip
      nav.register(1, 0, rect(0, 20))
      expect(resolve).toHaveBeenCalledTimes(1) // no additional call
    })

    it("resolves to better match as more items register", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredNavigation(1, 35) // stickyY=35
      nav.setDeferredResolve(resolve)

      // First item: closest is item 0
      nav.register(1, 0, rect(0, 20))
      expect(resolve).toHaveBeenCalledWith(0)

      // Second item: stickyY=35 falls inside item 1 (y=20..40) — better match
      nav.register(1, 1, rect(20, 20))
      expect(resolve).toHaveBeenCalledWith(1)
      expect(resolve).toHaveBeenCalledTimes(2)
    })

    it("clear() clears deferred navigation", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredNavigation(1, 25)
      nav.setDeferredResolve(resolve)
      nav.clear()

      nav.register(1, 0, rect(20, 20))
      expect(resolve).not.toHaveBeenCalled()
    })

    it("setDeferredResolve does nothing without prior setDeferredNavigation", () => {
      const nav = createGridNavigator()
      const resolve = vi.fn()

      nav.setDeferredResolve(resolve) // no-op, no deferred nav set

      nav.register(0, 0, rect(0, 20))
      expect(resolve).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // getItemMidY
  // =========================================================================

  describe("getItemMidY", () => {
    it("returns midpoint of registered rect when no head data", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(10, 20)) // midY = 10 + 20/2 = 20

      expect(nav.getItemMidY(0, 0)).toBe(20)
    })

    it("returns midpoint of head region when head data exists", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(10, 100)) // rect midY would be 60
      nav.updateHead(0, 0, 10, 20) // head midY = 10 + 20/2 = 20

      expect(nav.getItemMidY(0, 0)).toBe(20) // uses head, not full rect
    })

    it("returns 0 for unregistered item", () => {
      const nav = createGridNavigator()
      expect(nav.getItemMidY(0, 0)).toBe(0)
    })
  })

  // =========================================================================
  // findCrossAxisTarget
  // =========================================================================

  describe("findCrossAxisTarget", () => {
    it("uses stickyY when set", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(0, 20))
      nav.register(1, 0, rect(0, 20))
      nav.register(1, 1, rect(20, 20))

      nav.setStickyY(25) // should target item 1 in section 1

      const result = nav.findCrossAxisTarget(0, 0, 1)
      expect(result.itemIndex).toBe(1)
      expect(result.usedStickyY).toBe(true)
    })

    it("computes and stores stickyY from source item when not set", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(10, 20)) // midY = 20
      nav.register(1, 0, rect(0, 20))
      nav.register(1, 1, rect(20, 20))

      expect(nav.stickyY).toBeNull()

      const result = nav.findCrossAxisTarget(0, 0, 1)
      // source midY = 20, which falls in item 1 (y=20..40)
      expect(result.itemIndex).toBe(1)
      expect(result.usedStickyY).toBe(false)
      expect(nav.stickyY).toBe(20) // now stored
    })

    it("uses head region for stickyY computation", () => {
      const nav = createGridNavigator()
      nav.register(0, 0, rect(0, 100)) // rect midY=50
      nav.updateHead(0, 0, 0, 20) // head midY=10
      nav.register(1, 0, rect(0, 20))
      nav.register(1, 1, rect(20, 20))

      const result = nav.findCrossAxisTarget(0, 0, 1)
      // head midY = 10, falls in item 0 (y=0..20)
      expect(result.itemIndex).toBe(0)
      expect(nav.stickyY).toBe(10) // computed from head
    })
  })

  // =========================================================================
  // clear()
  // =========================================================================

  describe("clear", () => {
    it("resets all state", () => {
      const nav = createGridNavigator()

      // Populate everything
      nav.register(0, 0, rect(0, 20))
      nav.register(1, 0, rect(0, 20))
      nav.updateHead(0, 0, 5, 10)
      nav.setStickyY(42)
      nav.setStickyX(3)
      nav.setDeferredNavigation(1, 25)

      nav.clear()

      // All state is reset
      expect(nav.getPosition(0, 0)).toBeUndefined()
      expect(nav.hasSection(0)).toBe(false)
      expect(nav.getHead(0, 0)).toBeUndefined()
      expect(nav.stickyY).toBeNull()
      expect(nav.stickyX).toBeNull()

      // Deferred nav cleared — register should not resolve
      const resolve = vi.fn()
      nav.setDeferredResolve(resolve) // no-op, no deferred nav
      nav.register(1, 0, rect(0, 20))
      expect(resolve).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // dump()
  // =========================================================================

  describe("dump", () => {
    it("includes sticky state", () => {
      const nav = createGridNavigator()
      nav.setStickyX(2)
      nav.setStickyY(15)

      const output = nav.dump()
      expect(output).toContain("stickyX=2")
      expect(output).toContain("stickyY=15")
    })

    it("includes head data when present", () => {
      const nav = createGridNavigator()
      nav.updateHead(0, 1, 10, 20)

      const output = nav.dump()
      expect(output).toContain("heads:")
      expect(output).toContain("0:1")
    })

    it("omits heads section when empty", () => {
      const nav = createGridNavigator()
      const output = nav.dump()
      expect(output).not.toContain("heads:")
    })
  })
})
