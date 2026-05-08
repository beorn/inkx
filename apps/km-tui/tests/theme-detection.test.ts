import { describe, expect, test } from "vitest"
import { detectKmTheme, editingBg, multiSelectedBg, selectedBg, terminalDefaultCanvasTheme } from "../src/theme.ts"
import { ansi16DarkTheme } from "@silvery/ag-react"
import { blend } from "@silvery/color"

const ESC = "\x1b"
const BEL = "\x07"

function fakeProbeInput(responses: Record<10 | 11, string | null>) {
  return {
    async probe<T>({
      query,
      parse,
    }: {
      query: string
      parse: (acc: string) => { result: T; consumed: number } | null
    }): Promise<T | null> {
      if (query.includes(`${ESC}]10;?${BEL}`)) {
        const response = responses[10]
        return response ? (parse(response)?.result ?? null) : null
      }
      if (query.includes(`${ESC}]11;?${BEL}`)) {
        const response = responses[11]
        return response ? (parse(response)?.result ?? null) : null
      }
      return null
    },
  }
}

describe("km theme detection", () => {
  test("pure fallback keeps the terminal default canvas background", () => {
    const theme = terminalDefaultCanvasTheme(ansi16DarkTheme)

    expect(theme.bg).toBe("")
    expect((theme as unknown as Record<string, string>)["bg-surface-default"]).toBe("")
  })

  test("uses probed foreground/background even when ANSI palette slots do not answer", async () => {
    const detected = await detectKmTheme({
      caps: { colorLevel: "truecolor", darkBackground: true },
      input: fakeProbeInput({
        10: `${ESC}]10;rgb:eeee/eeee/eeee${BEL}`,
        11: `${ESC}]11;rgb:2323/2424/2828${BEL}`,
      }),
    })

    expect(detected.source).toBe("probed")
    expect(detected.probed).toEqual({ fg: true, bg: true, ansiCount: 0 })
    expect(detected.theme.fg).toBe("#eeeeee")
    expect(detected.theme.bg).toBe("")
    expect((detected.theme as unknown as Record<string, string>)["bg-surface-default"]).toBe("")
    expect((detected.theme as unknown as Record<string, string>)["km-canvas-bg"]).toBeUndefined()
    expect((detected.theme as unknown as Record<string, string>)["bg-selected"]).toBe(blend("#232428", "#eeeeee", 0.16))
  })

  test("partial probes without OSC background keep the terminal default canvas", async () => {
    const detected = await detectKmTheme({
      caps: { colorLevel: "truecolor", darkBackground: true },
      input: fakeProbeInput({
        10: `${ESC}]10;rgb:eeee/eeee/eeee${BEL}`,
        11: null,
      }),
    })

    expect(detected.source).toBe("probed")
    expect(detected.probed).toEqual({ fg: true, bg: false, ansiCount: 0 })
    expect(detected.theme.fg).toBe("#eeeeee")
    expect(detected.theme.bg).toBe("")
    expect((detected.theme as unknown as Record<string, string>)["bg-surface-default"]).toBe("")
  })

  test("terminal-default canvas selection helpers use Sterling tokens", () => {
    const theme = terminalDefaultCanvasTheme({
      ...ansi16DarkTheme,
      bg: "#101010",
      "bg-surface-default": "#101010",
      "bg-selected": "#333333",
      "bg-selected-hover": "#2a2a2a",
      "bg-surface-hover": "#242424",
      primary: "#88aaff",
    } as never)

    expect(selectedBg(theme)).toBe("#2a2a2a")
    expect(multiSelectedBg(theme)).toBe("#333333")
    expect(editingBg(theme)).toBe("#242424")
  })
})
