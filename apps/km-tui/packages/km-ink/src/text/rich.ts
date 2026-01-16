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
import { dashedUnderline } from "@beorn/chalkx";

// ============================================================================
// ANSI String Utilities
// ============================================================================

/**
 * ANSI escape code pattern for stripping.
 * Matches:
 * - SGR escape sequences like \x1b[31m (red), \x1b[0m (reset)
 * - Extended SGR codes like \x1b[4:3m (curly underline) or \x1b[58:2::r:g:bm (underline color)
 * - OSC 8 hyperlink sequences: \x1b]8;;<url>\x1b\\ (opening) and \x1b]8;;\x1b\\ (closing)
 */
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;

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
 * Extract display text and target from a wiki link content.
 * For [[path|alias]], returns { display: "alias", target: "path" }.
 * For [[text]], returns { display: "text", target: "text" }.
 */
function extractLinkParts(linkContent: string): {
  display: string;
  target: string;
} {
  if (linkContent.includes("|")) {
    const parts = linkContent.split("|");
    return {
      target: parts[0] ?? linkContent,
      display: parts[1] ?? linkContent,
    };
  }
  return { display: linkContent, target: linkContent };
}

// Markdown formatting patterns
const BOLD_REGEX = /\*\*([^*]+)\*\*/g; // **bold**
const ITALIC_ASTERISK_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g; // *italic* (not part of **)
const ITALIC_UNDERSCORE_REGEX = /(?<![_\w])_([^_]+)_(?![_\w])/g; // _italic_ (word boundary)
const CODE_REGEX = /`([^`]+)`/g; // `code`
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g; // ~~strikethrough~~

// Markdown link patterns - capture both text and URL
const MD_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g; // [text](url)

// Draft/tentative content patterns - styled with dashed underline
const DRAFT_PREFIX_REGEX = /^(Draft|WIP|TODO|FIXME):\s*/i;

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
  // Check if content starts with a draft prefix (Draft:, WIP:, TODO:, FIXME:)
  const isDraft = DRAFT_PREFIX_REGEX.test(text);

  // Strip inline fields first
  let result = text.replace(INLINE_FIELD_REGEX, "");

  // Style markdown links [text](url) → underlined text
  // NOTE: OSC 8 hyperlinks disabled due to wrap-ansi incompatibility
  // Links are still visually indicated with underline
  result = result.replace(
    MD_LINK_REGEX,
    (_match, linkText: string, _url: string) => {
      return chalk.underline(linkText);
    },
  );

  // Style wiki links: underlined text
  // NOTE: OSC 8 hyperlinks disabled due to wrap-ansi incompatibility
  // The km:// protocol would be intercepted for navigation, but wrapping breaks it
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    const { display } = extractLinkParts(content);
    return chalk.underline(display);
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
  result = result.replace(/  +/g, " ").trim();

  // Apply dashed underline to draft/tentative content
  if (isDraft) {
    result = dashedUnderline(result);
  }

  return result;
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
    return extractLinkParts(content).display;
  });

  // Clean up whitespace
  return result.replace(/  +/g, " ").trim();
}
