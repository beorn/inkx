/**
 * Image protocol detection gates on the SUPPLIED caps (the render term's caps),
 * not ambient process.stdout. km bead 19668: the welcome-bitmap escape-flood
 * came from `detectProtocol` consulting ambient `isKittyGraphicsSupported()`
 * (which reads the developer's `process.stdout` / `TERM_PROGRAM`) instead of the
 * caps of the terminal it is actually painting into. A non-kitty render term
 * must never be told a graphics protocol is available.
 *
 * l0: pure decision function, no React/IO. (The end-to-end proof — a no-kitty
 * Term emitting no APC bytes — additionally needs the run()/probeTerminalProfile
 * caps-resolution fix so the caller's caps survive to the consumer; that is the
 * separate, higher-blast-radius slice. This test pins the consumer logic the
 * resolution fix relies on.)
 */

import { describe, expect, test } from "vitest"
import { detectProtocol } from "../../packages/ag-react/src/ui/image/Image"

const NO_GFX = { kittyGraphics: false, sixel: false } as const
const KITTY = { kittyGraphics: true, sixel: false } as const
const SIXEL = { kittyGraphics: false, sixel: true } as const
const BOTH = { kittyGraphics: true, sixel: true } as const

describe("detectProtocol gates on the supplied (render-term) caps", () => {
  test("preferred=kitty honors the caps, not ambient", () => {
    expect(detectProtocol("kitty", NO_GFX)).toBeNull()
    expect(detectProtocol("kitty", KITTY)).toBe("kitty")
    // A sixel-only term must NOT be handed kitty just because it was preferred.
    expect(detectProtocol("kitty", SIXEL)).toBeNull()
  })

  test("preferred=sixel honors the caps", () => {
    expect(detectProtocol("sixel", NO_GFX)).toBeNull()
    expect(detectProtocol("sixel", SIXEL)).toBe("sixel")
    expect(detectProtocol("sixel", KITTY)).toBeNull()
  })

  test("auto prefers kitty, falls back to sixel, else null", () => {
    expect(detectProtocol("auto", NO_GFX)).toBeNull()
    expect(detectProtocol("auto", KITTY)).toBe("kitty")
    expect(detectProtocol("auto", SIXEL)).toBe("sixel")
    expect(detectProtocol("auto", BOTH)).toBe("kitty")
  })

  test("a no-graphics term never yields a protocol for any preference", () => {
    for (const pref of ["kitty", "sixel", "auto"] as const) {
      expect(detectProtocol(pref, NO_GFX)).toBeNull()
    }
  })
})
