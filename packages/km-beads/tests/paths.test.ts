import { describe, test, expect } from "vitest"
import { join } from "node:path"
import type { BeadsConfig } from "@km/storage"
import { resolveBeadsRoots, resolveMemDir, resolveSourceBoardDir } from "../src/paths.ts"

describe("resolveBeadsRoots", () => {
  test("returns default ['@km'] when config has no roots", () => {
    expect(resolveBeadsRoots({})).toEqual(["@km"])
  })

  test("returns default ['@km'] when config.roots is undefined and prefix is set", () => {
    expect(resolveBeadsRoots({ prefix: "km" })).toEqual(["@km"])
  })

  test("returns config.roots verbatim when set", () => {
    const config: BeadsConfig = { roots: ["@km", "imports/km-2026-04-28"] }
    expect(resolveBeadsRoots(config)).toEqual(["@km", "imports/km-2026-04-28"])
  })

  test("preserves multi-root order", () => {
    const config: BeadsConfig = {
      roots: ["primary", "secondary", "tertiary"],
    }
    expect(resolveBeadsRoots(config)).toEqual(["primary", "secondary", "tertiary"])
  })

  test("CLI override wins over config and returns single-element list", () => {
    const config: BeadsConfig = { roots: ["@km", "imports/old"] }
    expect(resolveBeadsRoots(config, "custom-root")).toEqual(["custom-root"])
  })

  test("CLI override wins over default when config has no roots", () => {
    expect(resolveBeadsRoots({}, "elsewhere")).toEqual(["elsewhere"])
  })

  test("empty-string CLI override is treated as 'no override' (falsy)", () => {
    const config: BeadsConfig = { roots: ["@km"] }
    expect(resolveBeadsRoots(config, "")).toEqual(["@km"])
  })
})

describe("resolveMemDir", () => {
  test("with default sigil-root, @memory sits as a sibling at the repo root (avoids @km/@memory nesting)", () => {
    expect(resolveMemDir("/repo", {})).toBe(join("/repo", "@memory"))
  })

  test("with non-sigil root, @memory lives inside that root", () => {
    const config: BeadsConfig = { roots: ["primary", "secondary"] }
    expect(resolveMemDir("/repo", config)).toBe(join("/repo", "primary", "@memory"))
  })

  test("CLI override (non-sigil) places @memory inside it", () => {
    const config: BeadsConfig = { roots: ["primary"] }
    expect(resolveMemDir("/repo", config, "override")).toBe(join("/repo", "override", "@memory"))
  })

  test("CLI override of a sigil root keeps @memory at repo root", () => {
    expect(resolveMemDir("/repo", {}, "@km")).toBe(join("/repo", "@memory"))
  })
})

describe("resolveSourceBoardDir", () => {
  test("when default root IS the source board (@km, prefix km), return the root directly (no double-nest)", () => {
    expect(resolveSourceBoardDir("/repo", "km", {})).toBe(join("/repo", "@km"))
  })

  test("when primary is a non-sigil root, source board nests inside as @<prefix>", () => {
    const config: BeadsConfig = { roots: ["imports/km-2026-04-28"] }
    expect(resolveSourceBoardDir("/repo", "km", config)).toBe(join("/repo", "imports/km-2026-04-28", "@km"))
  })

  test("CLI override (non-sigil) determines source-board location", () => {
    expect(resolveSourceBoardDir("/repo", "decker", {}, "override")).toBe(join("/repo", "override", "@decker"))
  })

  test("preserves arbitrary source prefix verbatim — different prefix from primary nests inside", () => {
    // primary "@km" is the km source-board; a "my-project" board nests inside.
    expect(resolveSourceBoardDir("/repo", "my-project", {})).toBe(join("/repo", "@km", "@my-project"))
  })
})
