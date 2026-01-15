/**
 * TUI Text Rendering - Layered Architecture
 *
 * This module provides a clean, layered approach to rendering text in the TUI.
 *
 * ## Architecture
 *
 * ### Layer 1: Rich Text Rendering
 * Transform raw markdown content to styled ANSI strings.
 * - `renderRich(raw)` - strips markup, applies chalk styling
 * - `renderPlain(raw)` - strips markup, returns plain text
 *
 * ### Layer 2: Layout Functions
 * Width-aware operations on styled (ANSI) strings.
 * - `displayLength(styled)` - character count excluding ANSI codes
 * - `wrapText(styled, width)` - word-wrap respecting display length
 * - `truncateText(styled, width)` - truncate with ellipsis
 *
 * ### Layer 3: Path Rendering
 * Special handling for file/node paths.
 * - `renderPath(segments, width)` - smart breadcrumb truncation
 * - `renderParentPath(path, width)` - right-aligned, left-truncated
 *
 * ## Data Flow
 *
 * ```
 * raw content (with [[links]], [field:: value], etc.)
 *     ↓
 * renderRich() → styled ANSI string
 *     ↓
 * wrapText(styled, width) → string[]
 *     ↓
 * <Text>{line}</Text> for each line
 * ```
 *
 * ## Key Principle
 *
 * Always render to styled strings BEFORE any width calculations.
 * This prevents truncation from breaking markup like [[wiki links]].
 */

import chalk from "chalk";

// ============================================================================
// ANSI String Utilities
// ============================================================================

