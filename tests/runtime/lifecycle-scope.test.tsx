/**
 * Runtime integration — `@silvery/scope` wired into createApp/run.
 *
 * Bead: km-silvery.lifecycle-scope (Phase 1).
 *
 * The scope hooks themselves are unit-tested against a synthetic parent in
 * `packages/ag-react/tests/use-scope.test.tsx`. This file exercises the
 * runtime wiring: `createApp()`/`run()` constructs a root scope, wraps the
 * React tree with a `<ScopeProvider>` carrying both `ScopeContext` and
 * `AppScopeContext`, exposes it as `handle.scope`, and disposes it after
 * React unmount during `cleanup()`.
 *
 * Coverage:
 *
 *   1. `handle.scope` is the same value `useScope()` / `useAppScope()`
 *      observe inside the React tree.
 *   2. The root scope is *not* disposed while the app is running.
 *   3. Unmount disposes the root scope (LIFO over `defer` registrations).
 *   4. `useScopeEffect` inside a component disposes its child scope on
 *      app unmount — proving fiber-attached scopes cascade through the
 *      handle's root.
 *   5. Component-mid-flight unmount (the doomed-subtree case) disposes
 *      the child scope without affecting the handle's root.
 */

import React, { useState } from "react"
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { createApp } from "../../packages/ag-term/src/runtime/create-app"
import { run } from "../../packages/ag-term/src/runtime/run"
import { type Scope, setDisposeErrorSink, type DisposeErrorContext } from "@silvery/scope"
import { useScope, useAppScope, useScopeEffect } from "@silvery/ag-react/hooks"

const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms))
const silveryRoot = resolve(import.meta.dirname, "../..")

// ----------------------------------------------------------------------------
// Test 1 — `handle.scope` is the React tree's scope
// ----------------------------------------------------------------------------

