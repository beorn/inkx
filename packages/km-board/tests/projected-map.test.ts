/**
 * ProjectedMap tests — reusable projected signal map utility.
 */

import { describe, test, expect } from "vitest"
import { createProjectedMap } from "../src/projected-map.ts"

interface Person {
  name: string
  age: number
  active: boolean
}

const FIELDS = ["name", "age", "active"] as const

describe("createProjectedMap", () => {
  test("track creates signal bag with initial values", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    const bag = map.track("alice", { name: "Alice", age: 30, active: true })

    expect(bag.name()).toBe("Alice")
    expect(bag.age()).toBe(30)
    expect(bag.active()).toBe(true)
    expect(map.size).toBe(1)
  })

  test("track is idempotent — returns same bag for same key", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    const bag1 = map.track("alice", { name: "Alice", age: 30, active: true })
    const bag2 = map.track("alice", { name: "Different", age: 99, active: false })

    expect(bag1).toBe(bag2) // same object
    expect(bag1.name()).toBe("Alice") // original values preserved
  })

  test("get returns undefined for untracked keys", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    expect(map.get("nobody")).toBeUndefined()
  })

  test("get returns bag for tracked keys", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    map.track("alice", { name: "Alice", age: 30, active: true })
    const bag = map.get("alice")

    expect(bag).toBeDefined()
    expect(bag!.name()).toBe("Alice")
  })

  test("sync updates only changed fields", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    map.track("alice", { name: "Alice", age: 30, active: true })

    map.sync((key) => {
      if (key === "alice") return { name: "Alice", age: 31, active: true }
      return undefined
    })

    const bag = map.get("alice")!
    expect(bag.name()).toBe("Alice") // unchanged
    expect(bag.age()).toBe(31) // updated
    expect(bag.active()).toBe(true) // unchanged
  })

  test("sync prunes keys where getValue returns undefined", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    map.track("alice", { name: "Alice", age: 30, active: true })
    map.track("bob", { name: "Bob", age: 25, active: false })
    expect(map.size).toBe(2)

    map.sync((key) => {
      if (key === "alice") return { name: "Alice", age: 30, active: true }
      return undefined // bob disappears
    })

    expect(map.size).toBe(1)
    expect(map.get("bob")).toBeUndefined()
    expect(map.get("alice")).toBeDefined()
  })

  test("sync with no changes is a no-op", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    const bag = map.track("alice", { name: "Alice", age: 30, active: true })

    // Read current values before sync
    const nameBefore = bag.name()
    const ageBefore = bag.age()

    map.sync(() => ({ name: "Alice", age: 30, active: true }))

    // Same values — signals should not have been written
    expect(bag.name()).toBe(nameBefore)
    expect(bag.age()).toBe(ageBefore)
  })

  test("sync updates multiple keys", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    map.track("alice", { name: "Alice", age: 30, active: true })
    map.track("bob", { name: "Bob", age: 25, active: false })

    map.sync((key) => {
      if (key === "alice") return { name: "Alice", age: 31, active: true }
      if (key === "bob") return { name: "Bobby", age: 25, active: true }
      return undefined
    })

    expect(map.get("alice")!.age()).toBe(31)
    expect(map.get("bob")!.name()).toBe("Bobby")
    expect(map.get("bob")!.active()).toBe(true)
  })

  test("keys() iterates tracked keys", () => {
    const map = createProjectedMap<string, Person>([...FIELDS])
    map.track("alice", { name: "Alice", age: 30, active: true })
    map.track("bob", { name: "Bob", age: 25, active: false })

    const keys = [...map.keys()]
    expect(keys).toContain("alice")
    expect(keys).toContain("bob")
    expect(keys).toHaveLength(2)
  })

  test("works with non-string keys", () => {
    const map = createProjectedMap<number, { value: string }>(["value"])
    map.track(1, { value: "one" })
    map.track(2, { value: "two" })

    expect(map.get(1)!.value()).toBe("one")
    expect(map.get(2)!.value()).toBe("two")

    map.sync((key) => {
      if (key === 1) return { value: "ONE" }
      return undefined
    })

    expect(map.get(1)!.value()).toBe("ONE")
    expect(map.get(2)).toBeUndefined() // pruned
  })

  test("reference equality check — arrays compared by reference", () => {
    const map = createProjectedMap<string, { items: readonly string[] }>(["items"])
    const items = ["a", "b", "c"] as const
    map.track("list", { items })

    // Same reference — no update
    map.sync(() => ({ items }))
    expect(map.get("list")!.items()).toBe(items)

    // New array with same content — reference changed, signal updates
    const newItems = ["a", "b", "c"]
    map.sync(() => ({ items: newItems }))
    expect(map.get("list")!.items()).toBe(newItems)
  })
})
