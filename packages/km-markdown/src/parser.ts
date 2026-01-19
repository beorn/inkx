/**
 * Markdown Parser
 *
 * Parses markdown content into AST using mdast
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { Root, Content, ListItem, Heading, Paragraph, List } from "mdast";
import { TASK_MARK_REGEX_CLASS } from "@km/core";

// Re-export types
export type { Root, Content, ListItem, Heading, Paragraph, List };

/**
 * Extended ListItem with task mark
 */
export interface TaskListItem extends ListItem {
  taskMark?: string; // See TaskMark type in @km/core
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
  /** True for embeddings (![[...]]) which should transclude content */
  embedded?: boolean;
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
  // Build regex dynamically from the task mark character class constant
  const regex = new RegExp(`^\\s*[-*+]\\s*\\[(${TASK_MARK_REGEX_CLASS})\\]`);
  const match = slice.match(regex);

  return match?.[1];
}

/**
 * Parse wikilinks from text
 * Detects both regular links [[...]] and embeddings ![[...]]
 */
export function parseWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = [];
  // Match optional ! prefix before [[
  const regex =
    /(!?)\[\[([^\]|#^]+)(?:#([^\]|^]+))?(?:\^([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const isEmbedded = match[1] === "!";
    links.push({
      type: "wikiLink",
      target: match[2] ?? "",
      section: match[3],
      blockId: match[4],
      alias: match[5],
      embedded: isEmbedded || undefined, // Only set if true
    });
  }

  return links;
}

/**
 * Generic helper to extract regex matches from text
 * Returns the first capture group from all matches
 */
function extractMatches(text: string, regex: RegExp): string[] {
  return [...text.matchAll(regex)]
    .map((m) => m[1])
    .filter((m): m is string => !!m);
}

/**
 * Extract tags from text (#tag-name)
 */
export function extractTags(text: string): string[] {
  return extractMatches(text, /#([a-zA-Z0-9_-]+)/g);
}

/**
 * Extract mentions from text (@person)
 */
export function extractMentions(text: string): string[] {
  return extractMatches(text, /@([a-zA-Z0-9_-]+)/g);
}

/**
 * Extract projects from text (+project-name)
 */
export function extractProjects(text: string): string[] {
  return extractMatches(text, /\+([a-zA-Z0-9_-]+)/g);
}

/**
 * Parse task metadata (supports multiple formats)
 * Extracts: due date, scheduled date, priority, recurrence
 *
 * Supported formats:
 * - Obsidian Tasks: 📅 2024-01-15, ⏳ 2024-01-10, ⏫/🔼/🔽, 🔁 every week
 * - Inline fields: due:2024-01-15, start:2024-01-10, p:1
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

  // Due date: 📅 2024-01-15 OR due:2024-01-15
  const dueMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
  if (dueMatch) {
    result.dueDate = dueMatch[1];
  }
  const dueInlineMatch = text.match(/\bdue:(\d{4}-\d{2}-\d{2})\b/);
  if (dueInlineMatch && !result.dueDate) {
    result.dueDate = dueInlineMatch[1];
  }

  // Scheduled date: ⏳ 2024-01-10 OR start:2024-01-10
  const scheduledMatch = text.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
  if (scheduledMatch) {
    result.scheduledDate = scheduledMatch[1];
  }
  const startInlineMatch = text.match(/\bstart:(\d{4}-\d{2}-\d{2})\b/);
  if (startInlineMatch && !result.scheduledDate) {
    result.scheduledDate = startInlineMatch[1];
  }

  // Priority: ⏫ (high=1), 🔼 (medium=2), 🔽 (low=3) OR p:1, p:2, p:3
  if (text.includes("⏫")) {
    result.priority = 1;
  } else if (text.includes("🔼")) {
    result.priority = 2;
  } else if (text.includes("🔽")) {
    result.priority = 3;
  }
  const priorityInlineMatch = text.match(/\bp:([1-9])\b/);
  if (priorityInlineMatch && priorityInlineMatch[1] && !result.priority) {
    result.priority = parseInt(priorityInlineMatch[1], 10);
  }

  // Recurrence: 🔁 every week
  const recurrenceMatch = text.match(/🔁\s*(.+?)(?:\s*[📅⏳⏫🔼🔽]|$)/);
  if (recurrenceMatch) {
    result.recurrence = recurrenceMatch[1].trim();
  }

  return result;
}

/**
 * Section/column rules parsed from inline attributes
 */
export interface SectionRules {
  add?: string; // Query to auto-pull matching tasks
  sync?: string; // Bidirectional field sync (e.g., "status:blocked")
  collapse?: boolean; // Start collapsed
  limit?: number; // WIP limit
  default?: boolean; // Default column for new items
  color?: string; // Board/section color (cyan, yellow, magenta, etc.)
}

/**
 * Result of parsing heading text
 */
export interface ParsedHeading {
  title: string; // Clean title without rules
  rules: SectionRules; // Extracted rules
}

/**
 * Parse heading text to extract title and inline rules
 *
 * Format: "Column Name add=\"query\" sync=field:value collapse=true limit=3"
 * Returns: { title: "Column Name", rules: { add: "query", sync: "field:value", ... } }
 */
export function parseHeadingRules(text: string): ParsedHeading {
  const rules: SectionRules = {};

  // Parse add="query" or add='query'
  const addMatch = text.match(/\badd=["']([^"']+)["']/);
  if (addMatch) {
    rules.add = addMatch[1];
  }

  // Parse sync=field:value (no quotes needed for simple values)
  // Exclude backticks from the value capture since attributes may be wrapped in backticks
  const syncMatch = text.match(/\bsync=["']?([^\s"'`]+)["']?/);
  if (syncMatch) {
    rules.sync = syncMatch[1];
  }

  // Parse collapse=true
  if (/\bcollapse=true\b/i.test(text)) {
    rules.collapse = true;
  }

  // Parse limit=N
  const limitMatch = text.match(/\blimit=(\d+)/);
  if (limitMatch) {
    rules.limit = parseInt(limitMatch[1] || "0", 10);
  }

  // Parse default=true
  if (/\bdefault=true\b/i.test(text)) {
    rules.default = true;
  }

  // Parse color=value (no quotes needed for simple color names)
  const colorMatch = text.match(/\bcolor=["']?([^\s"'`]+)["']?/);
  if (colorMatch) {
    rules.color = colorMatch[1];
  }

  // Extract title by removing all rule attributes
  // Supports both plain and backtick-wrapped syntax:
  //   ## Column add="query"
  //   ## Column `add="query"`
  const title = text
    // Plain syntax
    .replace(/\s+add=["'][^"']*["']/g, "")
    .replace(/\s+sync=["']?[^\s"']+["']?/g, "")
    .replace(/\s+collapse=\w+/gi, "")
    .replace(/\s+limit=\d+/g, "")
    .replace(/\s+default=\w+/gi, "")
    .replace(/\s+color=["']?[^\s"']+["']?/g, "")
    // Backtick-wrapped syntax (common in markdown for code-like attributes)
    .replace(/\s*`add=["'][^"']*["']`/g, "")
    .replace(/\s*`sync=["']?[^\s"'`]+["']?`/g, "")
    .replace(/\s*`collapse=\w+`/gi, "")
    .replace(/\s*`limit=\d+`/g, "")
    .replace(/\s*`default=\w+`/gi, "")
    .replace(/\s*`color=["']?[^\s"'`]+["']?`/g, "")
    .trim();

  return { title, rules };
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
 * Extract text content from a list item, excluding nested lists.
 * Only extracts text from direct paragraph/text content, not from child lists.
 */
export function listItemToText(item: Content): string {
  if (!("children" in item) || !Array.isArray(item.children)) {
    return nodeToText(item);
  }

  // Only process direct content (paragraphs, text), not nested lists
  return item.children
    .filter((child: Content) => child.type !== "list")
    .map((child: Content) => nodeToText(child))
    .join("");
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
