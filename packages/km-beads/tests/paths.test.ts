import { describe, test, expect } from "vitest"
import { join } from "node:path"
import type { BeadsConfig } from "@km/storage"
import { resolveBeadsRoots, resolveMemDir, resolveSourceBoardDir } from "../src/paths.ts"

describe("resolveBeadsRoots", () => {
  test("returns default ['beads'] when config has no roots", () => {
    expect(resolveBeadsRoots({})).toEqual(["beads"])
  })

  test("returns default ['beads'] when config.roots is undefined and prefix is set", () => {
    expect(resolveBeadsRoots({ prefix: "km" })).toEqual(["beads"])
  })

  test("returns config.roots verbatim when set", () => {
    const config: BeadsConfig = { roots: ["beads", "imports/km-2026-04-28"] }
    expect(resolveBeadsRoots(config)).toEqual(["beads", "imports/km-2026-04-28"])
  })

  test("preserves multi-root order", () => {
    const config: BeadsConfig = {
      roots: ["primary", "secondary", "tertiary"],
    }
    expect(resolveBeadsRoots(config)).toEqual(["primary", "secondary", "tertiary"])
  })

  test("CLI override wins over config and returns single-element list", () => {
    const config: BeadsConfig = { roots: ["beads", "imports/old"] }
    expect(resolveBeadsRoots(config, "custom-root")).toEqual(["custom-root"])
  })

  test("CLI override wins over default when config has no roots", () => {
    expect(resolveBeadsRoots({}, "elsewhere")).toEqual(["elsewhere"])
  })

  test("empty-string CLI override is treated as 'no override' (falsy)", () => {
    const config: BeadsConfig = { roots: ["beads"] }
    expect(resolveBeadsRoots(config, "")).toEqual(["beads"])
  })
})

describe("resolveMemDir", () => {
  test("joins repoRoot, primary root, and @memory using default", () => {
    expect(resolveMemDir("/repo", {})).toBe(join("/repo", "beads", "@memory"))
  })

  test("uses first config root as primary", () => {
    const config: BeadsConfig = { roots: ["primary", "secondary"] }
    expect(resolveMemDir("/repo", config)).toBe(join("/repo", "primary", "@memory"))
  })

  test("CLI override determines memory location", () => {
    const config: BeadsConfig = { roots: ["primary"] }
    expect(resolveMemDir("/repo", config, "override")).toBe(join("/repo", "override", "@memory"))
  })
})

describe("resolveSourceBoardDir", () => {
  test("formats @<prefix> using default root", () => {
    expect(resolveSourceBoardDir("/repo", "km", {})).toBe(join("/repo", "beads", "@km"))
  })

  test("uses first config root as primary", () => {
    const config: BeadsConfig = { roots: ["imports/km-2026-04-28", "beads"] }
    expect(resolveSourceBoardDir("/repo", "km", config)).toBe(join("/repo", "imports/km-2026-04-28", "@km"))
  })

  test("CLI override determines source-board location", () => {
    expect(resolveSourceBoardDir("/repo", "decker", {}, "override")).toBe(join("/repo", "override", "@decker"))
  })

  test("preserves arbitrary source prefix verbatim", () => {
    expect(resolveSourceBoardDir("/repo", "my-project", {})).toBe(join("/repo", "beads", "@my-project"))
  })
})
