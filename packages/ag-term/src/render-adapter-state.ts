/**
 * Browser-neutral render-adapter contract and singleton state.
 *
 * Terminal initialization deliberately lives in `render-adapter.ts`. Shared
 * render pipelines and non-terminal targets import this module so their
 * dependency graphs cannot reach the terminal fallback.
 */

// ============================================================================
// Text Measurement
// ============================================================================

export interface TextMeasureStyle {
  bold?: boolean
  italic?: boolean
  fontSize?: number
  fontFamily?: string
}

export interface TextMeasureResult {
  width: number
  height: number
}

export interface TextMeasurer {
  /** Measure text dimensions in adapter units. */
  measureText(text: string, style?: TextMeasureStyle): TextMeasureResult

  /** Get the line height for the given style. */
  getLineHeight(style?: TextMeasureStyle): number
}

// ============================================================================
// Render Buffer
// ============================================================================

export interface RenderStyle {
  /** Cross-target hyperlink carried by the rendered text cells. */
  hyperlink?: string
  fg?: string
  bg?: string
  attrs?: {
    bold?: boolean
    dim?: boolean
    italic?: boolean
    underline?: boolean
    underlineStyle?: "single" | "double" | "curly" | "dotted" | "dashed"
    underlineColor?: string
    /** Overline — SGR 53/55. Independent of underline. */
    overline?: boolean
    strikethrough?: boolean
    inverse?: boolean
  }
}

export interface RenderBuffer {
  readonly width: number
  readonly height: number

  /** Fill a rectangle with a style. */
  fillRect(x: number, y: number, width: number, height: number, style: RenderStyle): void

  /** Draw text at a position. */
  drawText(x: number, y: number, text: string, style: RenderStyle): void

  /** Draw a single character at a position. */
  drawChar(x: number, y: number, char: string, style: RenderStyle): void

  /** Check if coordinates are within bounds. */
  inBounds(x: number, y: number): boolean

  /**
   * Draw a filled rounded rectangle with optional border stroke.
   * Canvas-only — terminal adapters don't implement this.
   */
  fillRoundedRect?(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: string | undefined,
    stroke: string | undefined,
    lineWidth?: number,
  ): void
}

// ============================================================================
// Border Characters
// ============================================================================

export interface BorderChars {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
  /** Bottom horizontal character. When absent, falls back to `horizontal`. */
  bottomHorizontal?: string
  /** Right vertical character. When absent, falls back to `vertical`. */
  rightVertical?: string
}

// ============================================================================
// Render Adapter
// ============================================================================

export interface RenderAdapter {
  /** Adapter name for debugging. */
  name: string

  /** Text measurement for this adapter. */
  measurer: TextMeasurer

  /** Create a buffer for rendering. */
  createBuffer(width: number, height: number): RenderBuffer

  /**
   * Flush the buffer to the output. Terminal adapters return an ANSI diff;
   * direct-drawing adapters may return void.
   */
  flush(buffer: RenderBuffer, prevBuffer: RenderBuffer | null): string | void

  /** Get border characters for the given style. */
  getBorderChars(style: string): BorderChars
}

// ============================================================================
// Global Adapter Management
// ============================================================================

// The adapter defines the process render target and is set once at startup.
// Keep this singleton in the neutral module so every compatibility and target
// entry observes the same state without importing terminal initialization.
let currentAdapter: RenderAdapter | null = null

/** Set the current render adapter. */
export function setRenderAdapter(adapter: RenderAdapter): void {
  currentAdapter = adapter
}

/** Get the current render adapter, throwing when none has been installed. */
export function getRenderAdapter(): RenderAdapter {
  if (!currentAdapter) {
    throw new Error("No render adapter set. Call setRenderAdapter() first.")
  }
  return currentAdapter
}

/** Check whether a render adapter has been installed. */
export function hasRenderAdapter(): boolean {
  return currentAdapter !== null
}

/** Get the text measurer from the current adapter. */
export function getTextMeasurer(): TextMeasurer {
  return getRenderAdapter().measurer
}
