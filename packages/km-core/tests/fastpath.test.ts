import { describe, test, expect } from "vitest"
import { joinPath, basenameFast, relativeFast, createRelativeFast, isHiddenFast } from "../src/fastpath.ts"
import { join, basename, relative, sep } from "path"

describe("joinPath", () => {
  test("joins absolute dir and simple name", () => {
    expect(joinPath("/repo/src", "file.ts")).toBe(join("/repo/src", "file.ts"))
  })

  test("handles single-segment dir", () => {
    expect(joinPath("/repo", "file.ts")).toBe(join("/repo", "file.ts"))
  })

  test("handles deep paths", () => {
    const dir = "/a/b/c/d/e/f"
    expect(joinPath(dir, "g.md")).toBe(join(dir, "g.md"))
  })

  test("handles filenames with dots", () => {
    expect(joinPath("/repo", "file.test.ts")).toBe(join("/repo", "file.test.ts"))
  })

  test("handles filenames with spaces", () => {
    expect(joinPath("/repo", "my file.md")).toBe(join("/repo", "my file.md"))
  })

  test("handles unicode filenames", () => {
    expect(joinPath("/repo", "日本語.md")).toBe(join("/repo", "日本語.md"))
  })

  test("throws on empty dir in dev", () => {
    expect(() => joinPath("", "file.ts")).toThrow("dir is empty")
  })

  test("throws on empty name in dev", () => {
    expect(() => joinPath("/repo", "")).toThrow("name is empty")
  })

  test("throws on name with separator in dev", () => {
    expect(() => joinPath("/repo", `sub${sep}file.ts`)).toThrow("separator")
  })
})

describe("basenameFast", () => {
  test("extracts basename from absolute path", () => {
    expect(basenameFast("/repo/src/file.ts")).toBe(basename("/repo/src/file.ts"))
  })

  test("handles root-level file", () => {
    expect(basenameFast("/file.ts")).toBe(basename("/file.ts"))
  })

  test("handles deep path", () => {
    const p = "/a/b/c/d/e/file.md"
    expect(basenameFast(p)).toBe(basename(p))
  })

  test("handles bare filename (no separator)", () => {
    expect(basenameFast("file.ts")).toBe("file.ts")
  })

  test("handles dotfiles", () => {
    expect(basenameFast("/repo/.gitignore")).toBe(".gitignore")
  })

  test("handles filename with multiple dots", () => {
    expect(basenameFast("/repo/file.test.spec.ts")).toBe("file.test.spec.ts")
  })

  test("matches path.basename for trailing separator", () => {
    // Edge case: trailing separator
    expect(basenameFast("/repo/src/")).toBe(basename("/repo/src/"))
  })
})

describe("relativeFast", () => {
  test("extracts relative path for child under root", () => {
    expect(relativeFast("/repo", "/repo/src/file.ts")).toBe("src/file.ts")
  })

  test("returns '.' for same path", () => {
    expect(relativeFast("/repo", "/repo")).toBe(".")
  })

  test("handles single-level child", () => {
    expect(relativeFast("/repo", "/repo/file.ts")).toBe("file.ts")
  })

  test("handles deep child", () => {
    expect(relativeFast("/repo", "/repo/a/b/c/d.md")).toBe("a/b/c/d.md")
  })

  test("falls back to path.relative for non-child paths", () => {
    expect(relativeFast("/repo", "/other/file.ts")).toBe(relative("/repo", "/other/file.ts"))
  })

  test("falls back for .. traversal", () => {
    expect(relativeFast("/repo/src", "/repo/file.ts")).toBe(relative("/repo/src", "/repo/file.ts"))
  })

  test("handles root with similar prefix (no false match)", () => {
    // "/repo" should NOT match "/repo-backup/file.ts"
    expect(relativeFast("/repo", "/repo-backup/file.ts")).toBe(relative("/repo", "/repo-backup/file.ts"))
  })
})

describe("createRelativeFast", () => {
  test("precomputed version matches relativeFast", () => {
    const rel = createRelativeFast("/repo")
    expect(rel("/repo/src/file.ts")).toBe("src/file.ts")
    expect(rel("/repo")).toBe(".")
    expect(rel("/repo/a/b/c.md")).toBe("a/b/c.md")
    expect(rel("/other/file.ts")).toBe(relative("/repo", "/other/file.ts"))
  })

  test("does not false-match similar prefixes", () => {
    const rel = createRelativeFast("/repo")
    expect(rel("/repo-backup/file.ts")).toBe(relative("/repo", "/repo-backup/file.ts"))
  })
})

describe("isHiddenFast", () => {
  test("returns true for dotfiles", () => {
    expect(isHiddenFast("/repo/.gitignore")).toBe(true)
    expect(isHiddenFast("/repo/.env")).toBe(true)
    expect(isHiddenFast("/.hidden")).toBe(true)
  })

  test("returns true for dot-directory names", () => {
    expect(isHiddenFast("/repo/.git")).toBe(true)
    expect(isHiddenFast("/repo/.km")).toBe(true)
    expect(isHiddenFast("/repo/.vscode")).toBe(true)
  })

  test("returns false for files inside dot-directories (checks basename only)", () => {
    // isHiddenFast checks the filename, not parent dirs
    expect(isHiddenFast("/repo/.git/config")).toBe(false)
    expect(isHiddenFast("/repo/.km/state.db")).toBe(false)
  })

  test("returns false for normal files", () => {
    expect(isHiddenFast("/repo/file.md")).toBe(false)
    expect(isHiddenFast("/repo/src/index.ts")).toBe(false)
  })

  test("returns false for . and ..", () => {
    expect(isHiddenFast(".")).toBe(false)
    expect(isHiddenFast("..")).toBe(false)
    expect(isHiddenFast("/repo/.")).toBe(false)
    expect(isHiddenFast("/repo/..")).toBe(false)
  })

  test("returns false for .md (index file convention)", () => {
    expect(isHiddenFast("/repo/.md")).toBe(false)
    expect(isHiddenFast(".md")).toBe(false)
  })

  test("returns false for bare filename without dot", () => {
    expect(isHiddenFast("readme")).toBe(false)
  })
})
