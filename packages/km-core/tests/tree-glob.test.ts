/**
 * Tree glob parser tests.
 *
 * Tests the parseTreeGlob function which parses zsh-style path patterns
 * with node qualifiers into structured data.
 */

import { describe, test, expect } from "vitest"
import { parseTreeGlob } from "../src/tree-glob.ts"

describe("parseTreeGlob — path + recursion", () => {
  test("bare path is recursive by default", () => {
    const g = parseTreeGlob("./inbox")
    expect(g.path).toBe("inbox")
    expect(g.recursive).toBe(true)
    expect(g.qualifiers).toEqual([])
  })

  test("** suffix is recursive", () => {
    const g = parseTreeGlob("./inbox/**")
    expect(g.path).toBe("inbox")
    expect(g.recursive).toBe(true)
  })

  test("* suffix is non-recursive", () => {
    const g = parseTreeGlob("./inbox/*")
    expect(g.path).toBe("inbox")
    expect(g.recursive).toBe(false)
  })

  test("strips leading ./", () => {
    expect(parseTreeGlob("./projects/web").path).toBe("projects/web")
  })

  test("strips leading /", () => {
    expect(parseTreeGlob("/projects/web").path).toBe("projects/web")
  })

  test("nested path with **", () => {
    const g = parseTreeGlob("./inbox/capdocs/**")
    expect(g.path).toBe("inbox/capdocs")
    expect(g.recursive).toBe(true)
  })

  test("nested path with *", () => {
    const g = parseTreeGlob("./inbox/capdocs/*")
    expect(g.path).toBe("inbox/capdocs")
    expect(g.recursive).toBe(false)
  })

  test("trailing slash on path is stripped", () => {
    expect(parseTreeGlob("./inbox/").path).toBe("inbox")
  })
})

describe("parseTreeGlob — negation", () => {
  test("- prefix sets negated", () => {
    const g = parseTreeGlob("-./archive/**")
    expect(g.negated).toBe(true)
    expect(g.path).toBe("archive")
    expect(g.recursive).toBe(true)
  })

  test("no prefix is not negated", () => {
    expect(parseTreeGlob("./inbox").negated).toBe(false)
  })
})

describe("parseTreeGlob — fstype qualifiers", () => {
  test("(.) = files", () => {
    const g = parseTreeGlob("./inbox/**(.)")
    expect(g.recursive).toBe(true)
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["file", "mdfile"], negated: false }])
  })

  test("(/) = folders", () => {
    const g = parseTreeGlob("./inbox/**(/)")
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["folder"], negated: false }])
  })

  test("(#) = sections", () => {
    const g = parseTreeGlob("./inbox/**(#)")
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["mdsection"], negated: false }])
  })

  test("(./) = files or folders (OR)", () => {
    const g = parseTreeGlob("./inbox/**(./)")
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["file", "mdfile", "folder"], negated: false }])
  })

  test("(^#) = not sections", () => {
    const g = parseTreeGlob("./inbox/**(^#)")
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["mdsection"], negated: true }])
  })

  test("(^.) = not files", () => {
    const g = parseTreeGlob("./inbox/**(^.)")
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["file", "mdfile"], negated: true }])
  })

  test("non-recursive with qualifier: *(.) ", () => {
    const g = parseTreeGlob("./inbox/*(.)")
    expect(g.path).toBe("inbox")
    expect(g.recursive).toBe(false)
    expect(g.qualifiers).toEqual([{ type: "fstype", values: ["file", "mdfile"], negated: false }])
  })

  test("no qualifier returns empty array", () => {
    expect(parseTreeGlob("./inbox/**").qualifiers).toEqual([])
  })

  test("mixed include and exclude", () => {
    // (.^#) = include files, exclude sections
    const g = parseTreeGlob("./inbox/**(./^#)")
    expect(g.qualifiers).toHaveLength(2)
    expect(g.qualifiers[0]).toEqual({ type: "fstype", values: ["file", "mdfile", "folder"], negated: false })
    expect(g.qualifiers[1]).toEqual({ type: "fstype", values: ["mdsection"], negated: true })
  })
})

describe("parseTreeGlob — real-world patterns", () => {
  test("@next inbox rule", () => {
    const g = parseTreeGlob("./inbox/**(.)")
    expect(g.path).toBe("inbox")
    expect(g.recursive).toBe(true)
    expect(g.qualifiers[0]?.values).toEqual(["file", "mdfile"])
  })

  test("negated path in query", () => {
    const g = parseTreeGlob("-./archive/**")
    expect(g.negated).toBe(true)
    expect(g.path).toBe("archive")
    expect(g.recursive).toBe(true)
    expect(g.qualifiers).toEqual([])
  })

  test("direct children files", () => {
    const g = parseTreeGlob("./inbox/*(.)")
    expect(g.recursive).toBe(false)
    expect(g.qualifiers[0]?.values).toEqual(["file", "mdfile"])
  })
})
