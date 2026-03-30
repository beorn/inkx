/**
 * Index File Detection Tests
 *
 * Tests for findIndexFile, isIndexFile, and getChildSlotTarget.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { findIndexFile, isIndexFile, getChildSlotTarget, extractSlotTargets } from "@km/core"

function makeNode(overrides: Partial<KNode> & { id: string }): KNode {
  return {
    type: "h",
    item: true,
    parent_id: null,
    parent_idx: 0,
    content: "",
    data: {},
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  } as KNode
}

describe("findIndexFile", () => {
  const folder = makeNode({ id: "folder", fstype: "folder", name: "early-orbit" })

  test("matches same-name .md file", () => {
    const children = [
      makeNode({ id: "idx", fstype: "mdfile", name: "early-orbit", parent_id: "folder" }),
      makeNode({ id: "other", fstype: "mdfile", name: "other-file", parent_id: "folder" }),
    ]
    expect(findIndexFile(folder, children)?.id).toBe("idx")
  })

  test("matches index.md", () => {
    const children = [
      makeNode({ id: "idx", fstype: "mdfile", name: "index", parent_id: "folder" }),
      makeNode({ id: "other", fstype: "mdfile", name: "other", parent_id: "folder" }),
    ]
    expect(findIndexFile(folder, children)?.id).toBe("idx")
  })

  test("matches .md (empty name)", () => {
    const children = [makeNode({ id: "idx", fstype: "mdfile", name: "", parent_id: "folder" })]
    expect(findIndexFile(folder, children)?.id).toBe("idx")
  })

  test("same-name wins over index.md", () => {
    const children = [
      makeNode({ id: "index", fstype: "mdfile", name: "index", parent_id: "folder" }),
      makeNode({ id: "same", fstype: "mdfile", name: "early-orbit", parent_id: "folder" }),
    ]
    expect(findIndexFile(folder, children)?.id).toBe("same")
  })

  test("index.md wins over .md", () => {
    const children = [
      makeNode({ id: "dot", fstype: "mdfile", name: "", parent_id: "folder" }),
      makeNode({ id: "index", fstype: "mdfile", name: "index", parent_id: "folder" }),
    ]
    expect(findIndexFile(folder, children)?.id).toBe("index")
  })

  test("returns null for no match", () => {
    const children = [
      makeNode({ id: "a", fstype: "mdfile", name: "unrelated", parent_id: "folder" }),
      makeNode({ id: "b", fstype: "mdfile", name: "something-else", parent_id: "folder" }),
    ]
    expect(findIndexFile(folder, children)).toBeNull()
  })

  test("ignores non-mdfile nodes", () => {
    const children = [
      makeNode({ id: "sub", fstype: "folder", name: "early-orbit", parent_id: "folder" }),
      makeNode({ id: "sec", fstype: "mdsection", name: "index", parent_id: "folder" }),
    ]
    expect(findIndexFile(folder, children)).toBeNull()
  })

  test("returns null for folder with no name", () => {
    const nameless = makeNode({ id: "f", fstype: "folder", name: undefined })
    const children = [makeNode({ id: "idx", fstype: "mdfile", name: "index", parent_id: "f" })]
    expect(findIndexFile(nameless, children)).toBeNull()
  })

  test("same-name match is case/separator insensitive", () => {
    const f = makeNode({ id: "f", fstype: "folder", name: "my-project" })
    const children = [makeNode({ id: "idx", fstype: "mdfile", name: "My Project", parent_id: "f" })]
    expect(findIndexFile(f, children)?.id).toBe("idx")
  })
})

describe("isIndexFile", () => {
  test("matches same-name", () => {
    const child = makeNode({ id: "c", fstype: "mdfile", name: "project" })
    expect(isIndexFile("project", child)).toBe(true)
  })

  test("matches index.md", () => {
    const child = makeNode({ id: "c", fstype: "mdfile", name: "index" })
    expect(isIndexFile("anything", child)).toBe(true)
  })

  test("matches empty name (.md)", () => {
    const child = makeNode({ id: "c", fstype: "mdfile", name: "" })
    expect(isIndexFile("anything", child)).toBe(true)
  })

  test("rejects non-mdfile", () => {
    const child = makeNode({ id: "c", fstype: "folder", name: "index" })
    expect(isIndexFile("anything", child)).toBe(false)
  })

  test("rejects unrelated name", () => {
    const child = makeNode({ id: "c", fstype: "mdfile", name: "other" })
    expect(isIndexFile("project", child)).toBe(false)
  })
})

describe("getChildSlotTarget", () => {
  test("extracts target from ![[./child]]", () => {
    const node = makeNode({ id: "s", content: "![[./mip]]" })
    expect(getChildSlotTarget(node)).toBe("mip")
  })

  test("extracts multi-word target", () => {
    const node = makeNode({ id: "s", content: "![[./launch-academy]]" })
    expect(getChildSlotTarget(node)).toBe("launch-academy")
  })

  test("returns null for non-relative embed", () => {
    const node = makeNode({ id: "s", content: "![[other-file]]" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("returns null for regular wikilink", () => {
    const node = makeNode({ id: "s", content: "[[./mip]]" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("returns null for mixed content", () => {
    const node = makeNode({ id: "s", content: "Some text ![[./mip]]" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("returns null for empty content", () => {
    const node = makeNode({ id: "s", content: "" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("returns null for no content", () => {
    const node = makeNode({ id: "s" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("handles whitespace around content", () => {
    const node = makeNode({ id: "s", content: "  ![[./mip]]  " })
    expect(getChildSlotTarget(node)).toBe("mip")
  })

  test("handles trailing newline", () => {
    const node = makeNode({ id: "s", content: "![[./mip]]\n" })
    expect(getChildSlotTarget(node)).toBe("mip")
  })

  test("extracts nested path target with slashes", () => {
    const node = makeNode({ id: "s", content: "![[./sub/nested]]" })
    expect(getChildSlotTarget(node)).toBe("sub/nested")
  })

  test("multi-line embed content returns null (not a single slot)", () => {
    const node = makeNode({ id: "s", content: "![[./alpha]]\n![[./beta]]" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("returns null when embed has trailing text", () => {
    const node = makeNode({ id: "s", content: "![[./child]] extra text" })
    expect(getChildSlotTarget(node)).toBeNull()
  })

  test("returns null for whitespace-only content", () => {
    const node = makeNode({ id: "s", content: "   " })
    expect(getChildSlotTarget(node)).toBeNull()
  })
})

describe("extractSlotTargets", () => {
  test("single embed child → one target", () => {
    const children = [makeNode({ id: "s1", content: "![[./alpha]]" })]
    expect(extractSlotTargets(children)).toEqual(["alpha"])
  })

  test("multi-embed child (multiple lines, all slots) → multiple targets", () => {
    const children = [makeNode({ id: "s1", content: "![[./alpha]]\n![[./beta]]" })]
    expect(extractSlotTargets(children)).toEqual(["alpha", "beta"])
  })

  test("prose containing embed → NOT a slot (returns empty)", () => {
    const children = [makeNode({ id: "s1", content: "See ![[./alpha]] later" })]
    expect(extractSlotTargets(children)).toEqual([])
  })

  test("mixed: some slot children, some body children → only slot targets returned", () => {
    const children = [
      makeNode({ id: "s1", content: "![[./alpha]]" }),
      makeNode({ id: "s2", content: "Just a paragraph" }),
      makeNode({ id: "s3", content: "![[./beta]]\n![[./gamma]]" }),
    ]
    expect(extractSlotTargets(children)).toEqual(["alpha", "beta", "gamma"])
  })

  test("empty children list → empty targets", () => {
    expect(extractSlotTargets([])).toEqual([])
  })

  test("child with empty content → skipped", () => {
    const children = [makeNode({ id: "s1", content: "" })]
    expect(extractSlotTargets(children)).toEqual([])
  })

  test("child with only whitespace → skipped", () => {
    const children = [makeNode({ id: "s1", content: "   \n  " })]
    expect(extractSlotTargets(children)).toEqual([])
  })

  test("multi-line with one prose line mixed in → NOT a slot", () => {
    const children = [makeNode({ id: "s1", content: "![[./alpha]]\nsome text\n![[./beta]]" })]
    expect(extractSlotTargets(children)).toEqual([])
  })

  test("embed with whitespace padding on lines → still extracted", () => {
    const children = [makeNode({ id: "s1", content: "  ![[./alpha]]  \n  ![[./beta]]  " })]
    expect(extractSlotTargets(children)).toEqual(["alpha", "beta"])
  })

  test("non-relative embed ![[other]] → NOT a slot", () => {
    const children = [makeNode({ id: "s1", content: "![[other]]" })]
    expect(extractSlotTargets(children)).toEqual([])
  })
})

describe("findIndexFile — duplicate same-name files", () => {
  test("returns first same-name match found", () => {
    const folder = makeNode({ id: "f", fstype: "folder", name: "project" })
    const file1 = makeNode({ id: "a", fstype: "mdfile", name: "project", parent_id: "f" })
    const file2 = makeNode({ id: "b", fstype: "mdfile", name: "project", parent_id: "f" })
    expect(findIndexFile(folder, [file1, file2])?.id).toBe("a")
  })
})
