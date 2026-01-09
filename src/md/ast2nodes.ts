/**
 * AST to Nodes Converter
 *
 * Converts mdast AST into km nodes
 */

import { ulid } from "ulid";
import type { Root, Content, Heading, List, ListItem, Paragraph } from "mdast";
import { parse as parseYaml } from "yaml";
import type { Node, NodeType, TaskStatus } from "../node/types.ts";
import {
  parseMarkdown,
  extractFrontmatter,
  extractTaskMark,
  nodeToText,
  slugify,
  parseTaskMetadata,
  extractTags,
} from "./parser.ts";

/**
 * Parse a markdown file into km nodes
 */
export function parseMarkdownToNodes(
  content: string,
  fsPath: string,
  fsIno?: number
): Node[] {
  const { frontmatter, body } = extractFrontmatter(content);
  const ast = parseMarkdown(body);
  const now = Date.now();

  // Create file node
  const fileNode: Node = {
    id: ulid(),
    type: "file",
    parent_id: null, // Will be set based on folder structure
    sort_order: 0,
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
  const childNodes = astToNodes(ast, fileNode, body);

  return [fileNode, ...childNodes];
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
      const sectionNode: Node = {
        id: ulid(),
        type: "section",
        parent_id:
          sectionStack.length > 0
            ? sectionStack[sectionStack.length - 1].node.id
            : fileNode.id,
        sort_order: sortOrder++,
        symlink_to: null,
        md_pos: heading.position?.start.offset,
        md_slug: slugify(text),
        content: text,
        content_hash: null,
        data: { depth: heading.depth },
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
          sourceText
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
  sourceText: string
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
      case "/":
        taskStatus = "in_progress";
        break;
      case "-":
        taskStatus = "cancelled";
        break;
      case "?":
        taskStatus = "blocked";
        break;
      default:
        taskStatus = "open";
    }
  }

  // Parse task metadata from text
  const metadata = isTask ? parseTaskMetadata(text) : {};
  const tags = extractTags(text);

  // Determine priority from mark or metadata
  let priority: number | undefined = metadata.priority;
  if (taskMark === "1") priority = 1;
  if (taskMark === "2") priority = 2;

  const node: Node = {
    id: ulid(),
    type: isTask ? "task" : ordered ? "ol" : "ul",
    parent_id: parent.id,
    sort_order: sortOrder,
    symlink_to: null,
    md_pos: item.position?.start.offset,
    content: text,
    content_hash: null,
    task_status: taskStatus,
    task_mark: taskMark,
    due_date: metadata.dueDate,
    scheduled_date: metadata.scheduledDate,
    priority,
    data: {
      ...(tags.length > 0 ? { tags } : {}),
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
          sourceText
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
  sortOrder: number
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
    sort_order: sortOrder,
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
    tree.get(parentId)!.push(node);
  }

  // Sort children by sort_order
  for (const children of tree.values()) {
    children.sort((a, b) => a.sort_order - b.sort_order);
  }

  return tree;
}
