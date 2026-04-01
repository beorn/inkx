import { describe, expect, test } from "vitest"
import { extractBody } from "../src/body.ts"

// Minimal node-like objects for testing (km-ast types)
const paragraph = { type: "p", id: "p1" }
const code = { type: "code", id: "c1" }
const quote = { type: "quote", id: "q1" }
const listItem = { type: "p", item: {}, id: "t1" }
const section1 = { type: "h", item: {}, id: "s1" }
const section2 = { type: "h", item: {}, id: "s2" }
const file = { type: "h", item: {}, id: "f1" }
const folder = { type: "h", item: {}, id: "d1" }

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
