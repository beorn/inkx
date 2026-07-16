/**
 * Defaults contract — `renderString()` static renderer.
 *
 * Static rendering must provide a genuinely headless Term. Components may
 * inspect Term capabilities, but doing so must never attach to the host
 * process's stdin/stdout or inherit its dimensions.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Text, renderString, useTerm } from "../../src/index.js"

function TermProbe() {
  const term = useTerm()
  const backend = term.input === undefined && term.output === undefined ? "headless" : "node"
  return <Text>{`${backend}:${term.cols}x${term.rows}`}</Text>
}

describe("contract: renderString headless Term", () => {
  test("contract: requested dimensions do not acquire host process I/O", async () => {
    const rendered = await renderString(<TermProbe />, { width: 47, height: 9, plain: true })

    expect(rendered).toBe("headless:47x9")
  })
})
