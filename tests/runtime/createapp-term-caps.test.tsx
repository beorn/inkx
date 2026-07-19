import React, { useEffect } from "react"
import { describe, expect, test } from "vitest"
import { Text, type NotificationActivation, useTerm } from "../../src/index.js"
import { createTerminalProfile } from "@silvery/ansi"
import { createTermless } from "@silvery/test"
import { createApp } from "../../packages/ag-term/src/runtime/create-app"
import { run } from "../../packages/ag-term/src/runtime/run"

function makeWritable() {
  let output = ""
  return {
    writable: {
      write(data: string): void {
        output += data
      },
    },
    get output() {
      return output
    },
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

describe("createApp TermContext caps", () => {
  test("run() profile caps are visible through useTerm()", async () => {
    const sink = makeWritable()
    const seen: boolean[] = []
    const profile = createTerminalProfile({
      caps: {
        kittyGraphics: true,
        kittyKeyboard: true,
        colorLevel: "truecolor",
      },
    })

    function Probe(): React.ReactElement {
      const kittyGraphics = useTerm((term) => term.caps.kittyGraphics)
      useEffect(() => {
        seen.push(kittyGraphics)
      }, [kittyGraphics])
      return <Text>kitty:{kittyGraphics ? "yes" : "no"}</Text>
    }

    const handle = await run(<Probe />, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
      profile,
    })
    await settle()

    expect(seen.at(-1)).toBe(true)
    expect(sink.output).toContain("kitty:yes")

    handle.unmount()
  })

  test("useTerm().notify delegates to the runtime-owned Term writer", async () => {
    const sink = makeWritable()
    const deliveries: unknown[] = []
    const profile = createTerminalProfile({
      caps: { notifications: "osc777" },
    })

    function Probe(): React.ReactElement {
      const term = useTerm()
      useEffect(() => {
        deliveries.push(term.notify({ title: "Build", body: "Done" }))
      }, [term])
      return <Text>notified</Text>
    }

    const handle = await run(<Probe />, {
      writable: sink.writable,
      cols: 40,
      rows: 5,
      profile,
    })
    await settle()

    expect(deliveries).toContainEqual({ status: "emitted", protocol: "osc777" })
    expect(sink.output).toContain("\x1b]777;notify;Build;Done\x07")

    handle.unmount()
  })

  test("useTerm() keeps notification delivery and activation on the runtime Term", async () => {
    using term = createTermless({
      cols: 40,
      rows: 5,
      caps: { notifications: "osc99" },
    })
    const activations: NotificationActivation[] = []

    function Probe(): React.ReactElement {
      const target = useTerm()
      useEffect(() => {
        const unsubscribe = target.onNotificationActivation((event) => activations.push(event))
        target.notify({
          id: "build",
          body: "Done",
          actions: [{ id: "logs", label: "Open logs" }],
        })
        return unsubscribe
      }, [target])
      return <Text>notified</Text>
    }

    const app = createApp(() => () => ({}))
    const handle = await app.run(<Probe />, { cols: 40, rows: 5, term })
    await settle()
    ;(term as unknown as { sendInput(data: string): void }).sendInput("\x1b]99;i=build;1\x1b\\")
    await settle()

    expect(activations).toEqual([{ id: "build", kind: "action", actionId: "logs" }])

    handle.unmount()
  })

  test("useTerm().notify refuses when the runtime has no writable sink", async () => {
    const deliveries: unknown[] = []
    const profile = createTerminalProfile({
      caps: { notifications: "osc9" },
    })

    function Probe(): React.ReactElement {
      const term = useTerm()
      useEffect(() => {
        deliveries.push(term.notify({ body: "Done" }))
      }, [term])
      return <Text>notified</Text>
    }

    const handle = await run(<Probe />, {
      cols: 40,
      rows: 5,
      profile,
    })
    await settle()

    expect(deliveries).toContainEqual({ status: "unsupported", reason: "notifications" })

    handle.unmount()
  })
})
