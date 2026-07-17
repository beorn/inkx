/**
 * Sterling inverse-family contract.
 *
 * Inverse chrome (status bars, modal bands) needs the same state vocabulary
 * as its consumers: a hover surface and deemphasized text that still belongs
 * to the inverse foreground channel. These tokens replace consumer-local
 * `mix()` expressions, so their sRGB derivation is part of the contract.
 */

import { mixSrgb, relativeLuminance } from "@silvery/color"
import { builtinPalettes } from "@silvery/theme/schemes"
import { sterling } from "@silvery/theme/sterling"
import { describe, expect, test } from "vitest"

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a) ?? 0
  const lb = relativeLuminance(b) ?? 0
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

describe("Sterling inverse-family tokens", () => {
  const schemes = Object.entries(builtinPalettes)

  test.each(schemes)("%s exposes canonical nested and flat aliases", (_name, scheme) => {
    const theme = sterling.deriveFromScheme(scheme)

    expect(theme.inverse.hover.bg).toBe(theme["bg-inverse-hover"])
    expect(theme.inverse.muted.fgOn).toBe(theme["fg-on-inverse-muted"])
  })

  test.each(schemes)("%s preserves the canonical sRGB inverse mixes", (_name, scheme) => {
    const theme = sterling.deriveFromScheme(scheme)

    expect(theme["bg-inverse-hover"]).toBe(
      mixSrgb(theme["bg-inverse"], theme["fg-on-inverse"], 0.1),
    )
    expect(theme["fg-on-inverse-muted"]).toBe(
      mixSrgb(theme["fg-on-inverse"], theme["bg-inverse"], 0.35),
    )
  })

  test.each(schemes)("%s keeps muted inverse text below the base emphasis", (_name, scheme) => {
    const theme = sterling.deriveFromScheme(scheme)
    const baseContrast = contrastRatio(theme["fg-on-inverse"], theme["bg-inverse"])
    const mutedContrast = contrastRatio(theme["fg-on-inverse-muted"], theme["bg-inverse"])

    expect(mutedContrast).toBeLessThan(baseContrast)
  })

  test("both inverse state tokens can be pinned by their canonical paths", () => {
    const theme = sterling.deriveFromScheme(builtinPalettes.nord!, {
      pins: {
        "inverse.hover.bg": "#123456",
        "fg-on-inverse-muted": "#abcdef",
      },
    })

    expect(theme.inverse.hover.bg).toBe("#123456")
    expect(theme["bg-inverse-hover"]).toBe("#123456")
    expect(theme.inverse.muted.fgOn).toBe("#abcdef")
    expect(theme["fg-on-inverse-muted"]).toBe("#abcdef")
  })
})
