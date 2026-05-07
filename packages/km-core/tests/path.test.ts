import { describe, expect, test } from "vitest"
import { fsPathOf } from "../src/path.ts"

describe("fsPathOf", () => {
  test("strips .md extension from file path", () => {
    expect(fsPathOf({ fs_path: "@km/beads/foo.md" })).toBe("@km/beads/foo")
  })

  test("returns folder path unchanged", () => {
    expect(fsPathOf({ fs_path: "@km/beads" })).toBe("@km/beads")
  })

  test("strips legacy ./ prefix", () => {
    expect(fsPathOf({ fs_path: "./@km/beads/foo.md" })).toBe("@km/beads/foo")
  })

  test("strips both ./ and .md", () => {
    expect(fsPathOf({ fs_path: "./docs/readme.md" })).toBe("docs/readme")
  })

  test("repo root . returns empty string", () => {
    expect(fsPathOf({ fs_path: "." })).toBe("")
  })

  test("null fs_path returns null", () => {
    expect(fsPathOf({ fs_path: null })).toBeNull()
  })

  test("undefined fs_path returns null", () => {
    expect(fsPathOf({ fs_path: undefined })).toBeNull()
  })

  test("missing fs_path returns null", () => {
    expect(fsPathOf({})).toBeNull()
  })

  test("empty fs_path returns null", () => {
    expect(fsPathOf({ fs_path: "" })).toBeNull()
  })

  test("case-insensitive .md extension stripping", () => {
    expect(fsPathOf({ fs_path: "@km/beads/foo.MD" })).toBe("@km/beads/foo")
    expect(fsPathOf({ fs_path: "@km/beads/foo.Md" })).toBe("@km/beads/foo")
  })

  test("does not strip non-.md extensions", () => {
    expect(fsPathOf({ fs_path: "config.yaml" })).toBe("config.yaml")
    expect(fsPathOf({ fs_path: "@km/beads/foo.json" })).toBe("@km/beads/foo.json")
  })

  test("does not strip .md from middle of path", () => {
    expect(fsPathOf({ fs_path: "foo.md/bar.md" })).toBe("foo.md/bar")
  })
})
