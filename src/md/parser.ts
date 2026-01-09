/**
 * Markdown Parser
 *
 * Parses markdown content into AST using mdast
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { Root, Content, ListItem, Heading, Paragraph, List } from "mdast";

// Re-export types
export type { Root, Content, ListItem, Heading, Paragraph, List };

/**
 * Extended ListItem with task mark
 */
export interface TaskListItem extends ListItem {
  taskMark?: string; // ' ' | 'x' | 'X' | '/' | '-' | '1' | '2' | '?'
}

/**
 * WikiLink node (Obsidian style)
 */
export interface WikiLink {
  type: "wikiLink";
  target: string;
  section?: string;
  blockId?: string;
  alias?: string;
}

/**
 * Parse markdown content into AST
 */
export function parseMarkdown(content: string): Root {
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  return tree;
}

/**
 * Extract frontmatter from markdown content
 * Returns { frontmatter, content } where content has frontmatter removed
 */
export function extractFrontmatter(content: string): {
  frontmatter: string | null;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (match) {
    return {
      frontmatter: match[1],
      body: match[2],
    };
  }

  return {
    frontmatter: null,
    body: content,
  };
}

/**
 * Extract the task mark from a list item's source text
 */
export function extractTaskMark(
  content: string,
  position?: { start: { offset: number } },
): string | undefined {
  if (!position) return undefined;

  const slice = content.slice(
    position.start.offset,
    position.start.offset + 20,
  );
  const match = slice.match(/^\s*[-*+]\s*\[([ xX/\-12?])\]/);

  return match?.[1];
}

/**
 * Parse wikilinks from text
 */
export function parseWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  const regex =
    /\[\[([^\]|#^]+)(?:#([^\]|^]+))?(?:\^([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    links.push({
      type: "wikiLink",
      target: match[1],
      section: match[2],
      blockId: match[3],
      alias: match[4],
    });
  }

  return links;
}

/**
 * Extract tags from text (#tag-name)
 */
export function extractTags(text: string): string[] {
  const regex = /#([a-zA-Z0-9_-]+)/g;
  const tags: string[] = [];

  let match;
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1]);
  }

  return tags;
}

/**
 * Parse task metadata (Obsidian Tasks compatible)
 * Extracts: due date, scheduled date, priority
 */
export function parseTaskMetadata(text: string): {
  dueDate?: string;
  scheduledDate?: string;
  priority?: number;
  recurrence?: string;
} {
  const result: {
    dueDate?: string;
    scheduledDate?: string;
    priority?: number;
    recurrence?: string;
  } = {};

  // Due date: 📅 2024-01-15
  const dueMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
  if (dueMatch) {
    result.dueDate = dueMatch[1];
  }

  // Scheduled date: ⏳ 2024-01-10
  const scheduledMatch = text.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
  if (scheduledMatch) {
    result.scheduledDate = scheduledMatch[1];
  }

  // Priority: ⏫ (high), 🔼 (medium), 🔽 (low)
  if (text.includes("⏫")) {
    result.priority = 1;
  } else if (text.includes("🔼")) {
    result.priority = 2;
  } else if (text.includes("🔽")) {
    result.priority = 3;
  }

  // Recurrence: 🔁 every week
  const recurrenceMatch = text.match(/🔁\s*(.+?)(?:\s*[📅⏳⏫🔼🔽]|$)/);
  if (recurrenceMatch) {
    result.recurrence = recurrenceMatch[1].trim();
  }

  return result;
}

/**
 * Convert mdast node to plain text
 */
export function nodeToText(node: Content | Root): string {
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }

  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToText(child as Content)).join("");
  }

  return "";
}

/**
 * Generate a URL-safe slug from heading text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/\s+/g, "-") // Replace spaces with dashes
    .replace(/-+/g, "-") // Collapse multiple dashes
    .replace(/^-|-$/g, ""); // Remove leading/trailing dashes
}
