/**
 * Test Colors (TC) — semantic token names → ANSI 16 color indices.
 *
 * Maps inkx theme tokens from `ansi16DarkTheme` (the default test theme)
 * to their resolved ANSI 256-color indices. Use these instead of magic
 * numbers in color assertions.
 *
 * Source of truth: vendor/swatch/src/palettes/index.ts (ansi16DarkTheme)
 *                  vendor/hightea/src/pipeline/render-helpers.ts (namedColors)
 *
 * @example
 * ```ts
 * import { TC } from "./helpers/theme.ts"
 *
 * expect(cell.bg).toEqual(TC.$selection)     // instead of 3
 * expect(cell.fg).toEqual(TC["$selection-fg"]) // instead of 0
 * ```
 */
export const TC = {
  /** Selection highlight background — yellow (3) */
  $selection: 3,
  /** Text on selected background — black (0) */
  "$selection-fg": 0,
  /** Primary foreground text — whiteBright (15) */
  $fg: 15,
  /** Muted foreground text — white (7) */
  "$muted-fg": 7,
  /** Disabled foreground text — gray (8) */
  "$disabled-fg": 8,
  /** Dividers, borders, rules — gray (8) */
  $border: 8,
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
  /** Focus border — blueBright (12) */
  $focusborder: 12,
  /** Interactive control borders — blueBright (12) */
  $inputborder: 12,
  /** Elevated surfaces — black (0) */
  $surface: 0,

  // ── Backward compatibility aliases ────────────────────────────────
  // Old token names → same color values. Use new names in new tests.
  $selected: 3,
  $selectedfg: 0,
  $text: 15,
  $text2: 7,
  $text3: 8,
  $separator: 8,
  $focusring: 12,
  $control: 12,
} as const
