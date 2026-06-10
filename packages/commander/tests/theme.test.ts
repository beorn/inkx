import { describe, it, expect } from "vitest"
import { writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Command } from "../src/index.ts"
import { withTheme } from "../src/theme.ts"
import type { ColorScheme } from "@silvery/ansi"

/**
 * `withTheme` is the opt-in palette-selection plugin (`@silvery/commander/theme`).
 * These tests pin: option registration + default, named-scheme resolution via an
 * injected registry, the "auto" default (terminal passthrough → fallback in a
 * non-TTY test env), file loading, and the loud-error contract (no silent
 * fallback) for unknown names + malformed files.
 */

const FIXTURE: ColorScheme = {
  name: "fixture-dark",
  dark: true,
  black: "#1e1e2e",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
  foreground: "#cdd6f4",
  background: "#1e1e2e",
  cursorColor: "#f5e0dc",
  cursorText: "#1e1e2e",
  selectionBackground: "#585b70",
  selectionForeground: "#cdd6f4",
}

const schemes = { "fixture-dark": FIXTURE }

function optsOf(cmd: Command): Record<string, string | undefined> {
  return cmd.opts() as Record<string, string | undefined>
}

describe("withTheme — option registration", () => {
  it("adds a --theme option defaulting to auto", () => {
    const cmd = new Command("app")
    withTheme(cmd, { schemes })
    cmd.parse(["node", "app"], { from: "node" })
    expect(optsOf(cmd).theme).toBe("auto")
  })

  it("accepts a custom flag name and exposes its camelCased opts key", () => {
    const cmd = new Command("app")
    const handle = withTheme(cmd, { flag: "color-scheme", schemes })
    expect(handle.optionName).toBe("colorScheme")
    cmd.parse(["node", "app", "--color-scheme", "fixture-dark"], { from: "node" })
    expect(optsOf(cmd).colorScheme).toBe("fixture-dark")
  })
})

describe("withTheme — resolution", () => {
  it("resolves a named scheme via the injected registry", async () => {
    const cmd = new Command("app")
    const themes = withTheme(cmd, { schemes })
    cmd.parse(["node", "app", "--theme", "fixture-dark"], { from: "node" })
    const r = await themes.resolve(optsOf(cmd).theme)
    expect(r.via).toBe("named")
    expect(r.name).toBe("fixture-dark")
    expect(r.scheme.background).toBe("#1e1e2e")
    expect(typeof (r.theme as Record<string, unknown>)["bg-surface-default"]).toBe("string")
  })

  it("default (omitted) resolves via auto and returns a valid theme", async () => {
    const cmd = new Command("app")
    const themes = withTheme(cmd, { schemes, detect: { timeoutMs: 20 } })
    cmd.parse(["node", "app"], { from: "node" })
    const r = await themes.resolve(optsOf(cmd).theme)
    expect(r.via).toBe("auto")
    expect(r.scheme).toBeDefined()
    expect(typeof (r.theme as Record<string, unknown>)["bg-surface-default"]).toBe("string")
  })

  it("resolveScheme takes precedence over the schemes registry", async () => {
    const custom: ColorScheme = { ...FIXTURE, name: "custom", background: "#000000" }
    const cmd = new Command("app")
    const themes = withTheme(cmd, {
      schemes,
      resolveScheme: (n) => (n === "x" ? custom : undefined),
    })
    const r = await themes.resolve("x")
    expect(r.via).toBe("named")
    expect(r.scheme.background).toBe("#000000")
  })
})

describe("withTheme — file resolution", () => {
  it("loads a ColorScheme from a JSON file", async () => {
    const file = join(tmpdir(), `silvery-theme-${process.pid}.json`)
    writeFileSync(file, JSON.stringify(FIXTURE))
    try {
      const cmd = new Command("app")
      const themes = withTheme(cmd, { schemes })
      const r = await themes.resolve(file)
      expect(r.via).toBe("file")
      expect(r.scheme.foreground).toBe("#cdd6f4")
    } finally {
      rmSync(file, { force: true })
    }
  })

  it("throws loud on a malformed palette file (missing slots)", async () => {
    const file = join(tmpdir(), `silvery-theme-bad-${process.pid}.json`)
    writeFileSync(file, JSON.stringify({ background: "#000000" }))
    try {
      const cmd = new Command("app")
      const themes = withTheme(cmd, {})
      await expect(themes.resolve(file)).rejects.toThrow(/missing required color slot/)
    } finally {
      rmSync(file, { force: true })
    }
  })

  it("throws loud on a missing file", async () => {
    const cmd = new Command("app")
    const themes = withTheme(cmd, {})
    await expect(themes.resolve("/no/such/theme.json")).rejects.toThrow(/Cannot read theme file/)
  })
})

describe("withTheme — loud validation, no silent fallback", () => {
  it("rejects an unknown name at parse time when a registry is present", () => {
    const cmd = new Command("app")
    withTheme(cmd, { schemes })
    cmd.exitOverride()
    cmd.configureOutput({ writeErr: () => {} })
    expect(() => cmd.parse(["node", "app", "--theme", "nope"], { from: "node" })).toThrow(
      /Unknown theme/,
    )
  })

  it("accepts a bare name with no registry (resolution deferred to file-load)", () => {
    const cmd = new Command("app")
    withTheme(cmd, {})
    cmd.parse(["node", "app", "--theme", "mystery"], { from: "node" })
    expect(optsOf(cmd).theme).toBe("mystery")
  })
})
