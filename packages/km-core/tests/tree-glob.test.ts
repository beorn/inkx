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

describe("parseTreeGlob — task qualifiers", () => {
  test("(t) = any task", () => {
    const g = parseTreeGlob("./**(t)")
    expect(g.qualifiers).toEqual([{ type: "task", values: ["task"], negated: false }])
  })

  test("(p) = past due", () => {
    const g = parseTreeGlob("./**(p)")
    expect(g.qualifiers).toEqual([{ type: "task", values: ["past_due"], negated: false }])
  })

  test("(pw) = past due OR this week", () => {
    const g = parseTreeGlob("./**(pw)")
    expect(g.qualifiers).toEqual([{ type: "task", values: ["past_due", "this_week"], negated: false }])
  })

  test("(pws) = overdue OR this week OR started", () => {
    const g = parseTreeGlob("./**(pws)")
    expect(g.qualifiers).toEqual([{ type: "task", values: ["past_due", "this_week", "started"], negated: false }])
  })

  test("(x) = done tasks", () => {
    const g = parseTreeGlob("./**(x)")
    expect(g.qualifiers).toEqual([{ type: "task", values: ["done"], negated: false }])
  })

  test("(d) = has due date", () => {
    const g = parseTreeGlob("./**(d)")
    expect(g.qualifiers).toEqual([{ type: "task", values: ["has_due"], negated: false }])
  })
})

describe("parseTreeGlob — nodetype qualifiers", () => {
  test("(i) = outline items", () => {
    const g = parseTreeGlob("./**(i)")
    expect(g.qualifiers).toEqual([{ type: "nodetype", values: ["outline"], negated: false }])
  })

  test("(l) = list items", () => {
    const g = parseTreeGlob("./**(l)")
    expect(g.qualifiers).toEqual([{ type: "nodetype", values: ["list"], negated: false }])
  })

  test("(li) = list OR outline", () => {
    const g = parseTreeGlob("./**(li)")
    expect(g.qualifiers).toEqual([{ type: "nodetype", values: ["list", "outline"], negated: false }])
  })
})

describe("parseTreeGlob — cross-dimension (AND across, OR within)", () => {
  test("(.p) = files AND past-due", () => {
    const g = parseTreeGlob("./inbox/**(.p)")
    expect(g.qualifiers).toHaveLength(2)
    expect(g.qualifiers[0]).toEqual({ type: "fstype", values: ["file", "mdfile"], negated: false })
    expect(g.qualifiers[1]).toEqual({ type: "task", values: ["past_due"], negated: false })
  })

  test("(.pw) = files AND (overdue OR this-week)", () => {
    const g = parseTreeGlob("./inbox/**(.pw)")
    expect(g.qualifiers).toHaveLength(2)
    expect(g.qualifiers[0]).toEqual({ type: "fstype", values: ["file", "mdfile"], negated: false })
    expect(g.qualifiers[1]).toEqual({ type: "task", values: ["past_due", "this_week"], negated: false })
  })

  test("(.ipw) = files AND outline AND (overdue OR this-week)", () => {
    const g = parseTreeGlob("./**(.ipw)")
    expect(g.qualifiers).toHaveLength(3)
    expect(g.qualifiers[0]).toEqual({ type: "fstype", values: ["file", "mdfile"], negated: false })
    expect(g.qualifiers[1]).toEqual({ type: "nodetype", values: ["outline"], negated: false })
    expect(g.qualifiers[2]).toEqual({ type: "task", values: ["past_due", "this_week"], negated: false })
  })

  test("@next endgame: ./**(pw)", () => {
    const g = parseTreeGlob("./**(pw)")
    expect(g.path).toBe(".")
    expect(g.recursive).toBe(true)
    expect(g.qualifiers).toEqual([{ type: "task", values: ["past_due", "this_week"], negated: false }])
  })
})
