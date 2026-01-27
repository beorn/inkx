import { describe, expect, test } from "vitest"
import {
  extractBody,
  hasBody,
  isStructuralType,
  isBodyType,
} from "../src/body.ts"

// Minimal node-like objects for testing
const paragraph = { type: "paragraph", id: "p1" }
const code = { type: "code", id: "c1" }
const quote = { type: "quote", id: "q1" }
const task = { type: "task", id: "t1" }
const section1 = { type: "section", id: "s1" }
const section2 = { type: "section", id: "s2" }
const file = { type: "file", id: "f1" }
const folder = { type: "folder", id: "d1" }

describe("extractBody", () => {
  test("empty children returns empty body and items", () => {
    const result = extractBody([])
    expect(result.body).toEqual([])
    expect(result.items).toEqual([])
  })

  test("all body content (no structural children)", () => {
    const children = [paragraph, code, quote, task]
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

  test("tasks in body before sections", () => {
    const children = [paragraph, task, section1]
    const result = extractBody(children)
    expect(result.body).toEqual([paragraph, task])
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

  test("starting with task has body", () => {
    expect(hasBody([task, section1])).toBe(true)
  })

  test("all body content has body", () => {
    expect(hasBody([paragraph, code, quote])).toBe(true)
  })
})

describe("isStructuralType", () => {
  test("section is structural", () => {
    expect(isStructuralType("section")).toBe(true)
  })

  test("file is structural", () => {
    expect(isStructuralType("file")).toBe(true)
  })

  test("folder is structural", () => {
    expect(isStructuralType("folder")).toBe(true)
  })

  test("paragraph is not structural", () => {
    expect(isStructuralType("paragraph")).toBe(false)
  })

  test("task is not structural", () => {
    expect(isStructuralType("task")).toBe(false)
  })

  test("code is not structural", () => {
    expect(isStructuralType("code")).toBe(false)
  })
})

describe("isBodyType", () => {
  test("paragraph is body type", () => {
    expect(isBodyType("paragraph")).toBe(true)
  })

  test("code is body type", () => {
    expect(isBodyType("code")).toBe(true)
  })

  test("quote is body type", () => {
    expect(isBodyType("quote")).toBe(true)
  })

  test("task is body type", () => {
    expect(isBodyType("task")).toBe(true)
  })

  test("section is not body type", () => {
    expect(isBodyType("section")).toBe(false)
  })

  test("file is not body type", () => {
    expect(isBodyType("file")).toBe(false)
  })
})
