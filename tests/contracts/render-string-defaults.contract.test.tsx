/**
 * Defaults contract — `renderString()` static renderer.
 *
 * Static rendering must provide a genuinely headless Term. Components may
 * inspect Term capabilities, but doing so must never attach to the host
 * process's stdin/stdout or inherit its dimensions.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Text, render, renderString, renderSync, useTerm, type Term } from "../../src/index.js"
import { renderToString as renderInkToString } from "../../packages/ink/src/ink-render.js"

function TermProbe() {
  const term = useTerm()
  const backend = term.input === undefined && term.output === undefined ? "headless" : "node"
  return <Text>{`${backend}:${term.cols}x${term.rows}`}</Text>
}

function StyledTermProbe() {
  const term = useTerm()
  const styled = term.bold.red("styled")
  return <Text>{`${term.profile.colorLevel}:${styled.includes("\u001b[")}`}</Text>
}

function CleanupProbe({ onCleanup }: { onCleanup: () => void }) {
  React.useEffect(() => onCleanup, [onCleanup])
  return <Text>mounted</Text>
}

function CaptureTermProbe({ capture }: { capture: (term: Term) => void }) {
  const term = useTerm()
  capture(term)
  return <Text>captured</Text>
}

function createCaptureStdout(columns: number, rows: number) {
  const chunks: string[] = []
  const stdout = {
    columns,
    rows,
    isTTY: false,
    write(chunk: string | Uint8Array) {
      chunks.push(String(chunk))
      return true
    },
  } as unknown as NodeJS.WriteStream
  return { stdout, output: () => chunks.join("") }
}

describe("contract: renderString headless Term", () => {
  test("contract: requested dimensions do not acquire host process I/O", async () => {
    const rendered = await renderString(<TermProbe />, { width: 47, height: 9, plain: true })

    expect(rendered).toBe("headless:47x9")
  })

  test("contract: static render entrypoints share the headless default", async () => {
    const asyncCapture = createCaptureStdout(47, 9)
    using asyncInstance = await render(<TermProbe />, {
      stdout: asyncCapture.stdout,
      colors: false,
    })
    const syncCapture = createCaptureStdout(53, 11)
    using _syncInstance = renderSync(<TermProbe />, {
      stdout: syncCapture.stdout,
      colors: false,
    })

    expect(asyncCapture.output()).toBe("headless:47x9\n")
    expect(syncCapture.output()).toBe("headless:53x11\n")
    expect(() => asyncInstance.flush()).not.toThrow()
  })

  test("contract: a headless Term honors its advertised color level", async () => {
    const rendered = await renderString(<StyledTermProbe />, {
      width: 47,
      height: 9,
      plain: false,
    })

    expect(rendered).toBe("truecolor:true")
  })

  test("contract: the Ink-compatible static renderer stays headless", () => {
    expect(renderInkToString(<TermProbe />, { columns: 37 })).toBe("headless:37x24")
  })

  test("contract: render failures still unmount the static tree", async () => {
    let cleaned = false

    await expect(
      renderString(<CleanupProbe onCleanup={() => (cleaned = true)} />, {
        onContentHeight() {
          throw new Error("content-height failure")
        },
      }),
    ).rejects.toThrow("content-height failure")
    expect(cleaned).toBe(true)
  })

  test("contract: fluent static rendering releases its internally owned Term", async () => {
    let captured: Term | undefined

    await render(<CaptureTermProbe capture={(term) => (captured = term)} />).run()

    expect(captured?.signals.isDisposed).toBe(true)
  })
})
