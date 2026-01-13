/**
 * Nodes to Markdown Converter
 *
 * Serializes km nodes back to markdown format
 */

import { stringify as stringifyYaml } from "yaml";
import type { Node } from "@km/core";
import { buildNodeTree } from "./ast2nodes.ts";

/**
 * Convert nodes to markdown
 */
export function nodesToMarkdown(nodes: Node[]): string {
  if (nodes.length === 0) {
    return "";
  }

  // Build tree structure
  const tree = buildNodeTree(nodes);

  // Find root node (file node)
  const fileNode = nodes.find((n) => n.type === "file");
  if (!fileNode) {
    // No file node, serialize all nodes flat
    return nodes.map((n) => serializeNode(n, tree, 0)).join("");
  }

  return serializeFile(fileNode, tree);
}

/**
 * Serialize a file node (top-level document)
 *
 * The file node may have H1 properties merged in (content, title, rules).
 * We serialize the H1 heading first, then frontmatter (minus depth), then children.
 */
function serializeFile(node: Node, tree: Map<string, Node[]>): string {
  let md = "";

  // Frontmatter - exclude depth (it's internal for H1 merge tracking)
  const frontmatterData = { ...node.data };
  delete frontmatterData.depth;
  delete frontmatterData.rules;
  delete frontmatterData.title;

  if (Object.keys(frontmatterData).length > 0) {
    md += "---\n";
    md += stringifyYaml(frontmatterData);
    md += "---\n\n";
  }

  // H1 heading (merged into file node)
  if (node.content) {
    md += `# ${node.content}\n\n`;
  }

  // Children
  const children = tree.get(node.id) ?? [];
  for (const child of children) {
    md += serializeNode(child, tree, 0);
  }

  return md;
}

/**
 * Serialize a single node
 */
function serializeNode(
  node: Node,
  tree: Map<string, Node[]>,
  indent: number,
): string {
  const children = tree.get(node.id) ?? [];

  switch (node.type) {
    case "file":
      return serializeFile(node, tree);

    case "section":
      return serializeSection(node, children, tree);

    case "paragraph":
      return (node.content ?? "") + "\n\n";

    case "quote":
      return serializeQuote(node);

    case "code":
      return serializeCode(node);

    case "ul":
      return serializeListItem(node, children, tree, indent, false);

    case "ol":
      return serializeListItem(node, children, tree, indent, true);

    case "task":
      return serializeTask(node, children, tree, indent);

    case "hr":
      return "---\n\n";

    case "table":
      return (node.content ?? "") + "\n\n";

    case "html":
      return (node.content ?? "") + "\n\n";

    default:
      return node.content ? node.content + "\n" : "";
  }
}

/**
 * Serialize a section (heading + children)
 */
function serializeSection(
  node: Node,
  children: Node[],
  tree: Map<string, Node[]>,
): string {
  const depth = (node.data?.depth as number) ?? 1;
  const prefix = "#".repeat(depth);
  let md = `${prefix} ${node.content ?? ""}\n\n`;

  for (const child of children) {
    md += serializeNode(child, tree, 0);
  }

  return md;
}

/**
 * Serialize a blockquote
 */
function serializeQuote(node: Node): string {
  const content = node.content ?? "";
  const lines = content.split("\n");
  return lines.map((l) => "> " + l).join("\n") + "\n\n";
}

/**
 * Serialize a code block
 */
function serializeCode(node: Node): string {
  const lang = (node.data?.lang as string) ?? "";
  const meta = (node.data?.meta as string) ?? "";
  const header = lang + (meta ? " " + meta : "");
  return "```" + header + "\n" + (node.content ?? "") + "\n```\n\n";
}

/**
 * Serialize a list item
 */
function serializeListItem(
  node: Node,
  children: Node[],
  tree: Map<string, Node[]>,
  indent: number,
  ordered: boolean,
): string {
  const indentStr = "  ".repeat(indent);
  const marker = ordered ? "1." : "-";
  let md = `${indentStr}${marker} ${node.content ?? ""}\n`;

  // Nested items
  for (const child of children) {
    if (child.type === "ul" || child.type === "ol" || child.type === "task") {
      md += serializeNode(child, tree, indent + 1);
    }
  }

  // Add trailing newline only at top level
  if (indent === 0) {
    md += "\n";
  }

  return md;
}

/**
 * Serialize a task item
 */
function serializeTask(
  node: Node,
  children: Node[],
  tree: Map<string, Node[]>,
  indent: number,
): string {
  const indentStr = "  ".repeat(indent);
  const mark = node.task_mark ?? " ";
  let content = node.content ?? "";

  // Add task metadata if not already in content
  const metadata: string[] = [];

  if (node.due_date && !content.includes("📅")) {
    metadata.push(`📅 ${node.due_date}`);
  }

  if (node.scheduled_date && !content.includes("⏳")) {
    metadata.push(`⏳ ${node.scheduled_date}`);
  }

  if (node.priority && !content.match(/[⏫🔼🔽]/)) {
    if (node.priority === 1) metadata.push("⏫");
    else if (node.priority === 2) metadata.push("🔼");
    else if (node.priority === 3) metadata.push("🔽");
  }

  if (metadata.length > 0 && content) {
    content += " " + metadata.join(" ");
  }

  let md = `${indentStr}- [${mark}] ${content}\n`;

  // Nested items
  for (const child of children) {
    if (child.type === "ul" || child.type === "ol" || child.type === "task") {
      md += serializeNode(child, tree, indent + 1);
    }
  }

  // Add trailing newline only at top level
  if (indent === 0) {
    md += "\n";
  }

  return md;
}

/**
 * Regenerate a file's markdown from its nodes
 */
export function regenerateFile(fileNodeId: string, allNodes: Node[]): string {
  // Filter to just this file's nodes
  const fileNodes = getFileSubtree(fileNodeId, allNodes);
  return nodesToMarkdown(fileNodes);
}

/**
 * Get all nodes belonging to a file
 */
function getFileSubtree(fileId: string, allNodes: Node[]): Node[] {
  const result: Node[] = [];
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  function addWithDescendants(nodeId: string) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    result.push(node);

    // Find children
    for (const n of allNodes) {
      if (n.parent_id === nodeId) {
        addWithDescendants(n.id);
      }
    }
  }

  addWithDescendants(fileId);
  return result;
}
