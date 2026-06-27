import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Text } from "@silvery/ag-react"
import {
  useVirtualizer,
  type VirtualizerResult,
} from "../../packages/ag-react/src/hooks/useVirtualizer"

describe("useVirtualizer", () => {
  test("can defer measurement version updates while still recording heights", () => {
    const controls: {
      measure?: (key: string | number, height: number, width?: number) => boolean
      measured?: ReadonlyMap<string, number>
    } = {}

    function Harness({ defer }: { defer: boolean }) {
      const virtualizer = useVirtualizer({
        count: 20,
        estimateHeight: 1,
        viewportHeight: 6,
        getItemKey: (index) => `row-${index}`,
        deferMeasurementUpdates: defer,
      })
      controls.measure = virtualizer.measureItem
      controls.measured = virtualizer.measuredHeights
      return <Text>version:{virtualizer.measurementVersion}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(<Harness defer />)
    expect(stripAnsi(app.text)).toContain("version:0")

    expect(controls.measure?.("row-0", 3, 40)).toBe(true)
    expect(controls.measured?.get("row-0:40")).toBe(3)

    render(<Harness defer />)
    expect(stripAnsi(app.text)).toContain("version:0")

    render(<Harness defer={false} />)
    expect(stripAnsi(app.text)).toContain("version:1")
  })

  test("measured spacer heights include boundary gaps owned by spacer boxes", () => {
    let latest!: VirtualizerResult
    let measure!: VirtualizerResult["measureItem"]

    function Harness() {
      const virtualizer = useVirtualizer({
        count: 30,
        estimateHeight: 1,
        viewportHeight: 4,
        scrollTo: 10,
        overscan: 0,
        maxRendered: 20,
        gap: 2,
        getItemKey: (index) => `row-${index}`,
      })
      latest = virtualizer
      measure = virtualizer.measureItem
      return (
        <Text>
          lead:{virtualizer.leadingHeight} trail:{virtualizer.trailingHeight}
        </Text>
      )
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(<Harness />)
    expect(latest.range).toEqual({ startIndex: 10, endIndex: 12 })

    expect(measure("row-0", 3)).toBe(true)
    app.rerender(<Harness />)

    expect(latest.measurementVersion).toBe(1)
    expect(latest.range).toEqual({ startIndex: 10, endIndex: 11 })
    expect(latest.leadingHeight).toBe(50)
    expect(latest.trailingHeight).toBe(95)
  })

  test("tiny-list fast path respects maxRendered", () => {
    let latest!: VirtualizerResult

    function Harness() {
      const virtualizer = useVirtualizer({
        count: 20,
        estimateHeight: 1,
        viewportHeight: 100,
        overscan: 5,
        maxRendered: 8,
        getItemKey: (index) => `row-${index}`,
      })
      latest = virtualizer
      return (
        <Text>
          range:{virtualizer.range.startIndex}-{virtualizer.range.endIndex}
        </Text>
      )
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const app = render(<Harness />)

    expect(stripAnsi(app.text)).toContain("range:0-8")
    expect(latest.range).toEqual({ startIndex: 0, endIndex: 8 })
  })
})
