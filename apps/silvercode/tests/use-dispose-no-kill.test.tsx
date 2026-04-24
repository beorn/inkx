/**
 * Layer 3 — useDispose regression guard (bug ca794509).
 *
 * The bug
 * -------
 * silvercode's App.tsx wires `useDispose(() => controller.closeAll())` so
 * Ctrl+C / Ctrl+D / React unmount all funnel through one teardown step.
 * An early version of useDispose captured `dispose` directly in the
 * useEffect dependency array. Every render created a fresh arrow, which
 * triggered the effect's cleanup — which ran the PREVIOUS dispose
 * function synchronously. The subprocess died ~117ms after spawn, before
 * any user message could reach it.
 *
 * Fix: useDispose now holds `dispose` in a ref and keeps the effect
 * dependency list stable. See silvery/packages/ag-react/src/hooks/useDispose.ts.
 *
 * What this test asserts
 * ----------------------
 * Re-rendering a component that uses useDispose (i.e. a parent prop
 * change or a state update) must NOT invoke the dispose function. It
 * should only fire on unmount.
 *
 * We use ScriptedFakeSession's closeCount to observe: the closeAll path
 * on the controller triggers session.close(), so if useDispose regresses
 * we see closeCount climb above 0 during re-renders.
 */
import type { AgentSession } from "@km/agent-harness"
import React, { useRef, useState, useEffect } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useDispose } from "silvery"
import { createRenderer } from "@silvery/test"
import { createSilvercodeController, type Controller } from "../src/controller.ts"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"

/**
 * Minimal shape of the real App.tsx wrt useDispose: createController once
 * on mount, wire useDispose(closeAll), accept a prop that changes over time
 * to trigger re-renders.
 */
function DisposeHarness({
  label,
  spawnFactory,
  onController,
}: {
  label: string
  spawnFactory: () => AgentSession
  onController: (c: Controller) => void
}): React.ReactElement {
  const controllerRef = useRef<Controller | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      track: "claude",
      initialSessions: 0,
      spawnFactory,
    })
    onController(controllerRef.current)
  }
  const controller = controllerRef.current!

  // Spawn exactly one session on mount so closeAll() has something to close.
  useEffect(() => {
    void controller.spawnSession("harness")
  }, [controller])

  useDispose(() => {
    controller.closeAll()
  })

  return (
    <Box>
      <Text>{label}</Text>
    </Box>
  )
}

describe("layer 3: useDispose regression (ca794509)", () => {
  test("re-render with changed props does NOT invoke dispose", async () => {
    const fake: ScriptedFakeSession = createFakeSession()
    let capturedController: Controller | null = null
    const render = createRenderer({ cols: 40, rows: 5 })

    const app = render(
      <DisposeHarness
        label="initial"
        spawnFactory={() => fake}
        onController={(c) => {
          capturedController = c
        }}
      />,
    )
    expect(app.text).toContain("initial")
    // Session is spawned by the effect — wait a microtask.
    await Promise.resolve()
    expect(capturedController).not.toBeNull()
    expect(capturedController!.snapshot()).toHaveLength(1)
    // Baseline: dispose must not have fired during mount.
    expect(fake.closeCount).toBe(0)

    // Re-render with a new `label` prop. If useDispose regresses to
    // dependency-listing `dispose`, the effect cleanup runs here and
    // closeCount jumps.
    const app2 = render(
      <DisposeHarness
        label="updated"
        spawnFactory={() => fake}
        onController={(c) => {
          capturedController = c
        }}
      />,
    )
    expect(app2.text).toContain("updated")
    expect(fake.closeCount).toBe(0)

    // One more re-render just to be sure the guard holds across multiple
    // prop changes (React 19 can double-invoke effects in dev).
    const app3 = render(
      <DisposeHarness
        label="again"
        spawnFactory={() => fake}
        onController={(c) => {
          capturedController = c
        }}
      />,
    )
    expect(app3.text).toContain("again")
    expect(fake.closeCount).toBe(0)
  })

  test("unmount DOES invoke dispose exactly once", async () => {
    const fake: ScriptedFakeSession = createFakeSession()
    const render = createRenderer({ cols: 40, rows: 5 })

    const app = render(
      <DisposeHarness label="hello" spawnFactory={() => fake} onController={() => {}} />,
    )
    expect(app.text).toContain("hello")
    await Promise.resolve()

    // Render an empty tree to unmount DisposeHarness.
    render(<Box />)
    // dispose fires synchronously on unmount — closeCount is 1, not 0 or 2.
    expect(fake.closeCount).toBe(1)
  })

  test("state change inside component does NOT invoke dispose", async () => {
    const fake: ScriptedFakeSession = createFakeSession()

    function StatefulHarness(): React.ReactElement {
      const [n, setN] = useState(0)
      const controllerRef = useRef<Controller | null>(null)
      if (!controllerRef.current) {
        controllerRef.current = createSilvercodeController({
          cwd: "/tmp/fake",
          bare: true,
          track: "claude",
          initialSessions: 0,
          spawnFactory: () => fake,
        })
      }
      const controller = controllerRef.current!
      useEffect(() => {
        void controller.spawnSession("harness")
      }, [controller])
      useDispose(() => controller.closeAll())
      // Expose a way to re-render: triple state bump inside an effect.
      useEffect(() => {
        if (n < 3) setN((v) => v + 1)
      }, [n])
      return <Text>count={n}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<StatefulHarness />)
    // Several re-renders driven by the state bump.
    expect(app.text).toContain("count=3")
    expect(fake.closeCount).toBe(0)
  })
})
