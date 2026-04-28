/**
 * formatPathForDisplay — tilde-and-alias substitution for chat-surface paths.
 *
 * Bead: km-silvercode.path-display-friendly.
 *
 * Strategy: pin `home` and `aliases` explicitly per assertion. The defaults
 * are wired to `process.env.HOME` + a curated alias map at runtime, but
 * tests should stay hermetic — `vi.stubEnv` would work but is heavier than
 * just passing the option in.
 */

import { describe, expect, test } from "vitest"
import { formatPathForDisplay } from "../src/utils/format-path.ts"

const HOME = "/Users/beorn"
const ALIASES = {
  vault: "~/Bear/Vault",
  km: "~/Code/pim/km",
  silvery: "~/Code/pim/km/vendor/silvery",
  code: "~/Code",
  b: "~/Bear",
} as const

describe("formatPathForDisplay", () => {
  // ---- HOME fallback (~/...) ----
  test("collapses path under $HOME with no alias to ~/...", () => {
    // Documents has no alias → HOME fallback applies.
    expect(formatPathForDisplay(`${HOME}/Documents/foo.txt`, { home: HOME, aliases: {} })).toBe("~/Documents/foo.txt")
  })

  test("collapses bare $HOME to ~", () => {
    expect(formatPathForDisplay(HOME, { home: HOME, aliases: {} })).toBe("~")
  })

  // ---- Alias substitution ----
  test("collapses vault path to ~vault/...", () => {
    expect(formatPathForDisplay(`${HOME}/Bear/Vault/RESOLVER.md`, { home: HOME, aliases: ALIASES })).toBe(
      "~vault/RESOLVER.md",
    )
  })

  test("collapses km path to ~km/...", () => {
    expect(formatPathForDisplay(`${HOME}/Code/pim/km/CLAUDE.md`, { home: HOME, aliases: ALIASES })).toBe(
      "~km/CLAUDE.md",
    )
  })

  test("bare alias-root path collapses to ~<alias>", () => {
    expect(formatPathForDisplay(`${HOME}/Bear/Vault`, { home: HOME, aliases: ALIASES })).toBe("~vault")
  })

  test("longest alias wins when prefixes nest", () => {
    // ~b = /Users/beorn/Bear, ~vault = /Users/beorn/Bear/Vault. A vault
    // path must collapse to ~vault, not ~b/Vault/...
    expect(formatPathForDisplay(`${HOME}/Bear/Vault/inbox/note.md`, { home: HOME, aliases: ALIASES })).toBe(
      "~vault/inbox/note.md",
    )
    // ~code = /Users/beorn/Code, ~km = /Users/beorn/Code/pim/km, ~silvery
    // = /Users/beorn/Code/pim/km/vendor/silvery — silvery must beat km.
    expect(
      formatPathForDisplay(`${HOME}/Code/pim/km/vendor/silvery/src/index.ts`, { home: HOME, aliases: ALIASES }),
    ).toBe("~silvery/src/index.ts")
  })

  test("alias-prefix that is NOT a path-segment boundary does not match", () => {
    // /Users/beorn/Code-other should not match ~code (which is
    // /Users/beorn/Code) because "Code-other" is not "Code/...". HOME
    // fallback applies instead.
    expect(formatPathForDisplay(`${HOME}/Code-other/file.ts`, { home: HOME, aliases: ALIASES })).toBe(
      "~/Code-other/file.ts",
    )
  })

  // ---- Outside HOME ----
  test("paths outside $HOME and every alias return verbatim", () => {
    expect(formatPathForDisplay("/tmp/scratch.txt", { home: HOME, aliases: ALIASES })).toBe("/tmp/scratch.txt")
    expect(formatPathForDisplay("/private/etc/hosts", { home: HOME, aliases: ALIASES })).toBe("/private/etc/hosts")
    expect(formatPathForDisplay("/etc/passwd", { home: HOME, aliases: ALIASES })).toBe("/etc/passwd")
  })

  test("paths in another user's home return verbatim", () => {
    // When HOME is /Users/beorn, /Users/alice/foo is outside.
    expect(formatPathForDisplay("/Users/alice/foo.txt", { home: HOME, aliases: ALIASES })).toBe("/Users/alice/foo.txt")
  })

  // ---- Relative + edge cases ----
  test("relative paths return verbatim (no cwd resolution)", () => {
    expect(formatPathForDisplay("src/foo.ts", { home: HOME, aliases: ALIASES })).toBe("src/foo.ts")
    expect(formatPathForDisplay("./README.md", { home: HOME, aliases: ALIASES })).toBe("./README.md")
    expect(formatPathForDisplay("../other/foo.ts", { home: HOME, aliases: ALIASES })).toBe("../other/foo.ts")
  })

  test("empty input returns empty string", () => {
    expect(formatPathForDisplay("", { home: HOME, aliases: ALIASES })).toBe("")
  })

  test("paths with spaces in segments are preserved", () => {
    expect(formatPathForDisplay(`${HOME}/Bear/Vault/My Notes/today.md`, { home: HOME, aliases: ALIASES })).toBe(
      "~vault/My Notes/today.md",
    )
  })

  test("aliases option = {} disables alias substitution but keeps HOME fallback", () => {
    expect(formatPathForDisplay(`${HOME}/Bear/Vault/RESOLVER.md`, { home: HOME, aliases: {} })).toBe(
      "~/Bear/Vault/RESOLVER.md",
    )
  })

  test("explicit home option overrides $HOME", () => {
    expect(formatPathForDisplay("/sandbox/work/foo.txt", { home: "/sandbox/work", aliases: {} })).toBe("~/foo.txt")
  })

  // ---- Default alias map smoke ----
  test("default aliases shipped: vault and km collapse without explicit aliases option", () => {
    // We pass home explicitly to keep the assertion hermetic, but rely on
    // the default DEFAULT_ALIASES map under the hood.
    expect(formatPathForDisplay(`${HOME}/Bear/Vault/RESOLVER.md`, { home: HOME })).toBe("~vault/RESOLVER.md")
    expect(formatPathForDisplay(`${HOME}/Code/pim/km/CLAUDE.md`, { home: HOME })).toBe("~km/CLAUDE.md")
  })
})
