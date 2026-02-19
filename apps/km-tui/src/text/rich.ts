/**
 * Rich Text Rendering (Layer 1 - Shared)
 *
 * Transform raw markdown content to styled ANSI strings.
 * Used by both CLI commands and TUI components.
 *
 * Delegates to the unified text pipeline (text-pipeline.ts) for all
 * text processing. This module re-exports the pipeline functions under
 * the legacy API names for backward compatibility.
 *
 * ## Functions
 * - `renderRich(raw)` - strips markup, applies term styling
 * - `renderPlain(raw)` - strips markup, returns plain text
 * - `displayLength(styled)` - character count excluding ANSI codes
 * - `stripAnsi(styled)` - remove all ANSI escape codes
 */

import { stripAnsi } from "inkx"
import stringWidth from "string-width"
import { processText, type TextPipelineOptions } from "./text-pipeline.ts"

// ============================================================================
// ANSI String Utilities
// ============================================================================

// Re-export ANSI utilities from inkx (canonical implementation)
export { stripAnsi }

/**
 * Strip only foreground color codes from an ANSI string, preserving formatting
 * attributes (underline, bold, italic, strikethrough). Use this instead of
 * stripAnsi when applying a background color override (e.g., selection highlight).
 *
 * Strips: fg colors (30-37, 90-97, 38;5;N, 38;2;R;G;B, 39), dim (2)
 * Replaces: reset (0) with reset-intensity+reset-fg (22;39) to preserve formatting
 * Preserves: underline (4), bold (1), italic (3), strikethrough (9), and their resets
 */
export function stripFgColor(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m/g, (_match, params: string) => {
    // Full reset → partial reset (keep formatting, clear fg + intensity)
    if (params === "0" || params === "") return "\x1b[22;39m"

    // Split compound sequences and filter out fg-color codes
    const codes = params.split(";").map(Number)
    const kept: number[] = []

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]
      if (code === undefined) continue
      // Skip basic fg colors (30-37, 90-97)
      if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) continue
      // Skip default fg (39)
      if (code === 39) continue
      // Skip dim (2) — it's a color-appearance modifier
      if (code === 2) continue
      // Skip 256-color fg: 38;5;N
      if (code === 38 && codes[i + 1] === 5) {
        i += 2
        continue
      }
      // Skip truecolor fg: 38;2;R;G;B
      if (code === 38 && codes[i + 1] === 2) {
        i += 4
        continue
      }
      kept.push(code)
    }

    if (kept.length === 0) return ""
    return `\x1b[${kept.join(";")}m`
  })
}

/**
 * Get the display length of a string, excluding ANSI escape codes.
 * Use this instead of string.length when measuring styled text.
 *
 * Uses string-width package for proper Unicode/emoji handling:
 * - CJK characters count as 2 cells
 * - Emoji count as 2 cells
 * - ANSI escape codes are stripped
 */
export function displayLength(text: string): number {
  return stringWidth(text)
}

// ============================================================================
// Rich Text Rendering (delegates to text-pipeline)
// ============================================================================

/**
 * Options for rich text rendering
 */
export interface RenderRichOptions {
  /**
   * Sigils to exclude from display (e.g., ["@issue"] when viewing the @issue board).
   * Include the full sigil with prefix (e.g., "@issue", "#feature", "+project").
   */
  excludeSigils?: string[]
  /**
   * Map of sigil to color (e.g., { "@next": "cyan", "#urgent": "red" }).
   * Resolved sigils are displayed in their color; unresolved render as plain text.
   */
  sigilColors?: Map<string, string>
  /**
   * Dynamic resolver for sigil colors. Called for sigils not found in sigilColors map.
   * Return a color name for resolved sigils, or undefined for unresolved ones.
   */
  resolveSigilColor?: (sigil: string) => string | undefined
}

/**
 * Render raw markdown text to a styled ANSI string.
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Styles wiki links: [[note]] → underlined "note"
 * - Styles sigils: resolved → colored by node, unresolved → plain text
 * - Filters out excluded sigils (e.g., @issue when viewing @issue board)
 * - Styles **bold** → bold
 * - Styles *italic* → italic
 * - Styles `code` → cyan
 * - Styles ~~strikethrough~~ → dim
 * - Cleans up whitespace
 *
 * The result can be safely wrapped/truncated using displayLength().
 *
 * @example
 * renderRich("Task [[project|My Project]] [due:: 2024-01-15]")
 * // Returns: "Task \x1b[2m\x1b[4mMy Project\x1b[0m"
 *
 * @example
 * renderRich("Fix bug @issue #P1", { excludeSigils: ["@issue"] })
 * // Returns: "Fix bug \x1b[36m\x1b[4m#P1\x1b[0m" (without @issue)
 */
export function renderRich(text: string, options?: RenderRichOptions): string {
  const pipelineOpts: TextPipelineOptions = {
    mode: "rich",
    excludeSigils: options?.excludeSigils,
    sigilColors: options?.sigilColors,
    resolveSigilColor: options?.resolveSigilColor,
  }
  return processText(text, pipelineOpts)
}

/**
 * Render raw markdown text to plain text (no styling).
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Strips markdown formatting: **bold** → "bold", *italic* → "italic"
 * - Strips wiki link syntax: [[note]] → "note", [[path|alias]] → "alias"
 * - Cleans up whitespace
 *
 * Use this when you need plain text without ANSI codes.
 *
 * @example
 * renderPlain("Task [[project|My Project]] [due:: 2024-01-15]")
 * // Returns: "Task My Project"
 *
 * @example
 * renderPlain("**bold** and *italic* text")
 * // Returns: "bold and italic text"
 */
export function renderPlain(text: string): string {
  return processText(text, { mode: "plain" })
}
