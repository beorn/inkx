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

/** The palette slot for a color, or `undefined` for a genuine truecolor. */
function paletteSlot(color: number | IndexedRgb): number | undefined {
  const idx = typeof color === "number" ? color : color.index
  return typeof idx === "number" && idx >= 0 && idx <= 255 ? idx : undefined
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
  // Genuine truecolor: `color` is an object (a bare out-of-range number can't
  // reach here — paletteSlot accepts every 0–255 index).
  return `38;2;${(color as IndexedRgb).r};${(color as IndexedRgb).g};${(color as IndexedRgb).b}`
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
  return `48;2;${(color as IndexedRgb).r};${(color as IndexedRgb).g};${(color as IndexedRgb).b}`
}
