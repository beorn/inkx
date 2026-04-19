/**
 * Config Tests
 *
 * Tests for km configuration loading and caching:
 * - loadConfig: finding and loading config files
 * - clearConfigCache: clearing cached config
 * - getOriginalBeadsConfig: loading .beads/config.yaml
 *
 * Uses isolated temp directories for cleaner test setup.
 */

import { describe, test, expect, vi } from "vitest"
import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"

import { loadConfig, clearConfigCache, getOriginalBeadsConfig, getFolderIndexConfig } from "../src/config.ts"
import { withTestEnvSync } from "@km/storage"

describe("loadConfig", () => {
  test("returns empty object when no config exists", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      const config = loadConfig(testDir)
      expect(config).toEqual({})
    }))

  test("loads config from .km/config.yaml", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  board: "@issues"
  prefix: "test"
tui:
  watch: false
`,
      )

      const config = loadConfig(testDir)
      expect(config.beads?.board).toBe("@issues")
      expect(config.beads?.prefix).toBe("test")
      expect(config.tui?.watch).toBe(false)
    }))

  test("loads config from .kmrc.yaml", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      writeFileSync(
        join(testDir, ".kmrc.yaml"),
        `beads:
  parent: "bugs/"
`,
      )

      const config = loadConfig(testDir)
      expect(config.beads?.parent).toBe("bugs/")
    }))

  test("caches config across calls", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  prefix: "first"
`,
      )

      const config1 = loadConfig(testDir)
      expect(config1.beads?.prefix).toBe("first")

      // Modify the file - should NOT be reflected due to caching
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  prefix: "second"
`,
      )

      const config2 = loadConfig(testDir)
      expect(config2.beads?.prefix).toBe("first")
    }))
})

describe("clearConfigCache", () => {
  test("clears cached config so new config is loaded", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  prefix: "first"
`,
      )

      const config1 = loadConfig(testDir)
      expect(config1.beads?.prefix).toBe("first")

      // Modify the file
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  prefix: "second"
`,
      )

      // Clear cache
      clearConfigCache()

      // Now should load the new value
      const config2 = loadConfig(testDir)
      expect(config2.beads?.prefix).toBe("second")
    }))
})

describe("getOriginalBeadsConfig", () => {
  test("returns null when no .beads/config.yaml exists", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      const config = getOriginalBeadsConfig(testDir)
      expect(config).toBeNull()
    }))

  test("loads .beads/config.yaml", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".beads"), { recursive: true })
      writeFileSync(
        join(testDir, ".beads/config.yaml"),
        `issue-prefix: "proj"
no-db: true
actor: "test-user"
`,
      )

      const config = getOriginalBeadsConfig(testDir)
      expect(config).not.toBeNull()
      expect(config!["issue-prefix"]).toBe("proj")
      expect(config!["no-db"]).toBe(true)
      expect(config!.actor).toBe("test-user")
    }))

  test("searches parent directories", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".beads"), { recursive: true })
      mkdirSync(join(testDir, "nested/deep"), { recursive: true })
      writeFileSync(
        join(testDir, ".beads/config.yaml"),
        `issue-prefix: "parent"
`,
      )

      const config = getOriginalBeadsConfig(join(testDir, "nested/deep"))
      expect(config).not.toBeNull()
      expect(config!["issue-prefix"]).toBe("parent")
    }))

  // NOTE: Caching test removed - caching was removed to fix path-keyed bug.
  // Use clearConfigCache() to force reload if needed.
})

describe("getFolderIndexConfig", () => {
  test("returns defaults when no config exists", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      const config = getFolderIndexConfig(testDir)
      expect(config).toEqual({ naming: "index", materialization: "none" })
    }))

  test("valid values pass through correctly", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `folderIndex:
  naming: "same-name"
  materialization: "full"
`,
      )

      const config = getFolderIndexConfig(testDir)
      expect(config.naming).toBe("same-name")
      expect(config.materialization).toBe("full")
    }))

  test("invalid naming value falls back to default", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `folderIndex:
  naming: "bar"
`,
      )

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        const config = getFolderIndexConfig(testDir)
        expect(config.naming).toBe("index")
        expect(warnSpy).toHaveBeenCalledOnce()
      } finally {
        warnSpy.mockRestore()
      }
    }))

  test("invalid materialization value falls back to default", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `folderIndex:
  materialization: "foo"
`,
      )

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        const config = getFolderIndexConfig(testDir)
        expect(config.materialization).toBe("none")
        expect(warnSpy).toHaveBeenCalledOnce()
      } finally {
        warnSpy.mockRestore()
      }
    }))

  test("invalid values log a warning", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `folderIndex:
  naming: "bad"
  materialization: "wrong"
`,
      )

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        const config = getFolderIndexConfig(testDir)
        expect(config.naming).toBe("index")
        expect(config.materialization).toBe("none")
        expect(warnSpy).toHaveBeenCalledTimes(2)
        // After loggily structured-sink migration (km-loggily.browser-console),
        // warnings are multi-arg — inspect joined call text for content assertions.
        const calls = warnSpy.mock.calls.map((args) => args.join(" "))
        expect(calls.some((s) => s.includes("naming"))).toBe(true)
        expect(calls.some((s) => s.includes("materialization"))).toBe(true)
      } finally {
        warnSpy.mockRestore()
      }
    }))

  test("missing values use defaults without warning", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `folderIndex: {}
`,
      )

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      try {
        const config = getFolderIndexConfig(testDir)
        expect(config.naming).toBe("index")
        expect(config.materialization).toBe("none")
        expect(warnSpy).not.toHaveBeenCalled()
      } finally {
        warnSpy.mockRestore()
      }
    }))
})
