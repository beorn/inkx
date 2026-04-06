import { describe, it, expect } from "vitest"
import { KNode } from "../../src/interfaces/node.ts"

describe("KNode namespace", () => {
  describe("KNode.isOutline", () => {
    it("true for heading items", () => {
      expect(KNode.isOutline({ type: "h", item: {} })).toBe(true)
    })

    it("false for non-heading items", () => {
      expect(KNode.isOutline({ type: "p", item: {} })).toBe(false)
    })

    it("false for heading non-items", () => {
      expect(KNode.isOutline({ type: "h" })).toBe(false)
    })
  })

  describe("KNode.isListItem", () => {
    it("true for non-heading items", () => {
      expect(KNode.isListItem({ type: "p", item: {} })).toBe(true)
      expect(KNode.isListItem({ type: "code", item: {} })).toBe(true)
    })

    it("false for heading items (those are outlines)", () => {
      expect(KNode.isListItem({ type: "h", item: {} })).toBe(false)
    })

    it("false for non-items", () => {
      expect(KNode.isListItem({ type: "p" })).toBe(false)
    })
  })

  describe("KNode.isItem", () => {
    it("true when item is present", () => {
      expect(KNode.isItem({ type: "h", item: {} })).toBe(true)
      expect(KNode.isItem({ type: "p", item: { list: "-" } })).toBe(true)
    })

    it("false when item is undefined", () => {
      expect(KNode.isItem({ type: "p" })).toBe(false)
    })
  })

  describe("KNode.isBlock", () => {
    it("true when not an item", () => {
      expect(KNode.isBlock({ type: "p" })).toBe(true)
    })

    it("false when item is present", () => {
      expect(KNode.isBlock({ type: "p", item: {} })).toBe(false)
    })
  })

  describe("KNode.isSymlink", () => {
    it("true when symlink_to is set", () => {
      expect(KNode.isSymlink({ symlink_to: "some-id" })).toBe(true)
    })

    it("false when symlink_to is null or undefined", () => {
      expect(KNode.isSymlink({ symlink_to: null })).toBe(false)
      expect(KNode.isSymlink({})).toBe(false)
    })
  })

  describe("KNode.isTask", () => {
    it("true with item.task", () => {
      expect(KNode.isTask({ item: { task: { marker: "[ ]", status: "todo" } } })).toBe(true)
      expect(KNode.isTask({ item: { task: { marker: "[x]", status: "done" } } })).toBe(true)
    })

    it("false without task", () => {
      expect(KNode.isTask({})).toBe(false)
      expect(KNode.isTask({ item: {} })).toBe(false)
      expect(KNode.isTask({ item: { list: "-" } })).toBe(false)
    })
  })

  describe("KNode.extractProps", () => {
    it("extracts type, item with task reset from task node", () => {
      const node = {
        id: "abc123",
        type: "p",
        item: { list: "-", task: { marker: "[x]", status: "done" } },
        parent_id: "parent1",
        parent_idx: 3,
        content: "- [x] Buy milk",
        data: { assignee: "alice" },
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
      } as any
      const props = KNode.extractProps(node)
      expect(props.type).toBe("p")
      expect(props.item).toEqual({ list: "-", task: { marker: "[ ]", status: "todo" } })
      // Data is a system key — not inherited (source-specific)
      expect(props.data).toBeUndefined()
    })

    it("extracts type, item from section node but NOT fstype", () => {
      const node = {
        id: "sec1",
        type: "h",
        item: {},
        parent_id: "root",
        parent_idx: 1,
        fstype: "mdsection",
        name: "My Section",
        content: "My Section",
        data: {},
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
      } as any
      const props = KNode.extractProps(node)
      expect(props.type).toBe("h")
      expect(props.item).toEqual({})
      // fstype is a system key — not inherited
      expect(props.fstype).toBeUndefined()
      // name, content are system keys
      expect(props.name).toBeUndefined()
      expect(props.content).toBeUndefined()
    })

    it("strips data blob (source-specific, not inheritable)", () => {
      const node = {
        id: "n1",
        type: "p",
        parent_id: "p1",
        parent_idx: 0,
        data: { custom: "value", nested: { x: 1 } },
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
      } as any
      const props = KNode.extractProps(node)
      // data is a system key — contains source-specific info (name, title, etc.)
      expect(props.data).toBeUndefined()
    })

    it("excludes all system fields", () => {
      const node = {
        id: "n1",
        type: "p",
        item: {},
        parent_id: "p1",
        parent_idx: 5,
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
        block_id: "blk1",
        fs_path: "/some/path",
        fs_ino: 12345,
        fs_mtime: 99999,
        fstype: "mdfile",
        content: "hello",
        name: "hello",
        title: "Hello",
        data: {},
      } as any
      const props = KNode.extractProps(node)
      expect(props.id).toBeUndefined()
      expect(props.parent_id).toBeUndefined()
      expect(props.parent_idx).toBeUndefined()
      expect(props.created_at).toBeUndefined()
      expect(props.updated_at).toBeUndefined()
      expect(props.version).toBeUndefined()
      expect(props.block_id).toBeUndefined()
      expect(props.fs_path).toBeUndefined()
      expect(props.fs_ino).toBeUndefined()
      expect(props.fs_mtime).toBeUndefined()
      expect(props.fstype).toBeUndefined()
      expect(props.content).toBeUndefined()
      expect(props.name).toBeUndefined()
      expect(props.title).toBeUndefined()
      expect(props.data).toBeUndefined()
    })

    it("skips null/undefined values", () => {
      const node = {
        id: "n1",
        type: "p",
        parent_id: null,
        parent_idx: 0,
        item: undefined,
        data: {},
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
      } as any
      const props = KNode.extractProps(node)
      expect(props.item).toBeUndefined()
    })

    it("inherits custom/future fields automatically (denylist model)", () => {
      const node = {
        id: "n1",
        type: "p",
        item: {},
        parent_id: "p1",
        parent_idx: 0,
        data: {},
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
        // Future/custom field
        priority: "P2",
        assigned_to: "bob",
        due_at: "2026-03-31",
      } as any
      const props = KNode.extractProps(node)
      expect(props.priority).toBe("P2")
      expect(props.assigned_to).toBe("bob")
      expect(props.due_at).toBe("2026-03-31")
    })
  })

  describe("KNode.matches", () => {
    it("matches when all props equal", () => {
      const node = { type: "h", item: {}, name: "test" }
      expect(KNode.matches(node, { type: "h" })).toBe(true)
    })

    it("fails when any prop differs", () => {
      const node = { type: "h", item: {}, name: "test" }
      expect(KNode.matches(node, { type: "p" })).toBe(false)
    })

    it("matches empty props", () => {
      expect(KNode.matches({ type: "p" }, {})).toBe(true)
    })
  })
})
