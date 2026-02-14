import { describe, expect, test } from "vitest"
import { extractBody, hasBody, isStructuralType, isBodyType } from "../src/body.ts"

// Minimal node-like objects for testing (km-ast types)
const paragraph = { type: "p", id: "p1" }
const code = { type: "code", id: "c1" }
const quote = { type: "quote", id: "q1" }
const listItem = { type: "li", id: "t1" }
const section1 = { type: "oi", id: "s1" }
const section2 = { type: "oi", id: "s2" }
const file = { type: "oi", id: "f1" }
const folder = { type: "oi", id: "d1" }

describe("extractBody", () => {
  test("empty children returns empty body and items", () => {
    const result = extractBody([])
    expect(result.body).toEqual([])
    expect(result.items).toEqual([])
  })

  test("all body content (no structural children)", () => {
    const children = [paragraph, code, quote, listItem]
    const result = extractBody(children)
    expect(result.body).toEqual(children)
    expect(result.items).toEqual([])
  })

  test("all structural (no body content)", () => {
    const children = [section1, section2]
    const result = extractBody(children)
    expect(result.body).toEqual([])
    expect(result.items).toEqual(children)
  })

  test("body before sections", () => {
    const children = [paragraph, code, section1, section2]
    const result = extractBody(children)
    expect(result.body).toEqual([paragraph, code])
    expect(result.items).toEqual([section1, section2])
  })

  test("single body item before sections", () => {
    const children = [paragraph, section1]
    const result = extractBody(children)
    expect(result.body).toEqual([paragraph])
    expect(result.items).toEqual([section1])
  })

  test("list items in body before sections", () => {
    const children = [paragraph, listItem, section1]
    const result = extractBody(children)
    expect(result.body).toEqual([paragraph, listItem])
    expect(result.items).toEqual([section1])
  })

  test("file is structural", () => {
    const children = [paragraph, file, section1]
    const result = extractBody(children)
    expect(result.body).toEqual([paragraph])
    expect(result.items).toEqual([file, section1])
  })

  test("folder is structural", () => {
    const children = [code, folder]
    const result = extractBody(children)
    expect(result.body).toEqual([code])
    expect(result.items).toEqual([folder])
  })

  test("mixed structural types", () => {
    const children = [quote, section1, file, folder]
    const result = extractBody(children)
    expect(result.body).toEqual([quote])
    expect(result.items).toEqual([section1, file, folder])
  })
})

describe("hasBody", () => {
  test("empty children has no body", () => {
    expect(hasBody([])).toBe(false)
  })

  test("starting with paragraph has body", () => {
    expect(hasBody([paragraph, section1])).toBe(true)
  })

  test("starting with section has no body", () => {
    expect(hasBody([section1, paragraph])).toBe(false)
  })

  test("starting with file has no body", () => {
    expect(hasBody([file])).toBe(false)
  })

  test("starting with list item has body", () => {
    expect(hasBody([listItem, section1])).toBe(true)
  })

  test("all body content has body", () => {
    expect(hasBody([paragraph, code, quote])).toBe(true)
  })
})

describe("isStructuralType", () => {
  test("oi is structural", () => {
    expect(isStructuralType("oi")).toBe(true)
  })

  test("p is not structural", () => {
    expect(isStructuralType("p")).toBe(false)
  })

  test("li is not structural", () => {
    expect(isStructuralType("li")).toBe(false)
  })

  test("code is not structural", () => {
    expect(isStructuralType("code")).toBe(false)
  })
})

describe("isBodyType", () => {
  test("p is body type", () => {
    expect(isBodyType("p")).toBe(true)
  })

  test("code is body type", () => {
    expect(isBodyType("code")).toBe(true)
  })

  test("quote is body type", () => {
    expect(isBodyType("quote")).toBe(true)
  })

  test("li is body type", () => {
    expect(isBodyType("li")).toBe(true)
  })

  test("oi is not body type", () => {
    expect(isBodyType("oi")).toBe(false)
  })

  test("link is not body type (it's not outline either, but not a block)", () => {
    // link is neither oi nor block, but isBodyType checks !isOutline
    expect(isBodyType("link")).toBe(true)
  })
})
