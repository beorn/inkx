/**
 * Island guest terminal artifacts — the one renderer-owned projection path.
 *
 * A cell guest may expose bounded terminal protocol packets anchored in its
 * local grid. The Island boundary translates that anchor through its committed
 * host rect and queues the packet through TerminalFrameArtifact; it never
 * writes stdout directly. Capability evidence reaches the guest only when the
 * outer terminal has confirmed support AND that queue consumer is attached.
 *
 * @tracking @si/island/19267-adoption
 * @consumer @si/app/22571-maddoc-doc-viewer-umbrella/vterm-pixel-passthrough
 */
import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Island } from "@silvery/ag-react"
import type {
  IslandArtifactCapabilities,
  IslandGuest,
  IslandOutputArtifact,
  IslandOutputArtifactOwner,
} from "@silvery/ag/island-types"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { run } from "../../packages/ag-term/src/runtime/run"
import "@termless/test/matchers"

const KITTY_PACKET = "\x1b_Gf=100,a=T;AAAA\x1b\\"

function artifactGuest() {
  const queue: IslandOutputArtifact[] = [
    {
      kind: "terminal-sequence",
      protocol: "kitty",
      sequence: KITTY_PACKET,
      row: 1,
      col: 2,
    },
  ]
  const listeners = new Set<() => void>()
  let capabilities: IslandArtifactCapabilities | undefined

  const artifacts: IslandOutputArtifactOwner = {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    drain() {
      return queue.splice(0)
    },
  }

  const guest: IslandGuest = {
    async init(ctx) {
      capabilities = ctx.artifactCapabilities
      const buffer = createCellBuffer(ctx.cols, ctx.rows)
      return {
        size: {
          cols: ctx.cols,
          rows: ctx.rows,
          subscribe: () => () => {},
          requestResize() {},
        },
        output: {
          buffer,
          cursor: null,
          cursorVisible: false,
          artifacts,
          subscribe: () => () => {},
          writeCells() {},
          invalidateAll() {},
        },
        dispose() {
          queue.length = 0
          listeners.clear()
        },
      }
    },
  }

  return {
    guest,
    get capabilities() {
      return capabilities
    },
  }
}

describe("Island terminal artifacts", () => {
  test("translates the guest anchor through the host rect and uses the frame queue", async () => {
    using term = createTermless({ cols: 30, rows: 8, caps: { kittyGraphics: true, sixel: false } })
    const fixture = artifactGuest()

    const handle = await run(
      <Box padding={1}>
        <Island guest={fixture.guest} cols={8} rows={3} />
      </Box>,
      term,
    )

    await expect(term.out).toContainOutput(KITTY_PACKET, { timeout: 500 })
    expect(fixture.capabilities).toEqual({
      terminalSequences: { kittyGraphics: true, sixel: false },
    })

    const chunks = term.out.getChunks()
    const artifactIndex = chunks.findIndex((chunk) => chunk.includes(KITTY_PACKET))
    expect(artifactIndex, "guest artifact is flushed by the renderer").toBeGreaterThan(0)
    expect(
      chunks
        .slice(0, artifactIndex)
        .some((chunk) => !chunk.includes(KITTY_PACKET) && chunk.includes(" ")),
      "cell frame paints before the guest artifact",
    ).toBe(true)
    expect(chunks[artifactIndex]).toContain("\x1b[3;4H" + KITTY_PACKET)
    expect(
      chunks.slice(artifactIndex + 1).some((chunk) => chunk.includes("\x1b[?25")),
      "managed cursor state is restored after the artifact",
    ).toBe(true)

    handle.unmount()
  })

  test("does not claim a protocol the authoritative outer profile did not confirm", async () => {
    using term = createTermless({ cols: 20, rows: 6, caps: { kittyGraphics: false, sixel: false } })
    const fixture = artifactGuest()
    const refused = vi.spyOn(console, "error").mockImplementation(() => {})

    const handle = await run(<Island guest={fixture.guest} cols={8} rows={3} />, term)
    await new Promise<void>((resolve) => setTimeout(resolve, 25))

    expect(fixture.capabilities).toEqual({
      terminalSequences: { kittyGraphics: false, sixel: false },
    })
    expect(term.out.getText()).not.toContain(KITTY_PACKET)
    expect(refused).toHaveBeenCalledWith(
      "[silvery] refused island kitty artifact: outer terminal capability unconfirmed",
    )

    handle.unmount()
    refused.mockRestore()
  })
})
