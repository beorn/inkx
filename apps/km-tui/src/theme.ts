/**
 * km Theme System
 *
 * Central theme definitions using ANSI 16 colors only.
 * inkx ThemeProvider resolves $token strings at render time.
 *
 * Usage in components:
 *   <Text color="$primary">link</Text>       — resolved from theme
 *   <Text color={km.selectionBg}>selected</Text> — km-specific constant
 */

import type { Theme } from "inkx"

// ============================================================================
// Dark Theme (default)
// ============================================================================

export const kmDarkTheme: Theme = {
  name: "km-dark",
  dark: true,
  primary: "cyan", // Links, active indicators, code
  accent: "magenta", // Tags, badges, decorative elements
  error: "red", // Errors, overdue dates, validation
  warning: "yellow", // Warnings, unsaved changes
  success: "green", // Success, wiki links, due-today dates
  surface: undefined, // No bg — use terminal default
  background: undefined, // No bg — use terminal default
  text: "white", // Primary text
  muted: "gray", // Dim text, placeholders, separators
  border: "white", // Borders, separators (use with dimColor)
}

// ============================================================================
// Light Theme
// ============================================================================

export const kmLightTheme: Theme = {
  name: "km-light",
  dark: false,
  primary: "blue", // Links, active indicators (blue is more readable on light bg)
  accent: "magenta", // Tags, badges
  error: "red", // Errors
  warning: "yellow", // Warnings (use with bold on light bg)
  success: "green", // Success
  surface: undefined, // No bg — use terminal default
  background: undefined, // No bg — use terminal default
  text: "black", // Primary text
  muted: "gray", // Dim text
  border: "black", // Borders
}

/** Default theme for ThemeProvider */
export const defaultKmTheme = kmDarkTheme

// ============================================================================
// km-specific constants (beyond the 10 built-in $tokens)
//
// These are plain constants — inkx $token only resolves the 10 standard tokens.
// Import as: import { km } from "../theme.ts"
// ============================================================================

export const km = {
  // Selection (cursor on a card/item)
  selectionBg: "yellow",
  selectionFg: "black",
  selectionDim: "gray", // unfocused pane selection

  // Text input / editing focus
  inputFocusRing: "blue", // outline/border when text input is active
  cardBorderEditing: "blue", // card outline when inline editing (= inputFocusRing)
  cardBorderSelected: "yellow", // card outline when selected

  // Text colors
  textPrimary: "white", // primary text
  textLink: "cyan", // links, references

  // Borders / chrome
  paneBorderFocused: "white", // focused pane border
  columnHeaderColor: "white", // column header text

  // Hints (which-key, chord popup, inactive labels)
  hintKey: "white", // active key in popup
  hintKeyDim: "gray", // inactive keys, timestamps, muted bullets

  // Mode indicators (used by CommandBox + bottom bar)
  modeMagenta: "magenta", // MOVE mode

  // Overlay backgrounds — opaque bg for floating overlays (dialogs, toasts, etc.)
  // Ideally we'd detect the terminal's bg via OSC 11 (km-inkx.osc11-bg), but for now
  // hardcode "black" for dark themes. This ensures overlays are opaque, not transparent.
  overlayBg: "black" as string | undefined,

  // Dialogs (Omnibox, SearchDialog, FilterDialog, ConfirmDialog, chord hints, etc.)
  dialogBorder: "white", // dialog outline/border
  dialogTitle: "white", // dialog title text (bold)
  dialogBody: "white", // dialog body text
  dialogDim: "white", // secondary text in dialogs (+ dimColor)
  dialogSelectedBg: "yellow", // selected item in dialog list
  dialogSelectedFg: "black", // selected item text
  dialogInputBorder: "blue", // search/input field border in dialog
  dialogShortcut: "cyan", // keyboard shortcut hints in dialogs

  // Help overlay
  helpSectionHeading: "yellow", // section headings (NAVIGATION, etc.)
  helpKey: "yellow", // key shortcuts in help dialog
} as const

/**
 * Legacy theme object — merges km-specific constants with dark theme semantic colors.
 * Used by all existing `import { theme } from "../theme.ts"` consumers.
 */
export const theme = {
  ...km,
  success: kmDarkTheme.success,
  warning: kmDarkTheme.warning,
  error: kmDarkTheme.error,
} as const
