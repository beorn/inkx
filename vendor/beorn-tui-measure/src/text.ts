/**
 * ANSI-Aware Text Utilities
 *
 * Functions for measuring, truncating, wrapping, and padding styled terminal strings.
 */

import createDebug from "debug";
import stringWidth from "string-width";

const debug = createDebug("tui-measure:text");
import wrapAnsi from "wrap-ansi";

/**
 * ANSI escape code pattern for stripping.
 * Matches:
 * - SGR escape sequences like \x1b[31m (red), \x1b[0m (reset)
 * - Extended SGR codes like \x1b[4:3m (curly underline)
 * - OSC 8 hyperlink sequences
 */
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;

/**
 * Get the display length of a string, excluding ANSI escape codes.
 * Uses string-width for proper Unicode/emoji handling:
 * - CJK characters count as 2 cells
 * - Emoji count as 2 cells
 * - ANSI escape codes are stripped
 */
export function displayLength(text: string): number {
  return stringWidth(text);
}

/**
 * Strip all ANSI escape codes from a string.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

/**
 * Word-wrap text to fit within a given width.
 * Works correctly with ANSI-styled strings.
 *
 * Note: Strips trailing empty lines (from trailing newlines in input)
 * but preserves empty lines in the middle (intentional paragraph breaks).
 */
export function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const wrapped = wrapAnsi(text, width, { hard: true, trim: true });
  const lines = wrapped.split("\n");

  // Strip trailing empty lines (but preserve middle ones for paragraph breaks)
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Works correctly with ANSI-styled strings including OSC 8 hyperlinks.
 */
export function truncateText(
  text: string,
  width: number,
  ellipsis = "…",
): string {
  if (displayLength(text) <= width) {
    return text;
  }

  const ellipsisLen = displayLength(ellipsis);
  const targetWidth = Math.max(0, width - ellipsisLen);

  // Find all ANSI sequences and their positions
  const ansiMatches: Array<{ start: number; end: number; seq: string }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(ANSI_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    ansiMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      seq: match[0],
    });
  }

  let textPos = 0;
  let displayCount = 0;
  let ansiIdx = 0;
  const resultParts: string[] = [];
  let inHyperlink = false;

  while (textPos < text.length && displayCount < targetWidth) {
    const currentAnsi = ansiMatches[ansiIdx];
    if (currentAnsi && textPos === currentAnsi.start) {
      resultParts.push(currentAnsi.seq);
      textPos = currentAnsi.end;
      ansiIdx++;
      if (
        currentAnsi.seq.startsWith("\x1b]8;;") &&
        currentAnsi.seq.length > 6
      ) {
        inHyperlink = true;
      } else if (currentAnsi.seq === "\x1b]8;;\x1b\\") {
        inHyperlink = false;
      }
    } else {
      const char = text[textPos];
      if (char !== undefined) {
        resultParts.push(char);
      }
      displayCount++;
      textPos++;
    }
  }

  if (inHyperlink) {
    resultParts.push("\x1b]8;;\x1b\\");
  }

  // Reset ANSI styles before ellipsis to ensure clean output
  return resultParts.join("") + "\x1b[0m" + ellipsis;
}

/**
 * Pad a styled string to a specific display width.
 * Adds spaces at the end to ensure the line clears any old content.
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
 * @param pad - If true, pad lines to full width
 * @param ellipsis - Custom ellipsis character (default: "…")
 */
export function constrainText(
  text: string,
  width: number,
  maxLines: number,
  pad = false,
  ellipsis = "…",
): { lines: string[]; truncated: boolean } {
  const allLines = wrapText(text, width);
  const truncated = allLines.length > maxLines;
  let lines = allLines.slice(0, maxLines);

  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1;
    const lastLine = lines[lastIdx];
    if (lastLine) {
      const ellipsisLen = displayLength(ellipsis);
      const lastLineLen = displayLength(lastLine);
      if (lastLineLen + ellipsisLen <= width) {
        lines[lastIdx] = lastLine + ellipsis;
      } else {
        const truncatedLine = truncateText(lastLine, width - ellipsisLen, "");
        lines[lastIdx] = truncatedLine + ellipsis;
      }
    }
  }

  if (pad) {
    lines = lines.map((line) => padText(line, width));
  }

  debug("constrain: %d chars → %d/%d lines (truncated=%s)", text.length, lines.length, allLines.length, truncated);

  return { lines, truncated };
}
