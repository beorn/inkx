/**
 * MockFileSystem Tests
 */

import { describe, test, expect, beforeEach } from "vitest"
import { MockFileSystem, createMockFileSystem } from "./mock-fs.ts"

describe("MockFileSystem", () => {
  let fs: MockFileSystem

  beforeEach(() => {
    fs = createMockFileSystem()
  })

  describe("writeFileSync / readFileSync", () => {
    test("writes and reads file content", () => {
      fs.mkdirSync("/repo", { recursive: true })
      fs.writeFileSync("/repo/test.md", "# Hello")
      expect(fs.readFileSync("/repo/test.md")).toBe("# Hello")
    })

    test("overwrites existing file", () => {
      fs.mkdirSync("/repo", { recursive: true })
      fs.writeFileSync("/repo/test.md", "first")
      fs.writeFileSync("/repo/test.md", "second")
      expect(fs.readFileSync("/repo/test.md")).toBe("second")
    })

    test("throws ENOENT for missing parent directory", () => {
      expect(() => fs.writeFileSync("/missing/test.md", "content")).toThrow()
      try {
        fs.writeFileSync("/missing/test.md", "content")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("ENOENT")
      }
    })

    test("throws ENOENT for reading missing file", () => {
      expect(() => fs.readFileSync("/missing.md")).toThrow()
      try {
        fs.readFileSync("/missing.md")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("ENOENT")
      }
    })

    test("throws EISDIR for reading directory", () => {
      fs.mkdirSync("/repo", { recursive: true })
      expect(() => fs.readFileSync("/repo")).toThrow()
      try {
        fs.readFileSync("/repo")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("EISDIR")
      }
    })
  })

  describe("mkdirSync", () => {
    test("creates directory", () => {
      fs.mkdirSync("/repo")
      expect(fs.existsSync("/repo")).toBe(true)
    })

    test("creates nested directories with recursive option", () => {
      fs.mkdirSync("/repo/nested/deep", { recursive: true })
      expect(fs.existsSync("/repo")).toBe(true)
      expect(fs.existsSync("/repo/nested")).toBe(true)
      expect(fs.existsSync("/repo/nested/deep")).toBe(true)
    })

    test("throws ENOENT without recursive for missing parent", () => {
      expect(() => fs.mkdirSync("/repo/nested")).toThrow()
      try {
        fs.mkdirSync("/repo/nested")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("ENOENT")
      }
    })

    test("silently succeeds if directory already exists", () => {
      fs.mkdirSync("/repo")
      fs.mkdirSync("/repo") // Should not throw
      expect(fs.existsSync("/repo")).toBe(true)
    })
  })

  describe("unlinkSync", () => {
    test("deletes file", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/test.md", "content")
      expect(fs.existsSync("/repo/test.md")).toBe(true)
      fs.unlinkSync("/repo/test.md")
      expect(fs.existsSync("/repo/test.md")).toBe(false)
    })

    test("throws ENOENT for missing file", () => {
      expect(() => fs.unlinkSync("/missing.md")).toThrow()
      try {
        fs.unlinkSync("/missing.md")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("ENOENT")
      }
    })

    test("throws EISDIR for directory", () => {
      fs.mkdirSync("/repo")
      expect(() => fs.unlinkSync("/repo")).toThrow()
      try {
        fs.unlinkSync("/repo")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("EISDIR")
      }
    })
  })

  describe("renameSync", () => {
    test("renames file", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/old.md", "content")
      fs.renameSync("/repo/old.md", "/repo/new.md")
      expect(fs.existsSync("/repo/old.md")).toBe(false)
      expect(fs.existsSync("/repo/new.md")).toBe(true)
      expect(fs.readFileSync("/repo/new.md")).toBe("content")
    })

    test("moves file to different directory", () => {
      fs.mkdirSync("/repo/a", { recursive: true })
      fs.mkdirSync("/repo/b", { recursive: true })
      fs.writeFileSync("/repo/a/file.md", "content")
      fs.renameSync("/repo/a/file.md", "/repo/b/file.md")
      expect(fs.existsSync("/repo/a/file.md")).toBe(false)
      expect(fs.existsSync("/repo/b/file.md")).toBe(true)
    })

    test("throws ENOENT for missing source", () => {
      expect(() => fs.renameSync("/missing.md", "/new.md")).toThrow()
    })
  })

  describe("statSync", () => {
    test("returns stat for file", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/test.md", "content")
      const stat = fs.statSync("/repo/test.md")
      expect(stat.isFile()).toBe(true)
      expect(stat.isDirectory()).toBe(false)
      expect(stat.size).toBe(7) // "content".length
      expect(stat.ino).toBeGreaterThan(0)
      expect(stat.mtimeMs).toBeGreaterThan(0)
    })

    test("returns stat for directory", () => {
      fs.mkdirSync("/repo")
      const stat = fs.statSync("/repo")
      expect(stat.isFile()).toBe(false)
      expect(stat.isDirectory()).toBe(true)
    })

    test("throws ENOENT for missing path", () => {
      expect(() => fs.statSync("/missing")).toThrow()
      try {
        fs.statSync("/missing")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("ENOENT")
      }
    })
  })

  describe("createScanner", () => {
    test("scans directory entries", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/a.md", "content a")
      fs.writeFileSync("/repo/b.md", "content b")
      fs.mkdirSync("/repo/subdir")

      const scanner = fs.createScanner()
      const entries = scanner("/repo")

      expect(entries.length).toBe(3)
      const paths = entries.map((e) => e.path).sort()
      expect(paths).toEqual(["/repo/a.md", "/repo/b.md", "/repo/subdir"])
    })

    test("only returns direct children", () => {
      fs.mkdirSync("/repo/subdir", { recursive: true })
      fs.writeFileSync("/repo/root.md", "root")
      fs.writeFileSync("/repo/subdir/nested.md", "nested")

      const scanner = fs.createScanner()
      const entries = scanner("/repo")

      const paths = entries.map((e) => e.path)
      expect(paths).toContain("/repo/root.md")
      expect(paths).toContain("/repo/subdir")
      expect(paths).not.toContain("/repo/subdir/nested.md")
    })

    test("respects ignore patterns", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/visible.md", "visible")
      fs.writeFileSync("/repo/.hidden", "hidden")
      fs.mkdirSync("/repo/node_modules")

      const scanner = fs.createScanner()
      const entries = scanner("/repo", [".*", "node_modules"])

      const paths = entries.map((e) => e.path)
      expect(paths).toContain("/repo/visible.md")
      expect(paths).not.toContain("/repo/.hidden")
      expect(paths).not.toContain("/repo/node_modules")
    })

    test("returns correct FsEntry shape", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/test.md", "content")

      const scanner = fs.createScanner()
      const entries = scanner("/repo")
      const entry = entries[0]!

      expect(entry.path).toBe("/repo/test.md")
      expect(entry.ino).toBeGreaterThan(0)
      expect(entry.mtime).toBeGreaterThan(0)
      expect(entry.isDirectory).toBe(false)
    })
  })

  describe("test helpers", () => {
    test("setMtime updates file mtime", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/test.md", "content")
      const before = fs.statSync("/repo/test.md").mtimeMs

      fs.setMtime("/repo/test.md", 12345)
      const after = fs.statSync("/repo/test.md").mtimeMs

      expect(after).toBe(12345)
      expect(after).not.toBe(before)
    })

    test("reset clears all files", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/test.md", "content")
      expect(fs.existsSync("/repo")).toBe(true)

      fs.reset()

      expect(fs.existsSync("/repo")).toBe(false)
      expect(fs.existsSync("/")).toBe(true) // Root always exists
    })

    test("getAllPaths returns all paths", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/a.md", "a")
      fs.writeFileSync("/repo/b.md", "b")

      const paths = fs.getAllPaths()
      expect(paths).toContain("/")
      expect(paths).toContain("/repo")
      expect(paths).toContain("/repo/a.md")
      expect(paths).toContain("/repo/b.md")
    })

    test("getContent returns file content without throwing", () => {
      fs.mkdirSync("/repo")
      fs.writeFileSync("/repo/test.md", "content")

      expect(fs.getContent("/repo/test.md")).toBe("content")
      expect(fs.getContent("/missing.md")).toBeUndefined()
      expect(fs.getContent("/repo")).toBeUndefined() // Directory
    })
  })
})
