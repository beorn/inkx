import { describe, it, expect } from "vitest"
import { KNode } from "../../src/interfaces/node.ts"

describe("KNode namespace", () => {
  describe("KNode.isOutline", () => {
    it("true for heading items", () => {
      expect(KNode.isOutline({ type: "h", item: true })).toBe(true)
    })

    it("false for non-heading items", () => {
      expect(KNode.isOutline({ type: "p", item: true })).toBe(false)
    })

    it("false for heading non-items", () => {
      expect(KNode.isOutline({ type: "h", item: false })).toBe(false)
      expect(KNode.isOutline({ type: "h" })).toBe(false)
    })
  })

  describe("KNode.isListItem", () => {
    it("true for non-heading items", () => {
      expect(KNode.isListItem({ type: "p", item: true })).toBe(true)
      expect(KNode.isListItem({ type: "code", item: true })).toBe(true)
    })

    it("false for heading items (those are outlines)", () => {
      expect(KNode.isListItem({ type: "h", item: true })).toBe(false)
    })

    it("false for non-items", () => {
      expect(KNode.isListItem({ type: "p" })).toBe(false)
    })
  })

  describe("KNode.isItem", () => {
    it("true when item is true", () => {
      expect(KNode.isItem({ type: "h", item: true })).toBe(true)
      expect(KNode.isItem({ type: "p", item: true })).toBe(true)
    })

    it("false when item is false or undefined", () => {
      expect(KNode.isItem({ type: "p", item: false })).toBe(false)
      expect(KNode.isItem({ type: "p" })).toBe(false)
    })
  })

  describe("KNode.isBlock", () => {
    it("true when not an item", () => {
      expect(KNode.isBlock({ type: "p" })).toBe(true)
      expect(KNode.isBlock({ type: "p", item: false })).toBe(true)
    })

    it("false when item is true", () => {
      expect(KNode.isBlock({ type: "p", item: true })).toBe(false)
    })
  })

  describe("KNode.isEmbed", () => {
    it("true when embed_source is set", () => {
      expect(KNode.isEmbed({ embed_source: "some-id" })).toBe(true)
    })

    it("false when embed_source is null or undefined", () => {
      expect(KNode.isEmbed({ embed_source: null })).toBe(false)
      expect(KNode.isEmbed({})).toBe(false)
    })
  })

  describe("KNode.isTask", () => {
    it("true with task_marker", () => {
      expect(KNode.isTask({ task_marker: "[ ]" })).toBe(true)
      expect(KNode.isTask({ task_marker: "[x]" })).toBe(true)
    })

    it("true with task_status", () => {
      expect(KNode.isTask({ task_status: "todo" })).toBe(true)
    })

    it("false without marker or status", () => {
      expect(KNode.isTask({})).toBe(false)
    })

    it("false with null marker and status", () => {
      expect(KNode.isTask({ task_marker: null, task_status: null })).toBe(false)
    })

    it("implicit task properties alone do NOT make a task", () => {
      // due_at, priority, etc. without marker/status → not a task
      // due_at/priority alone don't make a task — strict definition
      expect(KNode.isTask({})).toBe(false)
    })
  })

  describe("KNode.extractProps", () => {
    it("extracts type, item, task_marker (reset), task_status (reset), list_marker from task node", () => {
      const node = {
        id: "abc123",
        type: "p",
        item: true,
        parent_id: "parent1",
        parent_idx: 3,
        list_marker: "-",
        task_marker: "[x]",
        task_status: "done",
        content: "- [x] Buy milk",
        data: { assignee: "alice" },
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
      } as any
      const props = KNode.extractProps(node)
      expect(props.type).toBe("p")
      expect(props.item).toBe(true)
      expect(props.list_marker).toBe("-")
      // Task props reset to unchecked
      expect(props.task_marker).toBe("[ ]")
      expect(props.task_status).toBe("todo")
      // Data inherits
      expect(props.data).toEqual({ assignee: "alice" })
    })

    it("extracts type, item from section node but NOT fstype", () => {
      const node = {
        id: "sec1",
        type: "h",
        item: true,
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
      expect(props.item).toBe(true)
      // fstype is a system key — not inherited
      expect(props.fstype).toBeUndefined()
      // name, content are system keys
      expect(props.name).toBeUndefined()
      expect(props.content).toBeUndefined()
    })

    it("inherits data blob", () => {
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
      expect(props.data).toEqual({ custom: "value", nested: { x: 1 } })
    })

    it("excludes all system fields", () => {
      const node = {
        id: "n1",
        type: "p",
        item: true,
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
    })

    it("skips null/undefined values", () => {
      const node = {
        id: "n1",
        type: "p",
        parent_id: null,
        parent_idx: 0,
        task_marker: null,
        list_marker: undefined,
        data: {},
        created_at: 1000,
        updated_at: 2000,
        version: "v1",
      } as any
      const props = KNode.extractProps(node)
      expect(props.task_marker).toBeUndefined()
      expect(props.list_marker).toBeUndefined()
    })

    it("inherits custom/future fields automatically (denylist model)", () => {
      const node = {
        id: "n1",
        type: "p",
        item: true,
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
      const node = { type: "h", item: true, name: "test" }
      expect(KNode.matches(node, { type: "h", item: true })).toBe(true)
    })

    it("fails when any prop differs", () => {
      const node = { type: "h", item: true, name: "test" }
      expect(KNode.matches(node, { type: "p" })).toBe(false)
    })

    it("matches empty props", () => {
      expect(KNode.matches({ type: "p" }, {})).toBe(true)
    })
  })
})
