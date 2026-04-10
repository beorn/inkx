/**
 * Test Colors (TC) — semantic token names → resolved RGB values.
 *
 * Maps silvery theme tokens from `ansi16DarkTheme` (the default test theme)
 * to their resolved truecolor RGB values. These match what createTestApp's
 * headless driver returns in cell.fg/cell.bg.
 *
 * Source of truth: vendor/silvery/packages/theme/src/palettes/index.ts (ansi16DarkTheme)
 *                  Verified via createTestApp headless driver probe (2026-04-10)
 *
 * @example
 * ```ts
 * import { TC } from "./helpers/theme.ts"
 *
 * expect(cell.bg).toEqual(TC["$selection-bg"]) // { r: 128, g: 128, b: 0 }
 * expect(cell.fg).toEqual(TC.$selection)       // { r: 0, g: 0, b: 0 }
 * ```
 */

type RGB = { r: number; g: number; b: number }

// xterm-256 ANSI 16-color palette RGB values (matches silvery's ANSI_16_COLORS in @silvery/ansi/color-maps.ts)
const BLACK: RGB = { r: 0, g: 0, b: 0 }
const RED: RGB = { r: 128, g: 0, b: 0 }
const GREEN: RGB = { r: 0, g: 128, b: 0 }
const YELLOW: RGB = { r: 128, g: 128, b: 0 }
const BLUE: RGB = { r: 0, g: 0, b: 128 }
const MAGENTA: RGB = { r: 128, g: 0, b: 128 }
const CYAN: RGB = { r: 0, g: 128, b: 128 }
const WHITE: RGB = { r: 192, g: 192, b: 192 }
const BRIGHT_BLACK: RGB = { r: 128, g: 128, b: 128 }
const BRIGHT_RED: RGB = { r: 255, g: 0, b: 0 }
const BRIGHT_GREEN: RGB = { r: 0, g: 255, b: 0 }
const BRIGHT_YELLOW: RGB = { r: 255, g: 255, b: 0 }
const BRIGHT_BLUE: RGB = { r: 0, g: 0, b: 255 }
const BRIGHT_MAGENTA: RGB = { r: 255, g: 0, b: 255 }
const BRIGHT_CYAN: RGB = { r: 0, g: 255, b: 255 }
const BRIGHT_WHITE: RGB = { r: 255, g: 255, b: 255 }

export const TC = {
  /** Text on selected background — black */
  $selection: BLACK,
  /** Selection highlight background — yellow */
  "$selection-bg": YELLOW,
  /** Primary foreground text — bright white */
  $fg: BRIGHT_WHITE,
  /** Muted foreground text — white (dim) */
  $muted: WHITE,
  /** Disabled foreground text — gray */
  "$disabled-fg": BRIGHT_BLACK,
  /** Dividers, borders, rules — gray */
  $border: BRIGHT_BLACK,
  /** Error/destructive — bright red */
  $error: BRIGHT_RED,
  /** Warning/caution — yellow */
  $warning: YELLOW,
  /** Success/positive — bright green */
  $success: BRIGHT_GREEN,
  /** Primary brand tint — yellow */
  $primary: YELLOW,
  /** Hyperlinks, references — bright blue */
  $link: BRIGHT_BLUE,
  /** Focus border — bright blue */
  $focusborder: BRIGHT_BLUE,
  /** Interactive control borders — bright blue */
  $inputborder: BRIGHT_BLUE,
  /** Text on elevated surface — bright white */
  $surface: BRIGHT_WHITE,
  /** Elevated surface background — black */
  "$surface-bg": BLACK,

  // ── Backward compatibility aliases ────────────────────────────────
  $selected: YELLOW,
  $selectedfg: BLACK,
  $text: BRIGHT_WHITE,
  $text2: WHITE,
  $text3: BRIGHT_BLACK,
  $separator: BRIGHT_BLACK,
  $focusring: BRIGHT_BLUE,
  $control: BRIGHT_BLUE,

  // ── Named ANSI colors (for direct color comparison) ───────────────
  BLACK,
  RED,
  GREEN,
  YELLOW,
  BLUE,
  MAGENTA,
  CYAN,
  WHITE,
  BRIGHT_BLACK,
  BRIGHT_RED,
  BRIGHT_GREEN,
  BRIGHT_YELLOW,
  BRIGHT_BLUE,
  BRIGHT_MAGENTA,
  BRIGHT_CYAN,
  BRIGHT_WHITE,
} as const
