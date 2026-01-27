/**
 * Config Tests
 *
 * Tests for km configuration loading and caching:
 * - loadConfig: finding and loading config files
 * - getConfigPath: getting the loaded config path
 * - clearConfigCache: clearing cached config
 * - getBeadsConfig: beads-specific config with defaults
 * - getTuiConfig: TUI-specific config with defaults
 * - getOriginalBeadsConfig: loading .beads/config.yaml
 * - getOriginalBeadsConfigPath: getting .beads/config.yaml path
 *
 * Uses isolated temp directories for cleaner test setup.
 */

/* eslint-disable @typescript-eslint/no-deprecated -- Testing deprecated config APIs */

import { describe, test, expect } from "vitest"
import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"

import {
  loadConfig,
  getConfigPath,
  clearConfigCache,
  getBeadsConfig,
  getTuiConfig,
  getOriginalBeadsConfig,
  getOriginalBeadsConfigPath,
} from "../src/config.ts"
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

describe("getConfigPath", () => {
  test("returns undefined when no config loaded", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      loadConfig(testDir)
      expect(getConfigPath()).toBeUndefined()
    }))

  test("returns path when config exists", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      const configPath = join(testDir, ".km/config.yaml")
      writeFileSync(configPath, "beads: {}\n")

      loadConfig(testDir)
      expect(getConfigPath(testDir)).toBe(configPath)
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

describe("getBeadsConfig", () => {
  test("returns defaults when no config exists", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      const config = getBeadsConfig(testDir)
      expect(config.board).toBe("issue")
      expect(config.parent).toBe("issue/")
      expect(config.prefix).toBe("km")
    }))

  test("merges config with defaults", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  board: "@bugs"
`,
      )

      const config = getBeadsConfig(testDir)
      expect(config.board).toBe("@bugs")
      expect(config.parent).toBe("issue/") // default
      expect(config.prefix).toBe("km") // default
    }))

  test("overrides all defaults when fully specified", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `beads:
  board: "@custom"
  parent: "tickets/"
  prefix: "proj"
`,
      )

      const config = getBeadsConfig(testDir)
      expect(config.board).toBe("@custom")
      expect(config.parent).toBe("tickets/")
      expect(config.prefix).toBe("proj")
    }))
})

describe("getTuiConfig", () => {
  test("returns defaults when no config exists", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      const config = getTuiConfig(testDir)
      expect(config.watch).toBe(true)
      expect(config.watchWorker).toBe(true)
    }))

  test("allows disabling watch", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `tui:
  watch: false
`,
      )

      const config = getTuiConfig(testDir)
      expect(config.watch).toBe(false)
      expect(config.watchWorker).toBe(true) // default
    }))

  test("allows disabling watchWorker", () =>
    withTestEnvSync(({ testDir }) => {
      clearConfigCache()
      mkdirSync(join(testDir, ".km"), { recursive: true })
      writeFileSync(
        join(testDir, ".km/config.yaml"),
        `tui:
  watchWorker: false
`,
      )

      const config = getTuiConfig(testDir)
      expect(config.watch).toBe(true) // default
      expect(config.watchWorker).toBe(false)
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

describe("getOriginalBeadsConfigPath", () => {
  test("returns undefined when no config exists", () =>
    withTestEnvSync(({ testDir }) => {
      // testDir has no .beads, so should return undefined
      expect(getOriginalBeadsConfigPath(testDir)).toBeUndefined()
    }))

  test("returns path when config exists", () =>
    withTestEnvSync(({ testDir }) => {
      mkdirSync(join(testDir, ".beads"), { recursive: true })
      const configPath = join(testDir, ".beads/config.yaml")
      writeFileSync(configPath, "actor: test\n")

      expect(getOriginalBeadsConfigPath(testDir)).toBe(configPath)
    }))
})
