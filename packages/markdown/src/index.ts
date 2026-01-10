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
  parseWikiLinks,
} from "../../../src/md/parser.ts";
export type { WikiLink } from "../../../src/md/parser.ts";

// AST to nodes conversion
export {
  parseMarkdownToNodes,
  parseMarkdownWithLinks,
  buildNodeTree,
} from "../../../src/md/ast2nodes.ts";
export type { ParseResult } from "../../../src/md/ast2nodes.ts";

// Nodes to markdown conversion
export { nodesToMarkdown, regenerateFile } from "../../../src/md/nodes2md.ts";
