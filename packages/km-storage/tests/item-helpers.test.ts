import { describe, expect, test } from "vitest"
import { decomposeItem, composeItem, decomposeChangeItem } from "../src/item-helpers.ts"

describe("decomposeItem", () => {
  test("undefined → all null, item=0", () => {
    expect(decomposeItem(undefined)).toEqual({
      item: 0,
      list_marker: null,
      task_marker: null,
      task_status: null,
    })
  })

  test("null → all null, item=0", () => {
    expect(decomposeItem(null)).toEqual({
      item: 0,
      list_marker: null,
      task_marker: null,
      task_status: null,
    })
  })

  test("list-only item", () => {
    expect(decomposeItem({ list: "-" })).toEqual({
      item: 1,
      list_marker: "-",
      task_marker: null,
      task_status: null,
    })
  })

  test("task item", () => {
    expect(decomposeItem({ list: "-", task: { marker: "[ ]", status: "todo" } })).toEqual({
      item: 1,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
    })
  })

  test("done task", () => {
    expect(decomposeItem({ list: "-", task: { marker: "[x]", status: "done" } })).toEqual({
      item: 1,
      list_marker: "-",
      task_marker: "[x]",
      task_status: "done",
    })
  })

  test("empty item (no list, no task)", () => {
    expect(decomposeItem({})).toEqual({
      item: 1,
      list_marker: null,
      task_marker: null,
      task_status: null,
    })
  })
})

describe("decomposeItem used for updates (Object.assign pattern)", () => {
  test("null item → clear all fields", () => {
    const augmented: Record<string, unknown> = { content: "test" }
    Object.assign(augmented, decomposeItem(null))
    expect(augmented).toEqual({
      content: "test",
      item: 0,
      list_marker: null,
      task_marker: null,
      task_status: null,
    })
  })

  test("item with task → flat fields merged", () => {
    const augmented: Record<string, unknown> = {}
    Object.assign(augmented, decomposeItem({ list: "*", task: { marker: "[/]", status: "wip" } }))
    expect(augmented).toEqual({
      item: 1,
      list_marker: "*",
      task_marker: "[/]",
      task_status: "wip",
    })
  })
})

describe("composeItem", () => {
  test("item=0 → undefined", () => {
    expect(composeItem(0, null, null, null)).toBeUndefined()
  })

  test("item=false → undefined", () => {
    expect(composeItem(false, null, null, null)).toBeUndefined()
  })

  test("item=1, list only", () => {
    expect(composeItem(1, "-", null, null)).toEqual({ list: "-" })
  })

  test("item=1, full task", () => {
    expect(composeItem(1, "-", "[ ]", "todo")).toEqual({
      list: "-",
      task: { marker: "[ ]", status: "todo" },
    })
  })

  test("item=1, task without list", () => {
    expect(composeItem(1, null, "[x]", "done")).toEqual({
      task: { marker: "[x]", status: "done" },
    })
  })

  test("item=1, task with null status defaults to todo", () => {
    expect(composeItem(1, null, "[ ]", null)).toEqual({
      task: { marker: "[ ]", status: "todo" },
    })
  })

  test("item=1, no list, no task → empty object", () => {
    expect(composeItem(1, null, null, null)).toEqual({})
  })
})

describe("decomposeChangeItem", () => {
  test("new format: nested item object", () => {
    const data = {
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    }
    expect(decomposeChangeItem(data)).toEqual({
      listMarker: "-",
      taskMarker: "[ ]",
      taskStatus: "todo",
    })
  })

  test("legacy format: flat fields", () => {
    const data = {
      list_marker: "*",
      task_marker: "[x]",
      task_status: "done",
    }
    expect(decomposeChangeItem(data)).toEqual({
      listMarker: "*",
      taskMarker: "[x]",
      taskStatus: "done",
    })
  })

  test("flat fields take precedence over nested", () => {
    const data = {
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      list_marker: "*",
      task_marker: "[x]",
      task_status: "done",
    }
    expect(decomposeChangeItem(data)).toEqual({
      listMarker: "*",
      taskMarker: "[x]",
      taskStatus: "done",
    })
  })

  test("no item data → all null", () => {
    expect(decomposeChangeItem({})).toEqual({
      listMarker: null,
      taskMarker: null,
      taskStatus: null,
    })
  })
})

describe("roundtrip: decomposeItem → composeItem", () => {
  test("list-only item roundtrips", () => {
    const original = { list: "-" }
    const flat = decomposeItem(original)
    const composed = composeItem(flat.item, flat.list_marker, flat.task_marker, flat.task_status)
    expect(composed).toEqual(original)
  })

  test("full task item roundtrips", () => {
    const original = { list: "-", task: { marker: "[ ]" as const, status: "todo" as const } }
    const flat = decomposeItem(original)
    const composed = composeItem(flat.item, flat.list_marker, flat.task_marker, flat.task_status)
    expect(composed).toEqual(original)
  })

  test("undefined roundtrips", () => {
    const flat = decomposeItem(undefined)
    const composed = composeItem(flat.item, flat.list_marker, flat.task_marker, flat.task_status)
    expect(composed).toBeUndefined()
  })
})