describe("createApp/run wires @silvery/scope as the app root scope", () => {
  test("handle.scope === useScope() === useAppScope() inside the tree", async () => {
    let observedCurrent: Scope | undefined
    let observedRoot: Scope | undefined

    function Probe(): React.ReactElement {
      observedCurrent = useScope()
      observedRoot = useAppScope()
      return <Text>probe</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<Probe />, term)
    await settle()

    expect(observedCurrent).toBeDefined()
    expect(observedRoot).toBeDefined()
    // Three identities collapse to one: the root scope.
    expect(observedCurrent).toBe(handle.scope)
    expect(observedRoot).toBe(handle.scope)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()
  })

  // --------------------------------------------------------------------------
  // Test 2 — root is alive while the app is running
  // --------------------------------------------------------------------------

  test("root scope stays alive across renders (not disposed until unmount)", async () => {
    function App({ tick }: { tick: number }): React.ReactElement {
      return <Text>tick {tick}</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<App tick={0} />, term)
    await settle()

    expect(handle.scope.disposed).toBe(false)

    // A few re-renders shouldn't touch the root.
    await handle.press("space")
    await settle()
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()
  })

  // --------------------------------------------------------------------------
  // Test 3 — unmount disposes the root scope, runs deferred cleanup LIFO
  // --------------------------------------------------------------------------

  test("unmount disposes the root scope and fires `defer` callbacks LIFO", async () => {
    const order: string[] = []
    let captured: Scope | undefined

    function App(): React.ReactElement {
      const root = useAppScope()
      captured = root
      // Render-phase rule: do NOT register from the body. Use an effect
      // (StrictMode-safe). We use a one-shot ref-style guard via state to
      // ensure registration runs once for the test, since createTermless
      // runs without StrictMode anyway. useScopeEffect is the canonical
      // form for this — we use the lower-level useEffect-into-root pattern
      // here because the test wants registrations on the *root* scope, not
      // a fresh child. See the lifecycle-scope.md design doc for guidance.
      const [registered] = useState(() => {
        // Defer until next microtask to keep the body pure — this still
        // runs before the next render commit since useState's initializer
        // fires once and we resolve the queue before the test reads.
        // (Inside React, this is fine because the effect of registering on
        // a *root scope* is observed only by the test, not by render.)
        queueMicrotask(() => {
          root.defer(() => {
            order.push("first-registered")
          })
          root.defer(() => {
            order.push("second-registered")
          })
        })
        return true
      })
      void registered
      return <Text>app</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<App />, term)
    await settle()

    expect(captured).toBe(handle.scope)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()

    expect(handle.scope.disposed).toBe(true)
    // LIFO: second-registered ran first.
    expect(order).toEqual(["second-registered", "first-registered"])
  })

  // --------------------------------------------------------------------------
  // Test 4 — useScopeEffect child scope cascades through handle.scope
  // --------------------------------------------------------------------------

  test("useScopeEffect-owned child scope is disposed when the app unmounts", async () => {
    let child: Scope | undefined
    const events: string[] = []

    function Owner(): React.ReactElement {
      useScopeEffect((scope) => {
        child = scope
        scope.defer(() => {
          events.push("child-defer")
        })
      }, [])
      return <Text>owner</Text>
    }

    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(
      <Box>
        <Owner />
      </Box>,
      term,
    )
    await settle()

    expect(child).toBeDefined()
    expect(child!.disposed).toBe(false)
    expect(handle.scope.disposed).toBe(false)

    handle.unmount()
    await settle()

    expect(child!.disposed).toBe(true)
    expect(handle.scope.disposed).toBe(true)
    expect(events).toEqual(["child-defer"])
  })

  // --------------------------------------------------------------------------
  // Test 5 — disposing handle.scope directly does not break cleanup()
  // --------------------------------------------------------------------------
  //
  // The runtime treats `appScope[Symbol.asyncDispose]()` as idempotent
  // (inherited from `AsyncDisposableStack`). If a caller disposes the
  // handle's scope explicitly (e.g. in a test), a follow-up `unmount()`
  // must still run cleanup() without throwing.

  test("manual scope dispose is idempotent — unmount stays clean", async () => {
    const captured: { error: unknown; ctx: DisposeErrorContext }[] = []
    setDisposeErrorSink((error, ctx) => captured.push({ error, ctx }))
    try {
      using term = createTermless({ cols: 20, rows: 2 })
      const handle = await run(<Text>hello</Text>, term)
      await settle()

      await handle.scope[Symbol.asyncDispose]()
      expect(handle.scope.disposed).toBe(true)

      // Unmount after manual dispose: should NOT throw, and SHOULD NOT
      // re-fire any disposers (already drained). The only possible report
      // is from the `app-exit` re-dispose path, which is a no-op.
      expect(() => handle.unmount()).not.toThrow()
      await settle()

      // No error reports — idempotent dispose plus a clean unmount path.
      expect(captured).toEqual([])
    } finally {
      setDisposeErrorSink(() => {})
    }
  })

  test("pre-handle failures roll back process listeners and the root scope", () => {
    const source = String.raw`
      import React from "react"
      import { createApp } from "./packages/ag-term/src/runtime/create-app.tsx"
      import { getTraceSnapshot } from "./packages/scope/src/index.ts"

      const before = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
      }
      let message = ""
      try {
        await createApp(() => () => {
          throw new Error("factory-boom-live")
        }).run(React.createElement(React.Fragment), {
          stdout: process.stdout,
          stdin: process.stdin,
        })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      const after = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
      }

      const handoffBefore = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
        uncaught: process.listenerCount("uncaughtException"),
        unhandled: process.listenerCount("unhandledRejection"),
      }
      const originalOn = process.on
      let handoffError: unknown
      process.on = function (event, listener) {
        const result = originalOn.call(this, event, listener)
        if (event === "uncaughtException") throw new Error("process-on-boom")
        return result
      }
      try {
        await createApp(() => () => ({})).run(React.createElement(React.Fragment), {
          stdout: process.stdout,
          stdin: process.stdin,
        })
      } catch (error) {
        handoffError = error
      } finally {
        process.on = originalOn
      }
      const handoffAfter = {
        resize: process.stdout.listenerCount("resize"),
        sigint: process.listenerCount("SIGINT"),
        sigterm: process.listenerCount("SIGTERM"),
        uncaught: process.listenerCount("uncaughtException"),
        unhandled: process.listenerCount("unhandledRejection"),
      }
      console.log(JSON.stringify({
        factory: { message, before, after },
        handoff: {
          name: handoffError?.constructor?.name,
          message: handoffError instanceof Error ? handoffError.message : String(handoffError),
          before: handoffBefore,
          after: handoffAfter,
        },
        scopes: getTraceSnapshot().map(({ kind, name }) => ({ kind, name })),
      }))
    `
    const result = spawnSync("bun", ["-e", source], {
      cwd: silveryRoot,
      encoding: "utf8",
      env: { ...process.env, SILVERY_SCOPE_TRACE: "1" },
    })

    expect(result.status, result.stderr).toBe(0)
    const record = JSON.parse(
      result.stdout
        .trim()
        .split("\n")
        .findLast((line) => line.startsWith("{")) ?? "{}",
    ) as {
      factory?: {
        message?: string
        before?: Record<string, number>
        after?: Record<string, number>
      }
      handoff?: {
        name?: string
        message?: string
        before?: Record<string, number>
        after?: Record<string, number>
      }
      scopes?: Array<{ kind: string; name?: string }>
    }
    expect(record.factory?.message).toBe("factory-boom-live")
    expect(record.factory?.after).toEqual(record.factory?.before)
    expect(record.handoff?.name).toBe("Error")
    expect(record.handoff?.message).toBe("process-on-boom")
    expect(record.handoff?.after).toEqual(record.handoff?.before)
    expect(record.scopes).toEqual([])
  })

  test("startup rejection waits for root-scope async disposal", async () => {
    let registered = false
    let disposalStarted = false
    let disposalFinished = false

    function AsyncOwner(): React.ReactElement {
      const scope = useAppScope()
      if (!registered) {
        registered = true
        scope.use({
          async [Symbol.asyncDispose]() {
            disposalStarted = true
            await settle(25)
            disposalFinished = true
          },
        })
      }
      return <Text>owned</Text>
    }

    let caught: unknown
    try {
      await createApp(() => () => ({})).run(<AsyncOwner />, {
        cols: 10,
        rows: 4,
        writable: {
          write() {
            throw new Error("paint-boom")
          },
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe("paint-boom")
    expect(disposalStarted).toBe(true)
    expect(disposalFinished).toBe(true)
  })

  test("startup rejection bounds a stuck root-scope async disposer", async () => {
    let registered = false
    let disposalStarted = false
    let releaseDisposal!: () => void
    const heldDisposal = new Promise<void>((resolve) => {
      releaseDisposal = resolve
    })
    const disposeErrors: unknown[] = []

    function StuckOwner(): React.ReactElement {
      const scope = useAppScope()
      if (!registered) {
        registered = true
        scope.use({
          async [Symbol.asyncDispose]() {
            disposalStarted = true
            await heldDisposal
          },
        })
      }
      return <Text>stuck</Text>
    }

    setDisposeErrorSink((error) => disposeErrors.push(error))
    const runPromise = Promise.resolve(
      createApp(() => () => ({})).run(<StuckOwner />, {
        cols: 10,
        rows: 4,
        writable: {
          write() {
            throw new Error("bounded-paint-boom")
          },
        },
      }),
    )
    const settled = runPromise.then(
      () => ({ kind: "resolved" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    )
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined

    try {
      const deadline = new Promise<{ kind: "timeout" }>((resolve) => {
        deadlineTimer = setTimeout(() => resolve({ kind: "timeout" }), 3_000)
      })
      const outcome = await Promise.race([settled, deadline])

      expect(disposalStarted).toBe(true)
      expect(outcome.kind).toBe("rejected")
      if (outcome.kind === "rejected") {
        expect(outcome.error).toBeInstanceOf(Error)
        expect((outcome.error as Error).message).toBe("bounded-paint-boom")
      }
      expect(disposeErrors).toHaveLength(1)
      expect(disposeErrors[0]).toBeInstanceOf(Error)
      expect((disposeErrors[0] as Error).message).toContain("did not settle within 1000ms")
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer)
      releaseDisposal()
      await settled
      setDisposeErrorSink(() => {})
    }
  })
})
