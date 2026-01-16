/**
 * Text Truncation (Layer 2 - TUI Layout)
 *
 * Truncate and pad styled ANSI strings.
 */

import chalk from "chalk";
import { displayLength, ANSI_REGEX } from "../text/index.ts";

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Works correctly with ANSI-styled strings including OSC 8 hyperlinks.
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

  // Track position and display count
  let textPos = 0;
  let displayCount = 0;
  let ansiIdx = 0;
  const resultParts: string[] = [];
  let inHyperlink = false;

  while (textPos < text.length && displayCount < targetWidth) {
    // Check if we're at the start of an ANSI sequence
    const currentAnsi = ansiMatches[ansiIdx];
    if (currentAnsi && textPos === currentAnsi.start) {
      // Include the ANSI sequence
      resultParts.push(currentAnsi.seq);
      textPos = currentAnsi.end;
      ansiIdx++;
      // Track hyperlink state
      if (
        currentAnsi.seq.startsWith("\x1b]8;;") &&
        currentAnsi.seq.length > 6
      ) {
        inHyperlink = true;
      } else if (currentAnsi.seq === "\x1b]8;;\x1b\\") {
        inHyperlink = false;
      }
    } else {
      // Regular character - count it
      const char = text[textPos];
      if (char !== undefined) {
        resultParts.push(char);
      }
      displayCount++;
      textPos++;
    }
  }

  // Close any open hyperlink before adding ellipsis
  if (inHyperlink) {
    resultParts.push("\x1b]8;;\x1b\\");
  }

  return resultParts.join("") + chalk.reset("") + "…";
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
