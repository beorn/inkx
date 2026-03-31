import { describe, it, expect } from "vitest"
import {
  expandLocationTemplate,
  isDateTemplate,
  isPositionalTemplate,
  loadConfig,
  saveConfig,
  DEFAULT_LOCATIONS,
  type KmConfig,
} from "@km/commands"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// =============================================================================
// Template Expansion
// =============================================================================

describe("expandLocationTemplate", () => {
  const fixedDate = new Date(2026, 2, 30) // March 30, 2026

  it("expands {YYYY} token", () => {
    const result = expandLocationTemplate("journals/{YYYY}/notes.md", fixedDate)
    expect(result).toEqual({ type: "resolved", value: "journals/2026/notes.md" })
  })

  it("expands {MM} token", () => {
    const result = expandLocationTemplate("{MM}/notes.md", fixedDate)
    expect(result).toEqual({ type: "resolved", value: "03/notes.md" })
  })

  it("expands {DD} token", () => {
    const result = expandLocationTemplate("{DD}.md", fixedDate)
    expect(result).toEqual({ type: "resolved", value: "30.md" })
  })

  it("expands {YYYY-MM-DD} compound token", () => {
    const result = expandLocationTemplate("journals/{YYYY}/{YYYY-MM-DD}.md", fixedDate)
    expect(result).toEqual({ type: "resolved", value: "journals/2026/2026-03-30.md" })
  })

  it("expands multiple tokens in one template", () => {
    const result = expandLocationTemplate("{YYYY}/{MM}/{DD}.md", fixedDate)
    expect(result).toEqual({ type: "resolved", value: "2026/03/30.md" })
  })

  it("zero-pads single-digit months", () => {
    const jan = new Date(2026, 0, 5) // January 5
    const result = expandLocationTemplate("{YYYY}-{MM}-{DD}.md", jan)
    expect(result).toEqual({ type: "resolved", value: "2026-01-05.md" })
  })

  it("returns positional for {parent}", () => {
    expect(expandLocationTemplate("{parent}")).toEqual({ type: "positional", key: "parent" })
  })

  it("returns positional for {first}", () => {
    expect(expandLocationTemplate("{first}")).toEqual({ type: "positional", key: "first" })
  })

  it("returns positional for {last}", () => {
    expect(expandLocationTemplate("{last}")).toEqual({ type: "positional", key: "last" })
  })

  it("passes through literal node references", () => {
    expect(expandLocationTemplate("@inbox")).toEqual({ type: "resolved", value: "@inbox" })
  })

  it("passes through node IDs", () => {
    expect(expandLocationTemplate("abc12345")).toEqual({ type: "resolved", value: "abc12345" })
  })
})

describe("isDateTemplate", () => {
  it("detects date tokens", () => {
    expect(isDateTemplate("journals/{YYYY}/{YYYY-MM-DD}.md")).toBe(true)
    expect(isDateTemplate("{MM}")).toBe(true)
  })

  it("rejects non-date templates", () => {
    expect(isDateTemplate("@inbox")).toBe(false)
    expect(isDateTemplate("{parent}")).toBe(false)
    expect(isDateTemplate("some-node-id")).toBe(false)
  })
})

describe("isPositionalTemplate", () => {
  it("detects positional tokens", () => {
    expect(isPositionalTemplate("{parent}")).toBe(true)
    expect(isPositionalTemplate("{first}")).toBe(true)
    expect(isPositionalTemplate("{last}")).toBe(true)
  })

  it("rejects non-positional templates", () => {
    expect(isPositionalTemplate("@inbox")).toBe(false)
    expect(isPositionalTemplate("{YYYY}")).toBe(false)
    expect(isPositionalTemplate("journals/{YYYY}/{YYYY-MM-DD}.md")).toBe(false)
  })
})

// =============================================================================
// Config Read/Write
// =============================================================================

function makeTempVault(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-config-test-"))
  mkdirSync(join(dir, ".km"), { recursive: true })
  return dir
}

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    const vault = mkdtempSync(join(tmpdir(), "km-config-test-"))
    const config = loadConfig(vault)
    expect(config.locations).toEqual(DEFAULT_LOCATIONS)
  })

  it("merges user config with defaults", () => {
    const vault = makeTempVault()
    writeFileSync(
      join(vault, ".km", "config.json"),
      JSON.stringify({ locations: { "0": "my-board-id", j: "daily/{YYYY-MM-DD}.md" } }),
    )
    const config = loadConfig(vault)
    expect(config.locations["0"]).toBe("my-board-id")
    expect(config.locations.j).toBe("daily/{YYYY-MM-DD}.md") // user override
    expect(config.locations.h).toBe("@next") // default preserved
    expect(config.locations.p).toBe("{parent}") // default preserved
  })

  it("returns defaults on malformed JSON", () => {
    const vault = makeTempVault()
    writeFileSync(join(vault, ".km", "config.json"), "not json{{{")
    const config = loadConfig(vault)
    expect(config.locations).toEqual(DEFAULT_LOCATIONS)
  })
})

describe("saveConfig", () => {
  it("writes only non-default entries", () => {
    const vault = makeTempVault()
    const config: KmConfig = {
      locations: {
        ...DEFAULT_LOCATIONS,
        "0": "my-board-id",
        "1": "another-board",
      },
    }
    saveConfig(vault, config)
    const raw = JSON.parse(readFileSync(join(vault, ".km", "config.json"), "utf-8")) as KmConfig
    // Only user favorites should be in the file, not system defaults
    expect(raw.locations["0"]).toBe("my-board-id")
    expect(raw.locations["1"]).toBe("another-board")
    expect(raw.locations.h).toBeUndefined() // default, not written
    expect(raw.locations.p).toBeUndefined() // default, not written
  })

  it("saves user overrides of default keys", () => {
    const vault = makeTempVault()
    const config: KmConfig = {
      locations: {
        ...DEFAULT_LOCATIONS,
        j: "daily/{YYYY-MM-DD}.md", // user override of default
      },
    }
    saveConfig(vault, config)
    const raw = JSON.parse(readFileSync(join(vault, ".km", "config.json"), "utf-8")) as KmConfig
    expect(raw.locations.j).toBe("daily/{YYYY-MM-DD}.md")
  })

  it("creates .km directory if needed", () => {
    const vault = mkdtempSync(join(tmpdir(), "km-config-test-"))
    const config: KmConfig = { locations: { ...DEFAULT_LOCATIONS, "0": "board-id" } }
    saveConfig(vault, config)
    expect(existsSync(join(vault, ".km", "config.json"))).toBe(true)
  })

  it("round-trips through load", () => {
    const vault = makeTempVault()
    const config: KmConfig = {
      locations: {
        ...DEFAULT_LOCATIONS,
        j: "daily/{YYYY-MM-DD}.md",
        "0": "board-a",
        "3": "board-b",
      },
    }
    saveConfig(vault, config)
    const loaded = loadConfig(vault)
    expect(loaded.locations.j).toBe("daily/{YYYY-MM-DD}.md")
    expect(loaded.locations["0"]).toBe("board-a")
    expect(loaded.locations["3"]).toBe("board-b")
    expect(loaded.locations.h).toBe("@next") // defaults preserved
  })
})
