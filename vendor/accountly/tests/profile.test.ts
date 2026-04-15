import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, symlinkSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir, homedir } from "node:os"
import {
  assertSafeProfileName,
  keychainSlot,
  profileDir,
  profileRoot,
  resolveProfileName,
  profileEmoji,
  profileColor,
  listProfiles,
  getDefaultProfile,
  setDefaultProfile,
  clearDefaultProfile,
} from "../src/profile.ts"

// Use a temp dir so tests never touch the real ~/.config/claude-profiles/.
let testRoot: string
beforeEach(() => {
  testRoot = join(tmpdir(), `accountly-test-${process.pid}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(testRoot, { recursive: true })
  process.env.CLAUDE_PROFILE_ROOT = testRoot
})
afterEach(() => {
  try {
    rmSync(testRoot, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
  delete process.env.CLAUDE_PROFILE_ROOT
})

// ── assertSafeProfileName ─────────────────────────────────────────────────
// This is the primary security boundary for profile names. Every filesystem
// mutation and Keychain slot derivation routes through it, so regressions
// here are directly exploitable.

describe("assertSafeProfileName", () => {
  test.each([
    ["you@example.com"],
    ["bjorn@stabell.org"],
    ["bjorns@gmail.com"],
    ["d@delei.org"],
    ["simple"],
    ["with-dash"],
    ["with_underscore"],
    ["with.dots"],
    ["with+plus"],
    ["digits123"],
    ["MixedCase"],
    ["a".repeat(128)],
  ])("accepts valid name: %s", (name) => {
    expect(() => assertSafeProfileName(name)).not.toThrow()
  })

  test.each([
    ["empty", ""],
    ["path traversal ..", ".."],
    ["path traversal ../..", "../.."],
    ["path traversal ../etc", "../etc"],
    ["absolute path", "/etc/passwd"],
    ["tilde", "~root"],
    ["slash in name", "a/b"],
    ["backslash", "a\\b"],
    ["dollar expansion", "$(rm -rf)"],
    ["backticks", "`id`"],
    ["double quotes", 'a"b'],
    ["single quotes", "a'b"],
    ["newline", "a\nb"],
    ["null byte", "a\x00b"],
    ["space", "a b"],
    ["shell metachar !", "a!b"],
    ["shell metachar *", "a*b"],
    ["shell metachar ?", "a?b"],
    ["shell metachar #", "a#b"],
    ["shell metachar &", "a&b"],
    ["shell metachar |", "a|b"],
    ["shell metachar ;", "a;b"],
    ["reserved: dot", "."],
    ["reserved: dotdot", ".."],
    ["reserved: default", "default"],
    ["too long (129 chars)", "a".repeat(129)],
  ])("rejects invalid name: %s", (_label, name) => {
    expect(() => assertSafeProfileName(name)).toThrow()
  })

  test("rejects name that would escape profileRoot after resolution", () => {
    // Even if the regex passes, a path that resolves outside profileRoot
    // should be caught by the second-pass check.
    expect(() => assertSafeProfileName("..")).toThrow(/escape|reserved/)
  })
})

// ── keychainSlot ───────────────────────────────────────────────────────────
// Must produce deterministic 8-hex-char-suffixed names matching the format
// Claude Code uses to look up its own Keychain credentials.

describe("keychainSlot", () => {
  test("matches Claude Code 2.1.109 format", () => {
    const slot = keychainSlot("/some/abs/path")
    expect(slot).toMatch(/^Claude Code-credentials-[0-9a-f]{8}$/)
  })

  test("is deterministic", () => {
    const a = keychainSlot("/Users/test/.config/claude-profiles/you@example.com")
    const b = keychainSlot("/Users/test/.config/claude-profiles/you@example.com")
    expect(a).toBe(b)
  })

  test("differs for different dirs", () => {
    const a = keychainSlot("/Users/test/.config/claude-profiles/a@example.com")
    const b = keychainSlot("/Users/test/.config/claude-profiles/b@example.com")
    expect(a).not.toBe(b)
  })

  // Regression guard against a known good hash for a known input.
  test("known-good hash for /Users/beorn/.config/claude-profiles/bjorn@stabell.org", () => {
    // Verified against real macOS keychain 2026-04-15.
    const slot = keychainSlot("/Users/beorn/.config/claude-profiles/bjorn@stabell.org")
    expect(slot).toBe("Claude Code-credentials-2e14613d")
  })
})

// ── profileDir ─────────────────────────────────────────────────────────────

describe("profileDir", () => {
  test("returns path under profileRoot", () => {
    const dir = profileDir("you@example.com")
    expect(dir).toBe(join(testRoot, "you@example.com"))
  })

  test("rejects unsafe names before constructing path", () => {
    expect(() => profileDir("../escape")).toThrow()
    expect(() => profileDir("default")).toThrow()
  })
})

// ── resolveProfileName ─────────────────────────────────────────────────────

describe("resolveProfileName", () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, "you@example.com"), { recursive: true })
    mkdirSync(join(testRoot, "bjorn@stabell.org"), { recursive: true })
    mkdirSync(join(testRoot, "bjorns@gmail.com"), { recursive: true })
  })

  test("exact match wins", () => {
    expect(resolveProfileName("you@example.com")).toBe("you@example.com")
  })

  test("unique prefix resolves", () => {
    expect(resolveProfileName("you")).toBe("you@example.com")
  })

  test("unique substring resolves", () => {
    expect(resolveProfileName("gmail")).toBe("bjorns@gmail.com")
  })

  test("ambiguous prefix returns input unchanged", () => {
    // "bjorn" prefix-matches both bjorn@stabell.org AND bjorns@gmail.com
    expect(resolveProfileName("bjorn")).toBe("bjorn")
  })

  test("no match returns input unchanged (caller bootstraps new profile)", () => {
    expect(resolveProfileName("nonexistent")).toBe("nonexistent")
  })
})

// ── default symlink ────────────────────────────────────────────────────────

describe("default profile symlink", () => {
  beforeEach(() => {
    mkdirSync(join(testRoot, "you@example.com"), { recursive: true })
    mkdirSync(join(testRoot, "work@example.com"), { recursive: true })
  })

  test("setDefaultProfile creates a symlink", () => {
    setDefaultProfile("you@example.com")
    expect(getDefaultProfile()).toBe("you@example.com")
  })

  test("setDefaultProfile replaces an existing symlink", () => {
    setDefaultProfile("you@example.com")
    setDefaultProfile("work@example.com")
    expect(getDefaultProfile()).toBe("work@example.com")
  })

  test("clearDefaultProfile removes the symlink", () => {
    setDefaultProfile("you@example.com")
    clearDefaultProfile()
    expect(getDefaultProfile()).toBeUndefined()
  })

  test("getDefaultProfile returns undefined when no default set", () => {
    expect(getDefaultProfile()).toBeUndefined()
  })

  test("setDefaultProfile rejects nonexistent profile", () => {
    expect(() => setDefaultProfile("nonexistent@example.com")).toThrow()
  })

  // SECURITY: Finding #8 regression guard.
  // An attacker with write access to profileRoot could create a symlink
  // pointing to shell-injection payload. getDefaultProfile() must reject
  // unsafe names so they don't flow into initShell's eval'd output.
  test("getDefaultProfile rejects unsafe symlink targets (Finding #8)", () => {
    // Manually create a symlink bypassing setDefaultProfile's validation.
    symlinkSync("$(rm -rf ~)", join(testRoot, "default"))
    expect(getDefaultProfile()).toBeUndefined()
  })

  // Path-traversal symlink targets get basename-extracted, so
  // "../../etc/passwd" resolves to "passwd" — a valid profile name. The
  // attack is still neutralized downstream because profileDir("passwd")
  // stays under profileRoot and the shell hook's `[[ -d … ]]` check skips
  // the nonexistent dir. This test documents that invariant.
  test("path-traversal symlink target cannot escape profileRoot via basename extraction", () => {
    symlinkSync("../../etc/passwd", join(testRoot, "default"))
    const result = getDefaultProfile()
    // Whatever basename comes out, profileDir() must keep it inside profileRoot.
    if (result) {
      const dir = profileDir(result)
      expect(dir.startsWith(testRoot + "/")).toBe(true)
    }
  })
})

// ── listProfiles ───────────────────────────────────────────────────────────

describe("listProfiles", () => {
  test("returns empty list when profileRoot is empty", () => {
    expect(listProfiles()).toEqual([])
  })

  test("lists real directories, sorted", () => {
    mkdirSync(join(testRoot, "zeta@example.com"), { recursive: true })
    mkdirSync(join(testRoot, "alpha@example.com"), { recursive: true })
    const names = listProfiles().map((p) => p.name)
    expect(names).toEqual(["alpha@example.com", "zeta@example.com"])
  })

  test("skips the `default` symlink (not a profile)", () => {
    mkdirSync(join(testRoot, "you@example.com"), { recursive: true })
    symlinkSync("you@example.com", join(testRoot, "default"))
    const names = listProfiles().map((p) => p.name)
    expect(names).toEqual(["you@example.com"])
  })

  test("skips symlinks that point at directories", () => {
    mkdirSync(join(testRoot, "real@example.com"), { recursive: true })
    symlinkSync("real@example.com", join(testRoot, "alias@example.com"))
    const names = listProfiles().map((p) => p.name)
    expect(names).toEqual(["real@example.com"])
  })
})

// ── cosmetic helpers ───────────────────────────────────────────────────────

describe("profileEmoji / profileColor", () => {
  test("deterministic: same input → same output", () => {
    expect(profileEmoji("you@example.com")).toBe(profileEmoji("you@example.com"))
    expect(profileColor("you@example.com")).toBe(profileColor("you@example.com"))
  })

  test("returns emoji from known pool", () => {
    const emoji = profileEmoji("test")
    expect(emoji.length).toBeGreaterThan(0)
  })

  test("returns hex color", () => {
    expect(profileColor("test")).toMatch(/^#[0-9A-F]{6}$/)
  })
})
