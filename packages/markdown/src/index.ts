/**
 * @km/markdown - Markdown parsing and conversion
 *
 * Re-exports from src/md for backwards compatibility
 */

// Parser
export {
  parseMarkdown,
  extractFrontmatter,
  extractTaskMark,
  nodeToText,
  slugify,
  parseTaskMetadata,
  extractTags,
} from "../../../src/md/parser.ts";

// AST to nodes conversion
export { parseMarkdownToNodes, buildNodeTree } from "../../../src/md/ast2nodes.ts";

// Nodes to markdown conversion
export { nodesToMarkdown, nodeToMarkdown } from "../../../src/md/nodes2md.ts";
