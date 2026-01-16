/**
 * Plain Text Utilities
 *
 * Transform raw markdown content to plain text for display.
 * No ANSI codes - just text cleanup. Used by OpenTUI which handles
 * styling via its own `<text>` element props.
 *
 * For ANSI-styled output (Ink TUI), use @km/cli/text instead.
 */

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
 * Regex to match markdown links: [text](url)
 */
const MD_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Regex to match markdown formatting: **bold**, *italic*, `code`, ~~strike~~
 */
const BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const ITALIC_ASTERISK_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const ITALIC_UNDERSCORE_REGEX = /(?<![_\w])_([^_]+)_(?![_\w])/g;
const CODE_REGEX = /`([^`]+)`/g;
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g;

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

/**
 * Render raw markdown text to plain text (no styling).
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Strips wiki link syntax: [[note]] → "note", [[path|alias]] → "alias"
 * - Strips markdown link syntax: [text](url) → "text"
 * - Strips formatting: **bold** → "bold", *italic* → "italic"
 * - Cleans up whitespace
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

  // Strip bold markers
  result = result.replace(BOLD_REGEX, (_match, content: string) => content);

  // Strip italic markers
  result = result.replace(
    ITALIC_ASTERISK_REGEX,
    (_match, content: string) => content,
  );
  result = result.replace(
    ITALIC_UNDERSCORE_REGEX,
    (_match, content: string) => content,
  );

  // Strip code markers
  result = result.replace(CODE_REGEX, (_match, content: string) => content);

  // Strip strikethrough markers
  result = result.replace(
    STRIKETHROUGH_REGEX,
    (_match, content: string) => content,
  );

  // Clean up whitespace
  return result.replace(/  +/g, " ").trim();
}

/**
 * Get display length of a string (for plain text, just the length).
 * This mirrors the ANSI-aware version in @km/cli for compatibility.
 */
export function displayLength(text: string): number {
  return text.length;
}
