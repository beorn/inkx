/**
 * Event System Tests
 */
import { describe, test, expect } from "vitest"
import { kmEvents, DisposableStore } from "../src/events.ts"

describe("kmEvents", () => {
  test("emit and subscribe to events", () => {
    const calls: string[] = []

    const unsub = kmEvents.on("parse-error", (e) => {
      calls.push(`parse-error: ${e.file}:${e.line}`)
    })

    kmEvents.emit("parse-error", { file: "test.md", line: 42, message: "bad" })
    kmEvents.emit("parse-error", { file: "foo.md", line: 10, message: "error" })

    expect(calls).toEqual(["parse-error: test.md:42", "parse-error: foo.md:10"])

    unsub()
  })

  test("unsubscribe stops receiving events", () => {
    const calls: number[] = []

    const unsub = kmEvents.on("repo-loaded", (e) => {
      calls.push(e.nodeCount)
    })

    kmEvents.emit("repo-loaded", { nodeCount: 100, duration: 50 })
    expect(calls).toEqual([100])

    unsub()

    kmEvents.emit("repo-loaded", { nodeCount: 200, duration: 60 })
    expect(calls).toEqual([100]) // Still 100, not updated
  })

  test("multiple subscribers receive same event", () => {
    const calls1: string[] = []
    const calls2: string[] = []

    const unsub1 = kmEvents.on("sync-error", (e) => {
      calls1.push(e.path)
    })

    const unsub2 = kmEvents.on("sync-error", (e) => {
      calls2.push(e.path)
    })

    kmEvents.emit("sync-error", { path: "/test", message: "error" })

    expect(calls1).toEqual(["/test"])
    expect(calls2).toEqual(["/test"])

    unsub1()
    unsub2()
  })

  test("subscription works as dispose method", () => {
    const calls: string[] = []

    const sub = kmEvents.on("validation-warning", (e) => {
      calls.push(e.nodeId)
    })

    kmEvents.emit("validation-warning", { nodeId: "node1", message: "warn" })
    expect(calls).toEqual(["node1"])

    // Dispose via .dispose() method
    sub.dispose()

    kmEvents.emit("validation-warning", { nodeId: "node2", message: "warn" })
    expect(calls).toEqual(["node1"]) // No update
  })

  test("subscription works with using keyword", () => {
    const calls: string[] = []

    {
      using sub = kmEvents.on("command-executed", (e) => {
        calls.push(e.id)
      })

      kmEvents.emit("command-executed", { id: "cmd1", duration: 10 })
      expect(calls).toEqual(["cmd1"])
    }

    // After scope exits, subscription is disposed
    kmEvents.emit("command-executed", { id: "cmd2", duration: 20 })
    expect(calls).toEqual(["cmd1"]) // No update
  })
})

describe("DisposableStore", () => {
  test("manages multiple subscriptions", () => {
    const calls: string[] = []
    const store = new DisposableStore()

    store.add(
      kmEvents.on("parse-error", (e) => {
        calls.push(`parse:${e.file}`)
      }),
    )

    store.add(
      kmEvents.on("sync-error", (e) => {
        calls.push(`sync:${e.path}`)
      }),
    )

    kmEvents.emit("parse-error", { file: "a.md", line: 1, message: "err" })
    kmEvents.emit("sync-error", { path: "/b", message: "err" })

    expect(calls).toEqual(["parse:a.md", "sync:/b"])

    // Dispose all at once
    store.dispose()

    kmEvents.emit("parse-error", { file: "c.md", line: 1, message: "err" })
    kmEvents.emit("sync-error", { path: "/d", message: "err" })

    expect(calls).toEqual(["parse:a.md", "sync:/b"]) // No updates
  })

  test("works with using keyword", () => {
    const calls: string[] = []

    {
      using store = new DisposableStore()
      store.add(
        kmEvents.on("file-parsed", (e) => {
          calls.push(`${e.taskCount}`)
        }),
      )

      kmEvents.emit("file-parsed", { taskCount: 5, duration: 10 })
      expect(calls).toEqual(["5"])
    }

    // After scope exits, store is disposed
    kmEvents.emit("file-parsed", { taskCount: 10, duration: 20 })
    expect(calls).toEqual(["5"]) // No update
  })
})
