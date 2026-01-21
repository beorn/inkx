/**
 * AST to Nodes Converter
 *
 * Converts mdast AST into km nodes
 */

import createDebug from "debug";
import { ulid } from "ulid";

const debug = createDebug("km:markdown:parser");
import type { Root, Content, Heading, List, ListItem, Paragraph } from "mdast";
import { parse as parseYaml } from "yaml";
import type { KNode, NodeType, TaskStatus, TaskMark } from "@km/core";
import { CUSTOM_TASK_MARKS } from "@km/core";
import {
  parseMarkdown,
  extractFrontmatter,
  extractTaskMark,
  nodeToText,
  listItemToText,
  slugify,
  parseTaskMetadata,
  extractTags,
  extractMentions,
  extractProjects,
  parseWikiLinks,
  parseHeadingRules,
  parseInlineProperties,
} from "./parser.ts";
import type { WikiLink } from "./parser.ts";

/**
 * Parse warning for structural issues
 */
export interface ParseWarning {
  type: "missing_h1" | "multiple_h1";
  message: string;
  line?: number;
}

/**
 * Result of parsing markdown with wikilinks
 */
export interface ParseResult {
  nodes: KNode[];
  wikilinks: Array<{ nodeId: string; link: WikiLink }>;
  warnings: ParseWarning[];
}

/**
 * Parse a markdown file into km nodes
 */
export function parseMarkdownToNodes(
  content: string,
  fsPath: string,
  fsIno?: number,
): KNode[] {
  return parseMarkdownWithLinks(content, fsPath, fsIno).nodes;
}

/**
 * Parse a markdown file into km nodes with wikilink extraction
 */
