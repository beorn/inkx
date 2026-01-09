/**
 * Markdown module
 *
 * Re-exports markdown parsing and serialization functionality
 */

// Parser
export {
  parseMarkdown,
  extractFrontmatter,
  extractTaskMark,
  parseWikiLinks,
  extractTags,
  parseTaskMetadata,
  nodeToText,
  slugify,
} from "./parser.ts";

export type { WikiLink, TaskListItem } from "./parser.ts";

// AST to Nodes
export { parseMarkdownToNodes, buildNodeTree } from "./ast2nodes.ts";

// Nodes to Markdown
export { nodesToMarkdown, regenerateFile } from "./nodes2md.ts";
