import { fromMarkdown } from "mdast-util-from-markdown"
import { describe, expect, test } from "vitest"
import { kmRefsTransform } from "../../src/extensions/km-refs.ts"

function parse(md: string) {
  const tree = fromMarkdown(md)
  kmRefsTransform(tree)
  return tree
}

describe("kmRefsTransform", () => {
  test("extracts tags from paragraph", () => {
    const tree = parse("Hello #world #test")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.tags).toEqual(["world", "test"])
    expect(para.data?.mentions).toBeUndefined()
    expect(para.data?.projects).toBeUndefined()
  })

  test("extracts mentions from paragraph", () => {
    const tree = parse("Assigned to @alice")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.mentions).toEqual(["alice"])
    expect(para.data?.tags).toBeUndefined()
    expect(para.data?.projects).toBeUndefined()
  })

  test("extracts projects from paragraph", () => {
    const tree = parse("For +myproject")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.projects).toEqual(["myproject"])
    expect(para.data?.tags).toBeUndefined()
    expect(para.data?.mentions).toBeUndefined()
  })

  test("extracts all three ref types combined", () => {
    const tree = parse("#tag @user +proj")
    const para = tree.children[0]!
    expect(para.data?.tags).toEqual(["tag"])
    expect(para.data?.mentions).toEqual(["user"])
    expect(para.data?.projects).toEqual(["proj"])
  })

  test("does not set data when no refs found", () => {
    const tree = parse("Just plain text")
    const para = tree.children[0]!
    expect(para.data?.tags).toBeUndefined()
    expect(para.data?.mentions).toBeUndefined()
    expect(para.data?.projects).toBeUndefined()
  })

  test("extracts refs from headings", () => {
    const tree = parse("## Section #important")
    const heading = tree.children[0]!
    expect(heading.type).toBe("heading")
    expect(heading.data?.tags).toEqual(["important"])
  })

  test("hoists refs from list item paragraph to listItem", () => {
    const tree = parse("- Task #urgent @bob")
    const list = tree.children[0]!
    expect(list.type).toBe("list")
    const listItem = (list as any).children[0]
    expect(listItem.type).toBe("listItem")
    expect(listItem.data?.tags).toEqual(["urgent"])
    expect(listItem.data?.mentions).toEqual(["bob"])

    // Also on the paragraph itself
    const para = listItem.children.find((c: any) => c.type === "paragraph")
    expect(para.data?.tags).toEqual(["urgent"])
    expect(para.data?.mentions).toEqual(["bob"])
  })

  test("extracts unicode refs", () => {
    const tree = parse("#café @naïve")
    const para = tree.children[0]!
    expect(para.data?.tags).toEqual(["café"])
    expect(para.data?.mentions).toEqual(["naïve"])
  })

  test("extracts refs with hyphens and underscores", () => {
    const tree = parse("#my-tag @user_name +cool-project")
    const para = tree.children[0]!
    expect(para.data?.tags).toEqual(["my-tag"])
    expect(para.data?.mentions).toEqual(["user_name"])
    expect(para.data?.projects).toEqual(["cool-project"])
  })

  test("multiple paragraphs each get their own refs", () => {
    const tree = parse("First #alpha\n\nSecond #beta @charlie")
    expect(tree.children.length).toBe(2)

    const para1 = tree.children[0]!
    expect(para1.data?.tags).toEqual(["alpha"])
    expect(para1.data?.mentions).toBeUndefined()

    const para2 = tree.children[1]!
    expect(para2.data?.tags).toEqual(["beta"])
    expect(para2.data?.mentions).toEqual(["charlie"])
  })

  test("nested list items each get their own refs", () => {
    const tree = parse("- Item A #first\n- Item B #second @dave")
    const list = tree.children[0]!
    expect(list.type).toBe("list")

    const li1 = (list as any).children[0]
    expect(li1.data?.tags).toEqual(["first"])
    expect(li1.data?.mentions).toBeUndefined()

    const li2 = (list as any).children[1]
    expect(li2.data?.tags).toEqual(["second"])
    expect(li2.data?.mentions).toEqual(["dave"])
  })
})
