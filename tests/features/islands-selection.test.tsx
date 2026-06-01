/**
 * <Island> text selection substrate.
 *
 * Islands are opaque guest-owned cell grids, but host text selection still owns
 * mouse drag, range clamping, highlighting, and OSC 52 copy. These tests keep
 * the selection behavior at the Silvery boundary rather than in a consumer like
 * silvermux.
 */

import React, { type ReactElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { Box, Island, ScopeProvider, Text } from "../../src/index.js"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { createRenderer, createTermless } from "@silvery/test"
import { createScope } from "@silvery/scope"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"
import { run } from "../../packages/ag-term/src/runtime/run"
import "@termless/test/matchers"
import type { IslandGuest, IslandHandle } from "@silvery/ag/island-types"

const TOKEN = "ISLANDSELECTTOKEN"

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
})

afterEach(() => {
  if (prevStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = prevStrict
  resetStrictCache()
})

function setStrict(value: string): void {
  process.env.SILVERY_STRICT = value
  resetStrictCache()
}

function tokenGuest(): IslandGuest {
  return {
    capabilities: { input: false },
    init(ctx) {
      const buffer = createCellBuffer(ctx.cols, ctx.rows)
      for (let row = 0; row < ctx.rows; row++) {
        for (let col = 0; col < TOKEN.length && col < ctx.cols; col++) {
          buffer.setCell(col, row, { ...buffer.getCell(col, row), char: TOKEN[col]! })
        }
      }
      const handle: IslandHandle = {
        size: {
          get cols() {
            return ctx.cols
          },
          get rows() {
            return ctx.rows
          },
          subscribe: () => () => {},
          requestResize: () => {},
        },
        output: {
          buffer,
          cursor: null,
          cursorVisible: false,
          subscribe: () => () => {},
          writeCells: () => {},
          invalidateAll: () => {},
        },
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
}

async function settle(ms = 80): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function makeTestScopeWrapper() {
  const scope = createScope("islands-selection-test")
  return (children: ReactNode): ReactElement => (
    <ScopeProvider scope={scope}>{children}</ScopeProvider>
  )
}

function RealisticIslandDocument({
  guest,
  userSelect,
}: {
  guest: IslandGuest
  userSelect?: "auto" | "none" | "text" | "contain"
}): ReactElement {
  return (
    <Box flexDirection="column" width={80} height={70}>
      {Array.from({ length: 28 }).map((_, index) => (
        <Text key={`before-${index}`}>before-{index}</Text>
      ))}
      <Box borderStyle="single" padding={0} width={42} height={5}>
        <Island guest={guest} cols={40} rows={3} height={3} userSelect={userSelect} />
      </Box>
      {Array.from({ length: 28 }).map((_, index) => (
        <Text key={`after-${index}`}>after-{index}</Text>
      ))}
    </Box>
  )
}

describe("Island text selection", () => {
  test("runtime drag over an island copies guest cell text under STRICT", async () => {
    setStrict("2,island-boundary-limits")
    using term = createTermless({ cols: 80, rows: 70 })
    const handle = await run(<RealisticIslandDocument guest={tokenGuest()} />, term, {
      selection: true,
      mouse: true,
    } as never)
    try {
      await settle()
      expect(term.screen).toContainText(TOKEN)
      term.clipboard.clear()

      await term.mouse.drag({ from: [1, 30], to: [1 + TOKEN.length, 30] })
      await settle()

      expect(term.clipboard.last).toContain(TOKEN)
    } finally {
      handle.unmount()
    }
  })

  test("runtime drag started in an island is clamped to the island rectangle", async () => {
    setStrict("2,island-boundary-limits")
    using term = createTermless({ cols: 80, rows: 70 })
    const handle = await run(<RealisticIslandDocument guest={tokenGuest()} />, term, {
      selection: true,
      mouse: true,
    } as never)
    try {
      await settle()
      term.clipboard.clear()

      await term.mouse.drag({ from: [1, 30], to: [60, 38] })
      await settle()

      expect(term.clipboard.last).toContain(TOKEN)
      expect(term.clipboard.last).not.toContain("after-")
    } finally {
      handle.unmount()
    }
  })

  test("render blit stamps selectable metadata on island guest cells", async () => {
    const render = createRenderer({ cols: 80, rows: 70 })
    const wrap = makeTestScopeWrapper()
    const guest = tokenGuest()
    const app = render(wrap(<RealisticIslandDocument guest={guest} />))
    await flushMicrotasks()
    app.rerender(wrap(<RealisticIslandDocument guest={guest} />))

    const island = app.locator("silvery-island").boundingBox()
    const buffer = app.lastBuffer()
    expect(island).toBeTruthy()
    expect(buffer).toBeTruthy()
    expect(buffer!.isCellSelectable(island!.x, island!.y)).toBe(true)
    expect(buffer!.isCellSelectable(island!.x + TOKEN.length - 1, island!.y)).toBe(true)
  })

  test("island userSelect can opt out of selectable metadata", async () => {
    const render = createRenderer({ cols: 80, rows: 70 })
    const wrap = makeTestScopeWrapper()
    const guest = tokenGuest()
    const app = render(wrap(<RealisticIslandDocument guest={guest} userSelect="none" />))
    await flushMicrotasks()
    app.rerender(wrap(<RealisticIslandDocument guest={guest} userSelect="none" />))

    const island = app.locator("silvery-island").boundingBox()
    const buffer = app.lastBuffer()
    expect(island).toBeTruthy()
    expect(buffer).toBeTruthy()
    expect(buffer!.isCellSelectable(island!.x, island!.y)).toBe(false)
  })
})