export function parseMarkdownWithLinks(
  content: string,
  fsPath: string,
  fsIno?: number,
  fsMtime?: number,
): ParseResult {
  debug("parsing %s (%d bytes)", fsPath, content.length);
  const start = Date.now();

  const { frontmatter, body } = extractFrontmatter(content);
  const ast = parseMarkdown(body);
  const now = Date.now();

  // Extract name from filesystem path (filename without .md)
  const filename = fsPath.split("/").pop() || "";
  const name = filename.replace(/\.md$/i, "");

  // Create file node
  const fileNode: KNode = {
    id: ulid(),
    type: "file",
    parent_id: null, // Will be set based on folder structure
    parent_idx: 0,
    link_to: null,
    fs_path: fsPath,
    fs_ino: fsIno,
    fs_mtime: fsMtime,
    name, // Slug/identifier derived from filename
    content: undefined,
    content_hash: undefined,
    data: frontmatter ? parseFrontmatter(frontmatter) : {},
    created_at: now,
    updated_at: now,
    version: "",
  };

  // Convert AST to nodes
  let childNodes = astToNodes(ast, fileNode, body);

  // Merge H1 section into file node (file + H1 = one conceptual node)
  // The H1 title becomes the file's title, and H1's children become file's children
  const h1Section = childNodes.find(
    (n) => n.type === "section" && n.data?.depth === 1,
  );

  if (h1Section) {
    // Copy H1 properties to file node
    fileNode.title = h1Section.title;
    fileNode.content = h1Section.content;
    fileNode.md_pos = h1Section.md_pos;
    fileNode.md_slug = h1Section.md_slug;
    if (h1Section.rules) {
      fileNode.rules = h1Section.rules;
    }
    // Merge H1's data into file data, but frontmatter takes precedence
    // (frontmatter fields overwrite H1 data fields)
    if (h1Section.data) {
      fileNode.data = { ...h1Section.data, ...fileNode.data };
    }
    // Store H1 title in data for DB persistence (only if no frontmatter title)
    if (h1Section.title && !fileNode.data?.title) {
      fileNode.data = { ...fileNode.data, title: h1Section.title };
    }

    // Re-parent H1's children to the file node
    childNodes = childNodes.filter((n) => n.id !== h1Section.id);
    for (const child of childNodes) {
      if (child.parent_id === h1Section.id) {
        child.parent_id = fileNode.id;
      }
    }
  }

  const allNodes = [fileNode, ...childNodes];

  // Extract wikilinks from all nodes with content
  const wikilinks: Array<{ nodeId: string; link: WikiLink }> = [];
  for (const node of allNodes) {
    if (node.content) {
      const links = parseWikiLinks(node.content);
      for (const link of links) {
        wikilinks.push({ nodeId: node.id, link });
      }
    }
  }

  // Aggregate mentions, tags, projects from all child nodes to file node
  // This enables queries like @issue to find files where any child has that mention
  const aggregatedMentions = new Set<string>();
  const aggregatedTags = new Set<string>();
  const aggregatedProjects = new Set<string>();

  for (const node of childNodes) {
    if (node.content) {
      for (const m of extractMentions(node.content)) aggregatedMentions.add(m);
      for (const t of extractTags(node.content)) aggregatedTags.add(t);
      for (const p of extractProjects(node.content)) aggregatedProjects.add(p);
    }
    // Also include from node's own data (for list items that already extracted these)
    const nodeData = node.data as Record<string, unknown> | undefined;
    if (nodeData?.mentions) {
      for (const m of nodeData.mentions as string[]) aggregatedMentions.add(m);
    }
    if (nodeData?.tags) {
      for (const t of nodeData.tags as string[]) aggregatedTags.add(t);
    }
    if (nodeData?.projects) {
      for (const p of nodeData.projects as string[]) aggregatedProjects.add(p);
    }
  }

  // Merge aggregated refs into file node's data, preserving existing values
  const fileData = fileNode.data as Record<string, unknown>;
  const existingMentions = (fileData.mentions as string[] | undefined) || [];
  const existingTags = (fileData.tags as string[] | undefined) || [];
  const existingProjects = (fileData.projects as string[] | undefined) || [];

  for (const m of existingMentions) aggregatedMentions.add(m);
  for (const t of existingTags) aggregatedTags.add(t);
  for (const p of existingProjects) aggregatedProjects.add(p);

  if (aggregatedMentions.size > 0) {
    fileData.mentions = [...aggregatedMentions];
  }
  if (aggregatedTags.size > 0) {
    fileData.tags = [...aggregatedTags];
  }
  if (aggregatedProjects.size > 0) {
    fileData.projects = [...aggregatedProjects];
  }

  // Validate H1 headings - each file should have exactly one
  const warnings: ParseWarning[] = [];
  const h1Count = childNodes.filter(
    (n) => n.type === "section" && n.data?.depth === 1,
  ).length;
  // Add 1 for the merged H1 if it existed
  const totalH1s = h1Section ? h1Count + 1 : h1Count;

  if (totalH1s === 0) {
    warnings.push({
      type: "missing_h1",
      message: `${fsPath}: Missing H1 heading. Each markdown file should have exactly one # heading as its title.`,
    });
  } else if (totalH1s > 1) {
    // Find the second H1 for line number
    const secondH1 = childNodes.find(
      (n) => n.type === "section" && n.data?.depth === 1,
    );
    warnings.push({
      type: "multiple_h1",
      message: `${fsPath}: Multiple H1 headings found (${totalH1s}). Each markdown file should have exactly one # heading.`,
      line: secondH1?.md_line,
    });
  }

  debug("parsed %s: %d nodes, %d wikilinks, %d warnings in %dms",
    fsPath, allNodes.length, wikilinks.length, warnings.length, Date.now() - start);

  return { nodes: allNodes, wikilinks, warnings };
}

/**
 * Parse YAML frontmatter into data object
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
  try {
    const data = parseYaml(yaml) as Record<string, unknown>;
    return data ?? {};
  } catch {
    return {};
  }
}

/**
 * Convert AST children to km nodes
 */
