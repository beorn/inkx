/**
 * SGR (Select Graphic Rendition) color code helpers.
 *
 * Shared by buffer.ts (styleToAnsiCodes) and output-phase.ts (styleTransition).
 * Emits the shortest possible SGR code string for a given color.
 */

/**
 * A color carrying optional palette provenance. `index` (0–255), when present,
 * is the origin 256-color slot — an identity-preserving color (the shape the
 * terminal-flow engine produces). Palette provenance is honored ahead of the
 * baked r/g/b so an indexed color re-emits as indexed SGR at the outer terminal.
 */
type IndexedRgb = { r: number; g: number; b: number; index?: number }

/**
 * Marker bit for the PACKED numeric truecolor form: `0x1000000 | r<<16 | g<<8 | b`.
 * ag-term's ANSI parser (unicode.ts) tracks inline truecolor SGR in this compact
 * form, and those numbers reach fg/bgColorCode via styleToAnsiCodes when wrapped
 * text re-emits carried styles (fixSgrAcrossWrappedLines).
 */
const PACKED_TRUECOLOR = 0x1000000

/** The palette slot for a color, or `undefined` for a genuine truecolor. */
function paletteSlot(color: number | IndexedRgb): number | undefined {
  const idx = typeof color === "number" ? color : color.index
  return typeof idx === "number" && idx >= 0 && idx <= 255 ? idx : undefined
}

/** Resolve a non-palette color to truecolor components, unpacking the packed numeric form. */
function truecolorRgb(color: number | IndexedRgb): { r: number; g: number; b: number } {
  if (typeof color === "number") {
    if (color >= PACKED_TRUECOLOR && color <= 0x1ffffff) {
      return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff }
    }
    // Fail loud: such a number was never a valid color. Pre-D3 code emitted
    // garbage indexed SGR (`38;5;<huge>`) for it; reading `.r` off a number
    // leaks literal `undefined` into the byte stream. Neither is acceptable.
    throw new Error(
      `sgr-codes: number ${color} is neither a palette slot (0-255) nor a packed truecolor (0x1000000|rgb)`,
    )
  }
  return color
}

/**
 * Emit the shortest SGR code string for a foreground color.
 * - Basic 0-7: 4-bit code (30+N)
 * - Extended 8-255: 256-color (38;5;N)
 * - RGB (no palette index): true color (38;2;R;G;B)
 */
export function fgColorCode(color: number | IndexedRgb): string {
  const slot = paletteSlot(color)
  if (slot !== undefined) {
    if (slot <= 7) return `${30 + slot}`
    return `38;5;${slot}`
  }
  const { r, g, b } = truecolorRgb(color)
  return `38;2;${r};${g};${b}`
}

/**
 * Emit the shortest SGR code string for a background color.
 * - Basic 0-7: 4-bit code (40+N)
 * - Extended 8-255: 256-color (48;5;N)
 * - RGB (no palette index): true color (48;2;R;G;B)
 */
export function bgColorCode(color: number | IndexedRgb): string {
  const slot = paletteSlot(color)
  if (slot !== undefined) {
    if (slot <= 7) return `${40 + slot}`
    return `48;5;${slot}`
  }
  const { r, g, b } = truecolorRgb(color)
  return `48;2;${r};${g};${b}`
}
