/**
 * Test Colors (TC) — semantic token names → resolved RGB values.
 *
 * Tokens (`$foo`) are derived AT IMPORT TIME from `ansi16DarkTheme`, the
 * default theme used by `createTestApp()` (see `tests/helpers/board-test.ts`
 * → `ThemeProvider theme={defaultKmTheme}`). This keeps `TC` in lock-step
 * with the runtime — if silvery's default theme changes shade, tests update
 * automatically.
 *
 * Historical note: `TC` was hand-coded to pure ANSI16-slot RGB values
 * (`{r:128, g:128, b:0}` for yellow). That stopped matching reality in Phase
 * 2a/2b (theme-v4 → Sterling) when `ansi16DarkTheme` switched to Nord-derived
 * truecolor hex values. The buffer stores truecolor; `cell.fg`/`cell.bg`
 * resolve to those exact hex→RGB values. Colorlevel quantization happens in
 * the output phase, not in the buffer.
 *
 * Named ANSI constants (BLACK, YELLOW, BRIGHT_RED, …) remain hand-coded for
 * tests that assert on fixed ANSI slot colors directly.
 *
 * @example
 * ```ts
 * import { TC } from "./helpers/theme.ts"
 *
 * // Semantic tokens — track the runtime theme:
 * expect(cell.bg).toEqual(TC.$selectionbg) // Nord Polar Night 3
 * expect(cell.fg).toEqual(TC.$selection)   // Nord Snow Storm 1
 *
 * // Named ANSI slots — fixed, regardless of theme:
 * expect(cell.fg).toEqual(TC.BRIGHT_RED)   // {r:255, g:0, b:0}
 * ```
 */

// Import @silvery/theme's ansi16DarkTheme — it ships with Sterling flat tokens
// baked in (see @silvery/theme/schemes/index.ts), mirroring what the render
// pipeline uses as its default active theme. The bare `ansi16DarkTheme`
// re-exported from @silvery/ag-react / @silvery/ansi is the legacy shape
// without `fg-muted`, `bg-surface-default`, `border-focus` flat keys; we
// intentionally import the pre-populated variant for lock-step with runtime.
import { ansi16DarkTheme } from "@silvery/theme"

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

/** Parse `#RRGGBB` → RGB. Returns a transparent sentinel for undefined / non-hex. */
function hexToRgb(hex: string | undefined): RGB {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return BLACK
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m?.[1]) return BLACK
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

// Pull from the runtime theme so TC stays in lock-step with silvery's
// Nord-based `ansi16DarkTheme`. Bracket access because several keys are
// Sterling flat kebab-form (not on the legacy Theme type).
const t = ansi16DarkTheme as unknown as Record<string, string | undefined>

/** Selection highlight bg (Nord Polar Night 3 by default). */
const SELECTION_BG = hexToRgb(t["selectionbg"])
/** Selection fg on the selection bg (Nord Snow Storm 1 by default). */
const SELECTION_FG = hexToRgb(t["selection"])
/** Primary foreground text (Nord Snow Storm 1 by default). */
const FG = hexToRgb(t["fg"])
/** Muted foreground text. */
const MUTED = hexToRgb(t["muted"])
/** Disabled foreground — Sterling has no disabled slot; falls back to muted. */
const DISABLED_FG = hexToRgb(t["fg-muted"] ?? t["disabledfg"] ?? t["muted"])
/** Default border color (Sterling border-default → legacy border). */
const BORDER = hexToRgb(t["border-default"] ?? t["border"])
/** Error / destructive (Nord red by default). */
const ERROR = hexToRgb(t["error"])
/** Warning / caution (Nord yellow by default). */
const WARNING = hexToRgb(t["warning"])
/** Success / positive (Nord green by default). */
const SUCCESS = hexToRgb(t["success"])
/** Primary brand tint (Nord blue by default). */
const PRIMARY = hexToRgb(t["primary"])
/** Hyperlinks, references. */
const LINK = hexToRgb(t["link"])
/** Focus border (Sterling border-focus → legacy focusborder). */
const FOCUS_BORDER = hexToRgb(t["border-focus"] ?? t["focusborder"])
/** Interactive control borders. */
const INPUT_BORDER = hexToRgb(t["border-default"] ?? t["inputborder"])
/** Surface text. */
const SURFACE_FG = hexToRgb(t["surface"] ?? t["fg"])
/** Elevated surface bg. */
const SURFACE_BG = hexToRgb(t["bg-surface-default"] ?? t["surfacebg"])
/** Cursor bg (terminal cursor color). */
const CURSOR_BG = hexToRgb(t["bg-cursor"] ?? t["cursorbg"])
/** Cursor fg. */
const CURSOR_FG = hexToRgb(t["fg-cursor"] ?? t["cursor"])

export const TC = {
  /** Text on selected background */
  $selection: SELECTION_FG,
  /** Legacy flat alias (pre-migration) — same as $selectionbg */
  "$selection-bg": SELECTION_BG,
  /** Selection highlight background */
  $selectionbg: SELECTION_BG,
  /** Primary foreground text */
  $fg: FG,
  /** Muted foreground text */
  $muted: MUTED,
  /** Disabled foreground text */
  "$disabled-fg": DISABLED_FG,
  /** Sterling: foreground-muted (post-migration target) */
  "$fg-muted": DISABLED_FG,
  /** Dividers, borders, rules */
  $border: BORDER,
  /** Error/destructive */
  $error: ERROR,
  /** Warning/caution */
  $warning: WARNING,
  /** Success/positive */
  $success: SUCCESS,
  /** Primary brand tint */
  $primary: PRIMARY,
  /** Hyperlinks, references */
  $link: LINK,
  /** Focus border */
  $focusborder: FOCUS_BORDER,
  /** Sterling: border-focus (post-migration target) */
  "$border-focus": FOCUS_BORDER,
  /** Interactive control borders */
  $inputborder: INPUT_BORDER,
  /** Sterling: border-default (post-migration target) */
  "$border-default": INPUT_BORDER,
  /** Text on elevated surface */
  $surface: SURFACE_FG,
  /** Elevated surface background */
  "$surface-bg": SURFACE_BG,
  /** Sterling: bg-surface-default (post-migration target) */
  "$bg-surface-default": SURFACE_BG,
  /** Cursor bg */
  "$cursor-bg": CURSOR_BG,
  "$bg-cursor": CURSOR_BG,
  $cursor: CURSOR_FG,
  "$fg-cursor": CURSOR_FG,

  // ── Backward compatibility aliases ────────────────────────────────
  // ($selected / $selectedfg have always aliased the runtime selection
  // pair; kept for tests that predate the Sterling naming.)
  $selected: SELECTION_BG,
  $selectedfg: SELECTION_FG,
  $text: FG,
  $text2: MUTED,
  $text3: DISABLED_FG,
  $separator: BORDER,
  $focusring: FOCUS_BORDER,
  $control: INPUT_BORDER,

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
