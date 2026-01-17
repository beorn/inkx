/**
 * Rich Text Rendering for OpenTUI
 *
 * Unlike TUI1 (Ink) which uses chalk for ANSI styling,
 * OpenTUI uses JSX `<text>` elements with props.
 *
 * This module provides utilities to render markdown text as
 * styled OpenTUI JSX elements.
 */

import type { ReactNode } from "react";

// Regex patterns (shared with @km/ink)
const INLINE_FIELD_REGEX = /\[(\w+)::\s*([^\]]*)\]/g;
const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const ITALIC_ASTERISK_REGEX = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const CODE_REGEX = /`([^`]+)`/g;
const STRIKETHROUGH_REGEX = /~~([^~]+)~~/g;

interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  color?: string;
}

/**
 * Parse markdown text into segments with styling information.
 * This is a simplified parser that handles common markdown patterns.
 */
function parseRichText(text: string): TextSegment[] {
  // Strip inline fields first
  let cleaned = text.replace(INLINE_FIELD_REGEX, "");

  // Replace wiki links with styled segments
  cleaned = cleaned.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    // Extract display text from [[path|alias]] or [[text]]
    const display = content.includes("|")
      ? (content.split("|")[1] ?? content)
      : content;
    return `\x00UNDERLINE_START\x00${display}\x00UNDERLINE_END\x00`;
  });

  // Replace bold
  cleaned = cleaned.replace(BOLD_REGEX, (_match, content: string) => {
    return `\x00BOLD_START\x00${content}\x00BOLD_END\x00`;
  });

  // Replace italic
  cleaned = cleaned.replace(
    ITALIC_ASTERISK_REGEX,
    (_match, content: string) => {
      return `\x00ITALIC_START\x00${content}\x00ITALIC_END\x00`;
    },
  );

  // Replace code
  cleaned = cleaned.replace(CODE_REGEX, (_match, content: string) => {
    return `\x00CODE_START\x00${content}\x00CODE_END\x00`;
  });

  // Replace strikethrough
  cleaned = cleaned.replace(STRIKETHROUGH_REGEX, (_match, content: string) => {
    return `\x00STRIKE_START\x00${content}\x00STRIKE_END\x00`;
  });

  // Clean up whitespace
  cleaned = cleaned.replace(/  +/g, " ").trim();

  // Now parse the marked string into segments
  const segments: TextSegment[] = [];
  let current = "";
  let inBold = false;
  let inItalic = false;
  let inUnderline = false;
  let inCode = false;
  let inStrike = false;

  const parts = cleaned.split("\x00");
  for (const part of parts) {
    if (part === "BOLD_START") {
      if (current) segments.push({ text: current });
      current = "";
      inBold = true;
    } else if (part === "BOLD_END") {
      if (current) segments.push({ text: current, bold: true });
      current = "";
      inBold = false;
    } else if (part === "ITALIC_START") {
      if (current) segments.push({ text: current });
      current = "";
      inItalic = true;
    } else if (part === "ITALIC_END") {
      if (current) segments.push({ text: current, italic: true });
      current = "";
      inItalic = false;
    } else if (part === "UNDERLINE_START") {
      if (current) segments.push({ text: current });
      current = "";
      inUnderline = true;
    } else if (part === "UNDERLINE_END") {
      if (current) segments.push({ text: current, underline: true, dim: true });
      current = "";
      inUnderline = false;
    } else if (part === "CODE_START") {
      if (current) segments.push({ text: current });
      current = "";
      inCode = true;
    } else if (part === "CODE_END") {
      if (current) segments.push({ text: current, color: "cyan" });
      current = "";
      inCode = false;
    } else if (part === "STRIKE_START") {
      if (current) segments.push({ text: current });
      current = "";
      inStrike = true;
    } else if (part === "STRIKE_END") {
      if (current) {
        segments.push({ text: current, strikethrough: true, dim: true });
      }
      current = "";
      inStrike = false;
    } else {
      current += part;
    }
  }

  if (current) {
    const seg: TextSegment = { text: current };
    if (inBold) seg.bold = true;
    if (inItalic) seg.italic = true;
    if (inUnderline) {
      seg.underline = true;
      seg.dim = true;
    }
    if (inCode) seg.color = "cyan";
    if (inStrike) {
      seg.strikethrough = true;
      seg.dim = true;
    }
    segments.push(seg);
  }

  return segments;
}

/**
 * Get the plain text length of a rich text string (for truncation calculations).
 * Strips all markdown formatting.
 */
export function richTextLength(text: string): number {
  let cleaned = text.replace(INLINE_FIELD_REGEX, "");
  cleaned = cleaned.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    return content.includes("|") ? (content.split("|")[1] ?? content) : content;
  });
  cleaned = cleaned.replace(BOLD_REGEX, "$1");
  cleaned = cleaned.replace(ITALIC_ASTERISK_REGEX, "$1");
  cleaned = cleaned.replace(CODE_REGEX, "$1");
  cleaned = cleaned.replace(STRIKETHROUGH_REGEX, "$1");
  return cleaned.replace(/  +/g, " ").trim().length;
}

/**
 * Get the plain text version of a rich text string.
 */
export function richTextPlain(text: string): string {
  let cleaned = text.replace(INLINE_FIELD_REGEX, "");
  cleaned = cleaned.replace(WIKI_LINK_REGEX, (_match, content: string) => {
    return content.includes("|") ? (content.split("|")[1] ?? content) : content;
  });
  cleaned = cleaned.replace(BOLD_REGEX, "$1");
  cleaned = cleaned.replace(ITALIC_ASTERISK_REGEX, "$1");
  cleaned = cleaned.replace(CODE_REGEX, "$1");
  cleaned = cleaned.replace(STRIKETHROUGH_REGEX, "$1");
  return cleaned.replace(/  +/g, " ").trim();
}

interface RenderRichOptions {
  /** Override text color (e.g., for selection) */
  color?: string;
  /** Apply dim to all segments */
  dim?: boolean;
  /** Maximum width (truncate with ellipsis if exceeded) */
  maxWidth?: number;
}

/**
 * Render markdown text as OpenTUI JSX elements with styling.
 *
 * Transformations:
 * - Strips inline fields: [due:: 2024-01-15] → ""
 * - Styles wiki links: [[note]] → dim underlined "note"
 * - Styles **bold** → bold
 * - Styles *italic* → italic
 * - Styles `code` → cyan
 * - Styles ~~strikethrough~~ → dim strikethrough
 *
 * @example
 * <text>
 *   {renderRichJsx("Task with **bold** and [[link]]")}
 * </text>
 */
export function renderRichJsx(
  text: string,
  options: RenderRichOptions = {},
): ReactNode {
  const { color, dim, maxWidth } = options;

  // Get plain text for truncation calculation
  let plainText = richTextPlain(text);
  let truncated = false;

  if (maxWidth && plainText.length > maxWidth) {
    // Need to truncate - for simplicity, truncate the source text
    // This is a rough approximation; for precise truncation we'd need
    // to track character positions through the transformations
    truncated = true;
    plainText = plainText.slice(0, maxWidth - 1);
  }

  // Parse into styled segments
  const segments = parseRichText(truncated ? text : text);

  // If truncated, we need to rebuild segments to fit
  if (truncated && maxWidth) {
    let remaining = maxWidth - 1; // -1 for ellipsis
    const truncatedSegments: TextSegment[] = [];

    for (const seg of segments) {
      if (remaining <= 0) break;
      if (seg.text.length <= remaining) {
        truncatedSegments.push(seg);
        remaining -= seg.text.length;
      } else {
        truncatedSegments.push({ ...seg, text: seg.text.slice(0, remaining) });
        remaining = 0;
      }
    }

    // Add ellipsis
    truncatedSegments.push({ text: "…" });

    return truncatedSegments.map((seg, i) => (
      <text
        key={i}
        color={color ?? seg.color}
        bold={seg.bold}
        italic={seg.italic}
        underline={seg.underline}
        strikethrough={seg.strikethrough}
        dim={dim || seg.dim}
      >
        {seg.text}
      </text>
    ));
  }

  // No truncation needed, render all segments
  if (segments.length === 0) {
    return null;
  }

  const firstSeg = segments[0];
  if (segments.length === 1 && firstSeg && !firstSeg.bold && !firstSeg.italic) {
    // Simple case: single unstyled segment
    return firstSeg.text;
  }

  return segments.map((seg, i) => (
    <text
      key={i}
      color={color ?? seg.color}
      bold={seg.bold}
      italic={seg.italic}
      underline={seg.underline}
      strikethrough={seg.strikethrough}
      dim={dim || seg.dim}
    >
      {seg.text}
    </text>
  ));
}
