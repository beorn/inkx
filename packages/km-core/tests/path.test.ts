import { describe, expect, test } from "vitest"
import { pathOf } from "../src/path.ts"

describe("pathOf", () => {
  test("strips .md extension from file path", () => {
    expect(pathOf({ fs_path: "@km/beads/foo.md" })).toBe("@km/beads/foo")
  })

  test("returns folder path unchanged", () => {
    expect(pathOf({ fs_path: "@km/beads" })).toBe("@km/beads")
  })

  test("strips legacy ./ prefix", () => {
    expect(pathOf({ fs_path: "./@km/beads/foo.md" })).toBe("@km/beads/foo")
  })

  test("strips both ./ and .md", () => {
    expect(pathOf({ fs_path: "./docs/readme.md" })).toBe("docs/readme")
  })

  test("repo root . returns empty string", () => {
    expect(pathOf({ fs_path: "." })).toBe("")
  })

  test("null fs_path returns null", () => {
    expect(pathOf({ fs_path: null })).toBeNull()
  })

  test("undefined fs_path returns null", () => {
    expect(pathOf({ fs_path: undefined })).toBeNull()
  })

  test("missing fs_path returns null", () => {
    expect(pathOf({})).toBeNull()
  })

  test("empty fs_path returns null", () => {
    expect(pathOf({ fs_path: "" })).toBeNull()
  })

  test("case-insensitive .md extension stripping", () => {
    expect(pathOf({ fs_path: "@km/beads/foo.MD" })).toBe("@km/beads/foo")
    expect(pathOf({ fs_path: "@km/beads/foo.Md" })).toBe("@km/beads/foo")
  })

  test("does not strip non-.md extensions", () => {
    expect(pathOf({ fs_path: "config.yaml" })).toBe("config.yaml")
    expect(pathOf({ fs_path: "@km/beads/foo.json" })).toBe("@km/beads/foo.json")
  })

  test("does not strip .md from middle of path", () => {
    expect(pathOf({ fs_path: "foo.md/bar.md" })).toBe("foo.md/bar")
  })
})
