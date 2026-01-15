/**
 * Rich Text Rendering (Layer 1 - Shared)
 *
 * Transform raw markdown content to styled ANSI strings.
 * Used by both CLI commands and TUI components.
 *
 * ## Functions
 * - `renderRich(raw)` - strips markup, applies chalk styling
 * - `renderPlain(raw)` - strips markup, returns plain text
 * - `displayLength(styled)` - character count excluding ANSI codes
 * - `stripAnsi(styled)` - remove all ANSI escape codes
 */

import chalk from "chalk";

// ============================================================================
// ANSI String Utilities
// ============================================================================

/**
 * ANSI escape code pattern for stripping.
 * Matches escape sequences like \x1b[31m (red) or \x1b[0m (reset).
 */
export const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Get the display length of a string, excluding ANSI escape codes.
 * Use this instead of string.length when measuring styled text.
 */
export function displayLength(text: string): number {
  return text.replace(ANSI_REGEX, "").length;
}

/**
 * Strip all ANSI escape codes from a string.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

// ============================================================================
// Rich Text Rendering
// ============================================================================

/**
 * Regex to match inline field attributes like [due:: 2024-01-15], [priority:: 1]
 * These are Dataview/Obsidian Tasks style inline fields.
 */
const INLINE_FIELD_REGEX = /\[(\w+)::\s*([^\]]*)\]/g;

/**
 * Regex to match wiki links: [[note]] or [[path/to/note|alias]]
 */
const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Extract display text from a wiki link content.
 * For [[path|alias]], returns "alias". For [[text]], returns "text".
 */
function extractLinkDisplay(linkContent: string): string {
  if (linkContent.includes("|")) {
    return linkContent.split("|").pop() ?? linkContent;
  }
  return linkContent;
}

// Markdown formatting patterns
const BOLD_REGEX = /\*\*([^*]+)\*\*/g; // **bold**
const ITALIC_ASTERISK_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g; // *italic* (not part of **)
const ITALIC_UNDERSCORE_REGEX = /(?<![_\w])_([^_]+)_(?![_\w])/g; // _italic_ (word boundary)
const CODE_REGEX = /`([^`]+)`/g; // `code`
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g; // ~~strikethrough~~

// Markdown link patterns
const MD_LINK_REGEX = /\[([^\]]+)\]\([^)]+\)/g; // [text](url) - keep text only

/**
 * Render raw markdown text to a styled ANSI string.
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Styles wiki links: [[note]] → dim underlined "note"
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
 */
export function renderRich(text: string): string {
  // Strip inline fields first
  let result = text.replace(INLINE_FIELD_REGEX, "");

  // Strip markdown links [text](url) → text (styled as link)
  result = result.replace(MD_LINK_REGEX, (_match, linkText: string) => {
    return chalk.dim.underline(linkText);
  });

  // Style wiki links with chalk (dim + underline)
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    const display = extractLinkDisplay(content);
    return chalk.dim.underline(display);
  });

  // Style bold text (must be before italic to avoid conflicts)
  result = result.replace(BOLD_REGEX, (_match, content: string) => {
    return chalk.bold(content);
  });

  // Style italic text (*italic* or _italic_)
  result = result.replace(ITALIC_ASTERISK_REGEX, (_match, content: string) => {
    return chalk.italic(content);
  });
  result = result.replace(
    ITALIC_UNDERSCORE_REGEX,
    (_match, content: string) => {
      return chalk.italic(content);
    },
  );

  // Style inline code
  result = result.replace(CODE_REGEX, (_match, content: string) => {
    return chalk.cyan(content);
  });

  // Style strikethrough (render as dim since terminals often don't support true strikethrough)
  result = result.replace(STRIKETHROUGH_REGEX, (_match, content: string) => {
    return chalk.dim.strikethrough(content);
  });

  // Clean up whitespace
  return result.replace(/  +/g, " ").trim();
}

/**
 * Render raw markdown text to plain text (no styling).
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Strips wiki link syntax: [[note]] → "note", [[path|alias]] → "alias"
 * - Cleans up whitespace
 *
 * Use this when you need plain text without ANSI codes.
 *
 * @example
 * renderPlain("Task [[project|My Project]] [due:: 2024-01-15]")
 * // Returns: "Task My Project"
 */
export function renderPlain(text: string): string {
  // Strip inline fields
  let result = text.replace(INLINE_FIELD_REGEX, "");

  // Strip markdown links [text](url) → text
  result = result.replace(MD_LINK_REGEX, (_match, linkText: string) => {
    return linkText;
  });

  // Strip wiki links (keep display text only)
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    return extractLinkDisplay(content);
  });

  // Clean up whitespace
  return result.replace(/  +/g, " ").trim();
}
