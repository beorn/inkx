/**
 * useSlice contract tests — the React binding for a withSlice handle.
 *
 * Exercised through the real silvery reconciler via @silvery/test's
 * createRenderer (not react-dom), matching how apps consume it. State changes
 * are dispatched through the shared app.dispatch and flushed with act().
 */

import React, { act } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "silvery"
import { createBaseApp } from "../src/runtime/base-app"
import { withSlice } from "../src/withSlice"
import { useSlice } from "../src/useSlice"

interface Counter {
  n: number
}

describe("useSlice", () => {
  test("renders slice state and re-renders when the slice changes", async () => {
    const machine = withSlice({
      name: "counter",
      initial: { n: 0 } as Counter,
      handlers: { inc: (s: Counter) => ({ n: s.n + 1 }) },
    })(createBaseApp())

    function CounterView() {
      const { n } = useSlice(machine.counter)
      return <Text>count:{n}</Text>
    }

    const render = createRenderer({ cols: 20, rows: 3, autoRender: true })
    const view = render(<CounterView />)
    expect(view.text).toContain("count:0")

    await act(async () => {
      machine.dispatch({ type: "inc" })
    })
    expect(view.text).toContain("count:1")

    await act(async () => {
      machine.dispatch({ type: "inc" })
    })
    expect(view.text).toContain("count:2")
  })

  test("does not re-render on a no-op (same-reference) dispatch", async () => {
    let renders = 0
    const machine = withSlice({
      name: "counter",
      initial: { n: 0 } as Counter,
      handlers: { touch: (s: Counter) => s },
    })(createBaseApp())

    function CounterView() {
      renders++
      const { n } = useSlice(machine.counter)
      return <Text>count:{n}</Text>
    }

    const render = createRenderer({ cols: 20, rows: 3, autoRender: true })
    render(<CounterView />)
    const initialRenders = renders

    await act(async () => {
      machine.dispatch({ type: "touch" })
    })
    // No notify fires on a no-op change → React schedules no work.
    expect(renders).toBe(initialRenders)
    expect(machine.counter.getState()).toEqual({ n: 0 })
  })
})
