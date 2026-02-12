/**
 * Registry Tests
 *
 * Tests for command registration, lookup, filtering, and fuzzy matching.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  createCommandRegistry,
  registerCommand,
  registerCommands,
  getCommand,
  getAllCommands,
  getCommandsByCategory,
  fuzzyMatch,
  filterCommands,
  clearRegistry,
} from "../src/registry.ts"
import type { CommandDef, CommandCategory } from "../src/types.ts"

// Helper to create minimal command definitions
function createCommand(
  id: string,
  category: CommandCategory = "Navigation",
  name?: string,
  description?: string,
): CommandDef {
  return {
    id,
    name: name ?? id,
    description: description ?? `Test command ${id}`,
    category,
    execute: () => null,
  }
}

describe("registry", () => {
  beforeEach(() => {
    clearRegistry()
  })

  describe("registerCommand", () => {
    it("registers a single command", () => {
      const cmd = createCommand("test_cmd")
      registerCommand(cmd)

      const retrieved = getCommand("test_cmd")
      expect(retrieved).toBe(cmd)
    })

    it("overwrites existing command with same id", () => {
      const cmd1 = createCommand("dupe", "Navigation")
      const cmd2 = createCommand("dupe", "Selection")

      registerCommand(cmd1)
      registerCommand(cmd2)

      const retrieved = getCommand("dupe")
      expect(retrieved?.category).toBe("Selection")
    })
  })

  describe("registerCommands", () => {
    it("registers multiple commands at once", () => {
      const cmds = [createCommand("cmd_a"), createCommand("cmd_b"), createCommand("cmd_c")]
      registerCommands(cmds)

      expect(getCommand("cmd_a")).toBeDefined()
      expect(getCommand("cmd_b")).toBeDefined()
      expect(getCommand("cmd_c")).toBeDefined()
    })

    it("registers empty array without error", () => {
      expect(() => registerCommands([])).not.toThrow()
    })
  })

  describe("getCommand", () => {
    it("returns command for valid id", () => {
      const cmd = createCommand("valid_id")
      registerCommand(cmd)

      expect(getCommand("valid_id")).toBe(cmd)
    })

    it("returns undefined for unknown id", () => {
      expect(getCommand("nonexistent")).toBeUndefined()
    })
  })

  describe("getAllCommands", () => {
    it("returns empty array when no commands registered", () => {
      expect(getAllCommands()).toEqual([])
    })

    it("returns all registered commands", () => {
      registerCommands([createCommand("cmd_1"), createCommand("cmd_2"), createCommand("cmd_3")])

      const all = getAllCommands()
      expect(all).toHaveLength(3)
    })

    it("returns array copy (not internal reference)", () => {
      registerCommand(createCommand("cmd_1"))
      const all1 = getAllCommands()
      const all2 = getAllCommands()

      expect(all1).not.toBe(all2)
      expect(all1).toEqual(all2)
    })
  })

  describe("getCommandsByCategory", () => {
    it("returns empty map when no commands registered", () => {
      const byCategory = getCommandsByCategory()
      expect(byCategory.size).toBe(0)
    })

    it("groups commands by category", () => {
      registerCommands([
        createCommand("nav_1", "Navigation"),
        createCommand("nav_2", "Navigation"),
        createCommand("sel_1", "Selection"),
        createCommand("task_1", "Task"),
      ])

      const byCategory = getCommandsByCategory()

      expect(byCategory.get("Navigation")).toHaveLength(2)
      expect(byCategory.get("Selection")).toHaveLength(1)
      expect(byCategory.get("Task")).toHaveLength(1)
      expect(byCategory.get("Edit")).toBeUndefined()
    })

    it("includes all categories present", () => {
      const categories: CommandCategory[] = ["Navigation", "Selection", "Edit", "Task", "Fold", "View"]

      for (const cat of categories) {
        registerCommand(createCommand(`${cat.toLowerCase()}_cmd`, cat))
      }

      const byCategory = getCommandsByCategory()
      expect(byCategory.size).toBe(6)

      for (const cat of categories) {
        expect(byCategory.has(cat)).toBe(true)
      }
    })
  })

  describe("clearRegistry", () => {
    it("removes all registered commands", () => {
      registerCommands([createCommand("cmd_1"), createCommand("cmd_2"), createCommand("cmd_3")])
      expect(getAllCommands()).toHaveLength(3)

      clearRegistry()
      expect(getAllCommands()).toHaveLength(0)
    })

    it("allows re-registration after clear", () => {
      registerCommand(createCommand("cmd_1"))
      clearRegistry()
      registerCommand(createCommand("cmd_1"))

      expect(getCommand("cmd_1")).toBeDefined()
    })
  })
})

describe("fuzzyMatch", () => {
  it("matches exact string", () => {
    expect(fuzzyMatch("hello", "hello")).toBe(true)
  })

  it("matches prefix", () => {
    expect(fuzzyMatch("hel", "hello")).toBe(true)
  })

  it("matches subsequence", () => {
    expect(fuzzyMatch("hlo", "hello")).toBe(true)
  })

  it("matches scattered characters", () => {
    expect(fuzzyMatch("mv", "move cursor")).toBe(true)
  })

  it("is case insensitive", () => {
    expect(fuzzyMatch("HELLO", "hello")).toBe(true)
    expect(fuzzyMatch("hello", "HELLO")).toBe(true)
    expect(fuzzyMatch("HeLLo", "hElLO")).toBe(true)
  })

  it("returns false when query chars not in target", () => {
    expect(fuzzyMatch("xyz", "hello")).toBe(false)
  })

  it("returns false when query chars out of order", () => {
    expect(fuzzyMatch("leh", "hello")).toBe(false)
  })

  it("handles empty query (matches everything)", () => {
    expect(fuzzyMatch("", "anything")).toBe(true)
    expect(fuzzyMatch("", "")).toBe(true)
  })

  it("handles query longer than target", () => {
    expect(fuzzyMatch("hello world", "hello")).toBe(false)
  })

  it("handles special characters", () => {
    expect(fuzzyMatch("_", "cursor_next")).toBe(true)
    expect(fuzzyMatch("->", "arrow->right")).toBe(true)
  })
})

describe("filterCommands", () => {
  beforeEach(() => {
    clearRegistry()
    registerCommands([
      createCommand("cursor_next", "Navigation", "Move to Next", "Move cursor to next sibling"),
      createCommand("cursor_prev", "Navigation", "Move to Previous", "Move cursor to previous sibling"),
      createCommand("select_toggle", "Selection", "Toggle Selection", "Toggle selection on current node"),
      createCommand("task_done", "Task", "Mark Done", "Mark task as done"),
      createCommand("zoom_in", "Navigation", "Zoom In", "Focus on current node"),
    ])
  })

  it("returns all commands for empty query", () => {
    const result = filterCommands("")
    expect(result).toHaveLength(5)
  })

  it("matches by command id", () => {
    const result = filterCommands("cursor")
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id)).toContain("cursor_next")
    expect(result.map((c) => c.id)).toContain("cursor_prev")
  })

  it("matches by command name", () => {
    const result = filterCommands("Move")
    expect(result).toHaveLength(2)
  })

  it("matches by description", () => {
    const result = filterCommands("sibling")
    expect(result).toHaveLength(2)
  })

  it("uses fuzzy matching on all fields", () => {
    // "mtn" matches "Move to Next"
    const result = filterCommands("mtn")
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.some((c) => c.name === "Move to Next")).toBe(true)
  })

  it("returns empty array when no matches", () => {
    const result = filterCommands("xyznonexistent")
    expect(result).toHaveLength(0)
  })

  it("is case insensitive", () => {
    const result1 = filterCommands("CURSOR")
    const result2 = filterCommands("cursor")
    expect(result1).toHaveLength(result2.length)
  })
})

describe("createCommandRegistry", () => {
  it("creates isolated registry instances", () => {
    const registry1 = createCommandRegistry()
    const registry2 = createCommandRegistry()

    registry1.register(createCommand("cmd_a"))
    registry2.register(createCommand("cmd_b"))

    // Each registry only has its own commands
    expect(registry1.get("cmd_a")).toBeDefined()
    expect(registry1.get("cmd_b")).toBeUndefined()
    expect(registry2.get("cmd_b")).toBeDefined()
    expect(registry2.get("cmd_a")).toBeUndefined()
  })

  it("does not affect default registry", () => {
    clearRegistry()
    const custom = createCommandRegistry()

    custom.register(createCommand("custom_cmd"))
    registerCommand(createCommand("default_cmd"))

    // Custom registry has custom_cmd only
    expect(custom.get("custom_cmd")).toBeDefined()
    expect(custom.get("default_cmd")).toBeUndefined()

    // Default registry has default_cmd only
    expect(getCommand("default_cmd")).toBeDefined()
    expect(getCommand("custom_cmd")).toBeUndefined()
  })

  it("supports all registry operations", () => {
    const registry = createCommandRegistry()

    // register/registerAll
    registry.register(createCommand("nav_1", "Navigation"))
    registry.registerAll([createCommand("nav_2", "Navigation"), createCommand("sel_1", "Selection")])

    // get
    expect(registry.get("nav_1")).toBeDefined()
    expect(registry.get("nonexistent")).toBeUndefined()

    // getAll
    expect(registry.getAll()).toHaveLength(3)

    // getByCategory
    const byCategory = registry.getByCategory()
    expect(byCategory.get("Navigation")).toHaveLength(2)
    expect(byCategory.get("Selection")).toHaveLength(1)

    // filter
    const filtered = registry.filter("nav")
    expect(filtered).toHaveLength(2)

    // clear
    registry.clear()
    expect(registry.getAll()).toHaveLength(0)
  })

  it("enables test isolation without clearRegistry", () => {
    // Simulate parallel tests with separate registries
    const test1Registry = createCommandRegistry()
    const test2Registry = createCommandRegistry()

    // Test 1: adds commands for its test
    test1Registry.register(createCommand("test1_cmd"))
    expect(test1Registry.getAll()).toHaveLength(1)

    // Test 2: runs independently without clearing
    test2Registry.register(createCommand("test2_cmd"))
    expect(test2Registry.getAll()).toHaveLength(1)

    // Neither test polluted the other
    expect(test1Registry.get("test2_cmd")).toBeUndefined()
    expect(test2Registry.get("test1_cmd")).toBeUndefined()
  })
})