/**
 * ANSI escape code pattern for stripping.
 * Matches escape sequences like \x1b[31m (red) or \x1b[0m (reset).
 */
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

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
// Layer 1: Rich Text Rendering
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
const ITALIC_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g; // *italic* (not part of **)
const CODE_REGEX = /`([^`]+)`/g; // `code`
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g; // ~~strikethrough~~

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

  // Style wiki links with chalk (dim + underline)
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    const display = extractLinkDisplay(content);
    return chalk.dim.underline(display);
  });

  // Style bold text (must be before italic to avoid conflicts)
  result = result.replace(BOLD_REGEX, (_match, content: string) => {
    return chalk.bold(content);
  });

  // Style italic text
  result = result.replace(ITALIC_REGEX, (_match, content: string) => {
    return chalk.italic(content);
  });

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

  // Strip wiki links (keep display text only)
  result = result.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    return extractLinkDisplay(content);
  });

  // Clean up whitespace
  return result.replace(/  +/g, " ").trim();
}

// ============================================================================
// Layer 2: Layout Functions
// ============================================================================

/**
 * Word-wrap text to fit within a given width.
 * Works correctly with ANSI-styled strings by measuring display length.
 *
 * @param text - Text to wrap (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @returns Array of lines
 */
export function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const lines: string[] = [];

  for (const inputLine of text.split("\n")) {
    if (displayLength(inputLine) <= width) {
      lines.push(inputLine);
      continue;
    }

    // Need to wrap this line - work with plain text for break points
    const plain = stripAnsi(inputLine);
    let remaining = inputLine;
    let plainRemaining = plain;

    while (displayLength(remaining) > 0) {
      if (displayLength(remaining) <= width) {
        lines.push(remaining);
        break;
      }

      // Find break point in plain text
      let breakPoint = plainRemaining.lastIndexOf(" ", width);
      if (breakPoint <= 0) breakPoint = width;

      // Find corresponding position in styled text
      // Count display chars to find where to cut
      let styledBreak = 0;
      let displayCount = 0;
      let inEscape = false;

      for (let i = 0; i < remaining.length && displayCount < breakPoint; i++) {
        if (remaining[i] === "\x1b") {
          inEscape = true;
        } else if (inEscape && remaining[i] === "m") {
          inEscape = false;
        } else if (!inEscape) {
          displayCount++;
        }
        styledBreak = i + 1;
      }

      lines.push(remaining.slice(0, styledBreak));
      remaining = remaining.slice(styledBreak).trimStart();
      plainRemaining = stripAnsi(remaining);
    }
  }

  return lines;
}

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Works correctly with ANSI-styled strings.
 *
 * @param text - Text to truncate (may contain ANSI codes)
 * @param width - Maximum display width
 * @returns Truncated text with "…" suffix if truncated
 */
export function truncateText(text: string, width: number): string {
  if (displayLength(text) <= width) {
    return text;
  }

  // Need to truncate - find position for width-1 chars (leave room for …)
  const targetWidth = width - 1;
  let styledPos = 0;
  let displayCount = 0;
  let inEscape = false;

  for (let i = 0; i < text.length && displayCount < targetWidth; i++) {
    if (text[i] === "\x1b") {
      inEscape = true;
    } else if (inEscape && text[i] === "m") {
      inEscape = false;
    } else if (!inEscape) {
      displayCount++;
    }
    styledPos = i + 1;
  }

  return text.slice(0, styledPos) + chalk.reset("") + "…";
}

/**
 * Pad a styled string to a specific display width.
 * Adds spaces at the end to ensure the line clears any old content.
 *
 * @param text - Text to pad (may contain ANSI codes)
 * @param width - Target display width
 * @returns Padded text
 */
export function padText(text: string, width: number): string {
  const currentLen = displayLength(text);
  if (currentLen >= width) {
    return text;
  }
  return text + " ".repeat(width - currentLen);
}

/**
 * Constrain text to width and height limits.
 *
 * @param text - Text to constrain (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @param maxLines - Maximum number of lines
 * @param pad - If true, pad lines to full width (helps clear old terminal content)
 * @returns Object with wrapped lines and truncation indicator
 */
export function constrainText(
  text: string,
  width: number,
  maxLines: number,
  pad = false,
): { lines: string[]; truncated: boolean } {
  const allLines = wrapText(text, width);
  const truncated = allLines.length > maxLines;
  let lines = allLines.slice(0, maxLines);

  // Add ellipsis to last line if truncated
  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1;
    const lastLine = lines[lastIdx];
    if (lastLine && displayLength(lastLine) >= width - 1) {
      lines[lastIdx] = truncateText(lastLine, width);
    }
  }

  // Pad lines to full width if requested
  if (pad) {
    lines = lines.map((line) => padText(line, width));
  }

  return { lines, truncated };
}

// ============================================================================
// Layer 3: Path Rendering
// ============================================================================

/**
 * Path segment for breadcrumb rendering.
 */
export interface PathSegment {
  name: string;
  sep: string;
  isWithinBoard: boolean;
}

/**
 * Calculate display length of path segments.
 * Accounts for separator padding (shown as " sep ").
 */
export function calcPathLength(segments: PathSegment[]): number {
  return segments.reduce(
    (acc, seg) => acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0),
    0,
  );
}

/**
 * Render a path with smart truncation to fit within maxWidth.
 * Truncates from start of within-board segments first, then root path.
 *
 * @param segments - Path segments to render
 * @param width - Maximum width in characters
 * @returns Truncated path segments
 */
export function renderPath(
  segments: PathSegment[],
  width?: number,
): PathSegment[] {
  if (!width || calcPathLength(segments) <= width) return segments;

  const rootSegs = segments.filter((s) => !s.isWithinBoard);
  const boardSegs = segments.filter((s) => s.isWithinBoard);

  // Truncate within-board segments from start
  while (
    boardSegs.length > 1 &&
    calcPathLength([...rootSegs, ...boardSegs]) > width
  ) {
    boardSegs.shift();
    const first = boardSegs[0];
    if (first) {
      boardSegs[0] = { ...first, name: "…" + first.name };
    }
    break;
  }

  const combined = [...rootSegs, ...boardSegs];

  // Truncate root segments if still too long
  if (calcPathLength(combined) > width && combined.length > 1) {
    while (combined.length > 1 && calcPathLength(combined) > width) {
      combined.shift();
    }
    const first = combined[0];
    if (first) {
      combined[0] = { ...first, name: "…" + first.name, sep: "" };
    }
  }

  return combined;
}

/**
 * Render a parent context path, right-aligned with left truncation.
 *
 * @param path - The parent path to render
 * @param width - Maximum width in characters
 * @returns Right-aligned string, truncated from left with "…" if needed
 */
export function renderParentPath(path: string, width: number): string {
  if (path.length <= width) {
    return path.padStart(width);
  }
  return "…" + path.slice(-(width - 1));
}
