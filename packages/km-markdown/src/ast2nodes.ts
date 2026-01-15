/**
 * AST to Nodes Converter
 *
 * Converts mdast AST into km nodes
 */

import { ulid } from "ulid";
import type { Root, Content, Heading, List, ListItem, Paragraph } from "mdast";
import { parse as parseYaml } from "yaml";
import type { Node, NodeType, TaskStatus } from "@km/core";
import {
  parseMarkdown,
  extractFrontmatter,
  extractTaskMark,
  nodeToText,
  slugify,
  parseTaskMetadata,
  extractTags,
  extractMentions,
  extractProjects,
  parseWikiLinks,
  parseHeadingRules,
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
  nodes: Node[];
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
): Node[] {
  return parseMarkdownWithLinks(content, fsPath, fsIno).nodes;
}

/**
 * Parse a markdown file into km nodes with wikilink extraction
 */
export function parseMarkdownWithLinks(
  content: string,
  fsPath: string,
  fsIno?: number,
): ParseResult {
  const { frontmatter, body } = extractFrontmatter(content);
  const ast = parseMarkdown(body);
  const now = Date.now();

  // Create file node
  const fileNode: Node = {
    id: ulid(),
    type: "file",
    parent_id: null, // Will be set based on folder structure
    parent_idx: 0,
    symlink_to: null,
    fs_path: fsPath,
    fs_ino: fsIno,
    content: null,
    content_hash: null,
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
function astToNodes(ast: Root, fileNode: Node, sourceText: string): Node[] {
  const nodes: Node[] = [];
  const sectionStack: Array<{ depth: number; node: Node }> = [];
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

      const sectionNode: Node = {
        id: ulid(),
        type: "section",
        parent_id:
          sectionStack.length > 0
            ? sectionStack[sectionStack.length - 1].node.id
            : fileNode.id,
        parent_idx: sortOrder++,
        symlink_to: null,
        md_pos: heading.position?.start.offset,
        md_slug: slugify(title),
        content: text, // Keep original content for serialization
        content_hash: null,
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
  parent: Node,
  ordered: boolean,
  sortOrder: number,
  sourceText: string,
): Node[] {
  const nodes: Node[] = [];
  const now = Date.now();

  const isTask = item.checked !== null && item.checked !== undefined;
  const text = nodeToText(item);
  const taskMark = extractTaskMark(sourceText, item.position);

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

  // Priority from metadata only
  const priority: number | undefined = metadata.priority;

  const node: Node = {
    id: ulid(),
    type: isTask ? "task" : ordered ? "ol" : "ul",
    parent_id: parent.id,
    parent_idx: sortOrder,
    symlink_to: null,
    md_pos: item.position?.start.offset,
    md_line: item.position?.start.line
      ? item.position.start.line - 1
      : undefined, // Convert 1-indexed to 0-indexed
    content: text,
    content_hash: null,
    task_status: taskStatus,
    task_mark: taskMark,
    due_date: metadata.dueDate,
    scheduled_date: metadata.scheduledDate,
    priority,
    data: {
      ...(tags.length > 0 ? { tags } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(projects.length > 0 ? { projects } : {}),
      ...(metadata.recurrence ? { recurrence: metadata.recurrence } : {}),
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
 * Convert a block element to a node
 */
function convertBlock(
  block: Content,
  parent: Node,
  sortOrder: number,
): Node | null {
  const now = Date.now();

  let type: NodeType;
  let content: string | null = null;
  const data: Record<string, unknown> = {};

  switch (block.type) {
    case "paragraph":
      type = "paragraph";
      content = nodeToText(block);
      break;

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
    symlink_to: null,
    md_pos: block.position?.start.offset,
    content,
    content_hash: null,
    data,
    created_at: now,
    updated_at: now,
    version: "",
  };
}

/**
 * Build a tree structure from flat nodes
 */
export function buildNodeTree(nodes: Node[]): Map<string, Node[]> {
  const tree = new Map<string, Node[]>();

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
