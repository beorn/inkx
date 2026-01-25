/**
 * MockFileSystem Tests
 */

import { describe, test, expect, beforeEach } from "bun:test"
import { MockFileSystem, createMockFileSystem } from "./mock-fs.ts"

describe("MockFileSystem", () => {
  let fs: MockFileSystem

  beforeEach(() => {
    fs = createMockFileSystem()
  })

  describe("writeFileSync / readFileSync", () => {
    test("writes and reads file content", () => {
      fs.mkdirSync("/vault", { recursive: true })
      fs.writeFileSync("/vault/test.md", "# Hello")
      expect(fs.readFileSync("/vault/test.md")).toBe("# Hello")
    })

    test("overwrites existing file", () => {
      fs.mkdirSync("/vault", { recursive: true })
      fs.writeFileSync("/vault/test.md", "first")
      fs.writeFileSync("/vault/test.md", "second")
      expect(fs.readFileSync("/vault/test.md")).toBe("second")
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
      fs.mkdirSync("/vault", { recursive: true })
      expect(() => fs.readFileSync("/vault")).toThrow()
      try {
        fs.readFileSync("/vault")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("EISDIR")
      }
    })
  })

  describe("mkdirSync", () => {
    test("creates directory", () => {
      fs.mkdirSync("/vault")
      expect(fs.existsSync("/vault")).toBe(true)
    })

    test("creates nested directories with recursive option", () => {
      fs.mkdirSync("/vault/nested/deep", { recursive: true })
      expect(fs.existsSync("/vault")).toBe(true)
      expect(fs.existsSync("/vault/nested")).toBe(true)
      expect(fs.existsSync("/vault/nested/deep")).toBe(true)
    })

    test("throws ENOENT without recursive for missing parent", () => {
      expect(() => fs.mkdirSync("/vault/nested")).toThrow()
      try {
        fs.mkdirSync("/vault/nested")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("ENOENT")
      }
    })

    test("silently succeeds if directory already exists", () => {
      fs.mkdirSync("/vault")
      fs.mkdirSync("/vault") // Should not throw
      expect(fs.existsSync("/vault")).toBe(true)
    })
  })

  describe("unlinkSync", () => {
    test("deletes file", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/test.md", "content")
      expect(fs.existsSync("/vault/test.md")).toBe(true)
      fs.unlinkSync("/vault/test.md")
      expect(fs.existsSync("/vault/test.md")).toBe(false)
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
      fs.mkdirSync("/vault")
      expect(() => fs.unlinkSync("/vault")).toThrow()
      try {
        fs.unlinkSync("/vault")
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).toBe("EISDIR")
      }
    })
  })

  describe("renameSync", () => {
    test("renames file", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/old.md", "content")
      fs.renameSync("/vault/old.md", "/vault/new.md")
      expect(fs.existsSync("/vault/old.md")).toBe(false)
      expect(fs.existsSync("/vault/new.md")).toBe(true)
      expect(fs.readFileSync("/vault/new.md")).toBe("content")
    })

    test("moves file to different directory", () => {
      fs.mkdirSync("/vault/a", { recursive: true })
      fs.mkdirSync("/vault/b", { recursive: true })
      fs.writeFileSync("/vault/a/file.md", "content")
      fs.renameSync("/vault/a/file.md", "/vault/b/file.md")
      expect(fs.existsSync("/vault/a/file.md")).toBe(false)
      expect(fs.existsSync("/vault/b/file.md")).toBe(true)
    })

    test("throws ENOENT for missing source", () => {
      expect(() => fs.renameSync("/missing.md", "/new.md")).toThrow()
    })
  })

  describe("statSync", () => {
    test("returns stat for file", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/test.md", "content")
      const stat = fs.statSync("/vault/test.md")
      expect(stat.isFile()).toBe(true)
      expect(stat.isDirectory()).toBe(false)
      expect(stat.size).toBe(7) // "content".length
      expect(stat.ino).toBeGreaterThan(0)
      expect(stat.mtimeMs).toBeGreaterThan(0)
    })

    test("returns stat for directory", () => {
      fs.mkdirSync("/vault")
      const stat = fs.statSync("/vault")
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
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/a.md", "content a")
      fs.writeFileSync("/vault/b.md", "content b")
      fs.mkdirSync("/vault/subdir")

      const scanner = fs.createScanner()
      const entries = scanner("/vault")

      expect(entries.length).toBe(3)
      const paths = entries.map((e) => e.path).sort()
      expect(paths).toEqual(["/vault/a.md", "/vault/b.md", "/vault/subdir"])
    })

    test("only returns direct children", () => {
      fs.mkdirSync("/vault/subdir", { recursive: true })
      fs.writeFileSync("/vault/root.md", "root")
      fs.writeFileSync("/vault/subdir/nested.md", "nested")

      const scanner = fs.createScanner()
      const entries = scanner("/vault")

      const paths = entries.map((e) => e.path)
      expect(paths).toContain("/vault/root.md")
      expect(paths).toContain("/vault/subdir")
      expect(paths).not.toContain("/vault/subdir/nested.md")
    })

    test("respects ignore patterns", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/visible.md", "visible")
      fs.writeFileSync("/vault/.hidden", "hidden")
      fs.mkdirSync("/vault/node_modules")

      const scanner = fs.createScanner()
      const entries = scanner("/vault", [".*", "node_modules"])

      const paths = entries.map((e) => e.path)
      expect(paths).toContain("/vault/visible.md")
      expect(paths).not.toContain("/vault/.hidden")
      expect(paths).not.toContain("/vault/node_modules")
    })

    test("returns correct FsEntry shape", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/test.md", "content")

      const scanner = fs.createScanner()
      const entries = scanner("/vault")
      const entry = entries[0]!

      expect(entry.path).toBe("/vault/test.md")
      expect(entry.ino).toBeGreaterThan(0)
      expect(entry.mtime).toBeGreaterThan(0)
      expect(entry.isDirectory).toBe(false)
    })
  })

  describe("test helpers", () => {
    test("setMtime updates file mtime", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/test.md", "content")
      const before = fs.statSync("/vault/test.md").mtimeMs

      fs.setMtime("/vault/test.md", 12345)
      const after = fs.statSync("/vault/test.md").mtimeMs

      expect(after).toBe(12345)
      expect(after).not.toBe(before)
    })

    test("reset clears all files", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/test.md", "content")
      expect(fs.existsSync("/vault")).toBe(true)

      fs.reset()

      expect(fs.existsSync("/vault")).toBe(false)
      expect(fs.existsSync("/")).toBe(true) // Root always exists
    })

    test("getAllPaths returns all paths", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/a.md", "a")
      fs.writeFileSync("/vault/b.md", "b")

      const paths = fs.getAllPaths()
      expect(paths).toContain("/")
      expect(paths).toContain("/vault")
      expect(paths).toContain("/vault/a.md")
      expect(paths).toContain("/vault/b.md")
    })

    test("getContent returns file content without throwing", () => {
      fs.mkdirSync("/vault")
      fs.writeFileSync("/vault/test.md", "content")

      expect(fs.getContent("/vault/test.md")).toBe("content")
      expect(fs.getContent("/missing.md")).toBeUndefined()
      expect(fs.getContent("/vault")).toBeUndefined() // Directory
    })
  })
})
