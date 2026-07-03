/**
 * @failure  `runStorybook`'s injectable `options.runtime` seam regresses —
 *   e.g. the custom mount function stops receiving the host element, or the
 *   `!options.runtime` guard is dropped so a custom-runtime caller's process
 *   gets force-exited via `process.exit(0)` out from under it — breaking any
 *   non-terminal (canvas/DOM/embedding) host that supplies its own runtime.
 *   Directly validates 20741's target-neutral runtime decoupling.
 * @level    l1
 * @consumer @si/scroll/15065-l4l5/15067-storybook-previewhost-scrollarea/20722-host-extraction/20740-functional-tests, 20741-target-decouple
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Text } from "@silvery/ag-react"
import { HotStorybookApp, runStorybook } from "../src/index.ts"
import type { Story, StorybookRuntime, StorybookRuntimeHandle } from "../src/index.ts"

/**
 * Minimal Story fixture. Never actually rendered — the fake runtime below
 * captures the mounted element instead of running it through a real render
 * pipeline, so this test stays at l1 (a single injected boundary) rather
 * than pulling in @silvery/test's l2 renderer.
 */
function fixtureStory(id: string, bodyMarker: string): Story {
  const [component, variant] = id.split("/") as [string, string]
  return {
    id,
    component,
    variant,
    description: "Fixture story for @silvery/storybook runtime-seam coverage.",
    render: () => <Text>{bodyMarker}</Text>,
  }
}

describe("runStorybook target-neutral runtime seam (20740, validates 20741)", () => {
  test("invokes the supplied runtime with the host element and awaits its handle before returning, skipping process.exit", async () => {
    const story = fixtureStory("Seam/story", "SEAM-BODY-MARKER")
    let receivedElement: React.ReactElement | undefined
    let exitResolved = false

    const fakeRuntime: StorybookRuntime = async (element) => {
      receivedElement = element
      const handle: StorybookRuntimeHandle = {
        waitUntilExit: () =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              exitResolved = true
              resolve()
            }, 5)
          }),
        unmount: () => {},
      }
      return handle
    }

    await runStorybook([story], { initialStoryId: story.id, runtime: fakeRuntime })

    // (a) the fake runtime was invoked with a real host element — specifically
    // the HotStorybookApp wrapper runStorybook always mounts, carrying the
    // requested initialStoryId through.
    expect(receivedElement).toBeDefined()
    expect(React.isValidElement(receivedElement)).toBe(true)
    expect(receivedElement?.type).toBe(HotStorybookApp)
    const receivedProps = receivedElement?.props as { initialStoryId?: string } | undefined
    expect(receivedProps?.initialStoryId).toBe(story.id)

    // (b) runStorybook truly AWAITED waitUntilExit rather than firing-and-
    // forgetting — if it had returned before the handle's promise settled,
    // this would still be false here.
    expect(exitResolved).toBe(true)

    // (c) control returned to the test at all. `runStorybook` force-exits the
    // process (`process.exit(0)`) only on the DEFAULT terminal-runtime path;
    // the custom-runtime path above must skip it (see the `runtime` option's
    // docstring on RunStorybookOptions). process.exit(0) terminates
    // synchronously with no unwind, so a real regression here would kill the
    // vitest worker mid-await — every assertion in this test executing and
    // passing IS the proof no exit happened.
  })

  test("a second runStorybook call with a custom runtime still returns control normally", async () => {
    const story = fixtureStory("Seam/again", "SEAM-AGAIN-MARKER")
    let invoked = false

    const fakeRuntime: StorybookRuntime = async () => {
      invoked = true
      return { waitUntilExit: async () => {}, unmount: () => {} }
    }

    await runStorybook([story], { initialStoryId: story.id, runtime: fakeRuntime })

    expect(invoked).toBe(true)
  })
})
