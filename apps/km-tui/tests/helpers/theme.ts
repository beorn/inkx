/**
 * Test Colors (TC) — semantic token names → ANSI 16 color indices.
 *
 * Maps inkx theme tokens from `ansi16DarkTheme` (the default test theme)
 * to their resolved ANSI 256-color indices. Use these instead of magic
 * numbers in color assertions.
 *
 * Source of truth: vendor/beorn-themex/src/palettes/index.ts (ansi16DarkTheme)
 *                  vendor/beorn-inkx/src/pipeline/render-helpers.ts (namedColors)
 *
 * @example
 * ```ts
 * import { TC } from "./helpers/theme.ts"
 *
 * expect(cell.bg).toEqual(TC.$selected)   // instead of 3
 * expect(cell.fg).toEqual(TC.$selectedfg) // instead of 0
 * ```
 */
export const TC = {
  /** Selection highlight background — yellow (3) */
  $selected: 3,
  /** Text on selected background — black (0) */
  $selectedfg: 0,
  /** Primary text — whiteBright (15) */
  $text: 15,
  /** Secondary text — white (7) */
  $text2: 7,
  /** Tertiary text — gray (8) */
  $text3: 8,
  /** Dividers, borders, rules — gray (8) */
  $separator: 8,
  /** Error/destructive — redBright (9) */
  $error: 9,
  /** Warning/caution — yellow (3) */
  $warning: 3,
  /** Success/positive — greenBright (10) */
  $success: 10,
  /** Primary brand tint — yellow (3) */
  $primary: 3,
  /** Hyperlinks, references — blueBright (12) */
  $link: 12,
  /** Keyboard focus outline — blueBright (12) */
  $focusring: 12,
  /** Elevated surfaces — black (0) */
  $surface: 0,
} as const
