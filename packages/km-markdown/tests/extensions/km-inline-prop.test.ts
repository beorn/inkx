import { describe, expect, test } from "vitest"
import { fromMarkdown } from "mdast-util-from-markdown"
import { kmInlinePropTransform } from "../../src/extensions/km-inline-prop.ts"

function parse(md: string) {
  const tree = fromMarkdown(md)
  kmInlinePropTransform(tree)
  return tree
}

describe("kmInlinePropTransform", () => {
  test("single property: number", () => {
    const tree = parse("Task rating:: 5")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.props).toEqual({ rating: { type: "number", value: 5 } })
    expect(para.data?.propsRaw).toEqual({ rating: "5" })
    expect(para.data?.cleanText).toBe("Task")
  })

  test("multiple properties", () => {
    const tree = parse("Task blocked-by:: [[other]] rating:: 5")
    const para = tree.children[0]!
    expect(para.data?.props).toEqual({
      "blocked-by": { type: "link", target: "other" },
      rating: { type: "number", value: 5 },
    })
  })

  test("link value", () => {
    const tree = parse("Task blocked-by:: [[Project A]]")
    const para = tree.children[0]!
    expect(para.data?.props?.["blocked-by"]).toEqual({ type: "link", target: "Project A" })
  })

  test("date value", () => {
    const tree = parse("Task due:: 2024-01-15")
    const para = tree.children[0]!
    expect(para.data?.props?.due).toEqual({ type: "date", value: "2024-01-15" })
  })

  test("text value", () => {
    const tree = parse("Task status:: active")
    const para = tree.children[0]!
    expect(para.data?.props?.status).toEqual({ type: "text", value: "active" })
  })

  test("km.* keys are skipped in props but included in propsRaw", () => {
    const tree = parse("Title km.add:: query")
    const para = tree.children[0]!
    expect(para.data?.props).toEqual({}) // km.* keys not in typed props
    expect(para.data?.propsRaw).toEqual({ "km.add": "query" }) // but in propsRaw for heading rules
    expect(para.data?.cleanText).toBe("Title")
  })

  test("no properties in plain text", () => {
    const tree = parse("Just plain text")
    const para = tree.children[0]!
    expect(para.data?.props).toBeUndefined()
  })

  test("list item with property hoists to both paragraph and listItem", () => {
    const tree = parse("- Task rating:: 5")
    const list = tree.children[0]! as any
    expect(list.type).toBe("list")
    const listItem = list.children[0]!
    expect(listItem.type).toBe("listItem")

    // Hoisted to listItem
    expect(listItem.data?.props).toEqual({ rating: { type: "number", value: 5 } })
    expect(listItem.data?.propsRaw).toEqual({ rating: "5" })
    expect(listItem.data?.cleanText).toBe("Task")

    // Also on the paragraph
    const para = listItem.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.props).toEqual({ rating: { type: "number", value: 5 } })
  })

  test("list value with multiple links", () => {
    const tree = parse("Task deps:: [[A]], [[B]]")
    const para = tree.children[0]!
    expect(para.data?.props?.deps).toEqual({
      type: "list",
      values: [
        { type: "link", target: "A" },
        { type: "link", target: "B" },
      ],
    })
  })

  test("clean text strips all properties", () => {
    const tree = parse("Task foo:: bar baz:: qux")
    const para = tree.children[0]!
    expect(para.data?.cleanText).toBe("Task")
  })
})