function astToNodes(ast: Root, fileNode: KNode, sourceText: string): KNode[] {
  const nodes: KNode[] = [];
  const sectionStack: Array<{ depth: number; node: KNode }> = [];
  let currentParent = fileNode;
  let sortOrder = 0;
  const now = Date.now();

  for (const child of ast.children) {
    // Handle headings - create section hierarchy
    if (child.type === "heading") {
      const heading = child as Heading;

      // Pop stack until we find a shallower heading
      while (
        sectionStack.length > 0 &&
        sectionStack[sectionStack.length - 1].depth >= heading.depth
      ) {
        sectionStack.pop();
      }

      const text = nodeToText(heading);
      const { title, rules } = parseHeadingRules(text);
      const hasRules = Object.keys(rules).length > 0;
      const sectionName = slugify(title);

      const sectionNode: KNode = {
        id: ulid(),
        type: "section",
        parent_id:
          sectionStack.length > 0
            ? sectionStack[sectionStack.length - 1].node.id
            : fileNode.id,
        parent_idx: sortOrder++,
        link_to: null,
        name: sectionName, // Slug/identifier derived from heading
        md_pos: heading.position?.start.offset,
        md_slug: sectionName, // Keep for backwards compatibility
        content: text, // Keep original content for serialization
        content_hash: undefined,
        title, // Clean title without rules
        rules: hasRules ? rules : undefined, // Only set if rules exist
        data: {
          depth: heading.depth,
          ...(hasRules ? { rules, title } : {}), // Store rules and clean title in data for DB persistence
        },
        created_at: now,
        updated_at: now,
        version: "",
      };

      nodes.push(sectionNode);
      sectionStack.push({ depth: heading.depth, node: sectionNode });
      currentParent = sectionNode;
      continue;
    }

    // Handle lists - create list items/tasks
    if (child.type === "list") {
      const list = child as List;

      for (const item of list.children) {
        const listItem = item as ListItem;
        const itemNodes = convertListItem(
          listItem,
          currentParent,
          list.ordered ?? false,
          sortOrder++,
          sourceText,
        );
        nodes.push(...itemNodes);
      }
      continue;
    }

    // Handle other block types
    const blockNode = convertBlock(child, currentParent, sortOrder++);
    if (blockNode) {
      nodes.push(blockNode);
    }
  }

  return nodes;
}

/**
 * Convert a list item to nodes (may include nested items)
 */
function convertListItem(
  item: ListItem,
  parent: KNode,
  ordered: boolean,
  sortOrder: number,
  sourceText: string,
): KNode[] {
  const nodes: KNode[] = [];
  const now = Date.now();

  let text = listItemToText(item);
  const taskMark = extractTaskMark(sourceText, item.position);

  // A task is either:
  // 1. A GFM task list item (item.checked is boolean) - [ ] or [x]
  // 2. A list item with a custom task mark - [/], [-], [!]
  const isGfmTask = item.checked !== null && item.checked !== undefined;
  const isCustomTask =
    taskMark && (CUSTOM_TASK_MARKS as readonly string[]).includes(taskMark);
  const isTask = isGfmTask || isCustomTask;

  // For custom task marks, mdast includes the mark in the text (e.g., "[/] task content")
  // Strip it to get the clean content
  if (isCustomTask && !isGfmTask) {
    text = text.replace(/^\[.\]\s*/, "");
  }

  // Determine task status from mark
  let taskStatus: TaskStatus | undefined;
  if (isTask) {
    switch (taskMark) {
      case "x":
      case "X":
        taskStatus = "done";
        break;
      case "!":
        taskStatus = "blocked";
        break;
      case "-":
        taskStatus = "dropped";
        break;
      case "/":
        taskStatus = "wip";
        break;
      default:
        taskStatus = "todo";
    }
  }

  // Parse task metadata from text
  const metadata = isTask ? parseTaskMetadata(text) : {};
  const tags = extractTags(text);
  const mentions = extractMentions(text);
  const projects = extractProjects(text);
  const parsedProps = parseInlineProperties(text);

  // Priority from metadata only
  const priority: number | undefined = metadata.priority;

  const node: KNode = {
    id: ulid(),
    type: isTask ? "task" : ordered ? "ol" : "ul",
    parent_id: parent.id,
    parent_idx: sortOrder,
    link_to: null,
    md_pos: item.position?.start.offset,
    md_line: item.position?.start.line
      ? item.position.start.line - 1
      : undefined, // Convert 1-indexed to 0-indexed
    content: text,
    content_hash: undefined,
    task_status: taskStatus,
    task_mark: taskMark as KNode["task_mark"],
    due_date: metadata.dueDate,
    scheduled_date: metadata.scheduledDate,
    priority,
    data: {
      ...(tags.length > 0 ? { tags } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(projects.length > 0 ? { projects } : {}),
      ...(metadata.recurrence ? { recurrence: metadata.recurrence } : {}),
      ...(Object.keys(parsedProps.props).length > 0
        ? { props: parsedProps.props }
        : {}),
      ...(Object.keys(parsedProps.propsRaw).length > 0
        ? { propsRaw: parsedProps.propsRaw }
        : {}),
    },
    created_at: now,
    updated_at: now,
    version: "",
  };

  nodes.push(node);

  // Handle nested lists
  for (const child of item.children) {
    if (child.type === "list") {
      const list = child as List;
      let nestedSort = 0;

      for (const nestedItem of list.children) {
        const nestedNodes = convertListItem(
          nestedItem,
          node,
          list.ordered ?? false,
          nestedSort++,
          sourceText,
        );
        nodes.push(...nestedNodes);
      }
    }
  }

  return nodes;
}

/**
 * Check if text is purely an embedding (nothing but ![[...]])
 * Returns the embedding text if so, null otherwise
 *
 * TODO: Used in Phase 2 of km-xexz for target resolution
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getEmbeddingText(text: string): string | null {
  const trimmed = text.trim();
  // Match ![[...]] with optional section/blockId/alias
  const match = trimmed.match(
    /^!\[\[([^\]|#^]+)(?:#([^\]|^]+))?(?:\^([^\]|]+))?(?:\|([^\]]+))?\]\]$/,
  );
  return match ? trimmed : null;
}

/**
 * Convert a block element to a node
 */
function convertBlock(
  block: Content,
  parent: KNode,
  sortOrder: number,
): KNode | null {
  const now = Date.now();

  let type: NodeType;
  let content: string | null = null;
  const data: Record<string, unknown> = {};

  switch (block.type) {
    case "paragraph": {
      type = "paragraph";
      content = nodeToText(block);
      // TODO: When embedding detected (getEmbeddingText), resolve target and set link_to
      // This requires Phase 2 of km-xexz (target resolution)
      break;
    }

    case "blockquote":
      type = "quote";
      content = nodeToText(block);
      break;

    case "code":
      type = "code";
      content = block.value;
      if (block.lang) {
        data.lang = block.lang;
      }
      if (block.meta) {
        data.meta = block.meta;
      }
      break;

    case "thematicBreak":
      type = "hr";
      break;

    case "table":
      type = "table";
      content = nodeToText(block);
      break;

    case "html":
      type = "html";
      content = block.value;
      break;

    default:
      // Skip unknown types
      return null;
  }

  return {
    id: ulid(),
    type,
    parent_id: parent.id,
    parent_idx: sortOrder,
    link_to: null,
    md_pos: block.position?.start.offset,
    content: content ?? undefined,
    content_hash: undefined,
    data,
    created_at: now,
    updated_at: now,
    version: "",
  };
}

/**
 * Build a tree structure from flat nodes
 */
export function buildNodeTree(nodes: KNode[]): Map<string, KNode[]> {
  const tree = new Map<string, KNode[]>();

  for (const node of nodes) {
    const parentId = node.parent_id ?? "__root__";
    if (!tree.has(parentId)) {
      tree.set(parentId, []);
    }
    tree.get(parentId)?.push(node);
  }

  // Sort children by parent_idx
  for (const children of tree.values()) {
    children.sort((a, b) => a.parent_idx - b.parent_idx);
  }

  return tree;
}
