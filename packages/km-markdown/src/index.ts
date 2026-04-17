// Parser
export {
  parseMarkdown,
  extractFrontmatter,
  extractTitleTaskMarker,
  parseWikiLinks,
  extractTags,
  extractMentions,
  extractProjects,
  extractAllRefs,
  parseTaskMetadata,
  parseInlineProperties,
  serializeRules,
  nodeToText,
  listItemToText,
  slugify,
  normalizeNodeName,
} from "./parser.ts"

export type {
  Root,
  RootContent,
  ListItem,
  Heading,
  Paragraph,
  List,
  TaskListItem,
  WikiLink,
  PropertyValue,
  MdForm,
} from "./parser.ts"

// Canonical href normalizer. See docs/design/model/klink.md and @km/core for
// the KLink type and MdForm.
export { normalizeLinkHref } from "./link-href.ts"

// kmast types and extensions
export type { KmWikilink } from "./kast/types.ts"
export { km, kmFromMarkdown } from "./extensions/index.ts"
export {
  kmTaskMark,
  kmTaskMarkFromMarkdown,
  kmWikilink,
  kmWikilinkFromMarkdown,
  kmBlockIdTransform,
  kmHeadingTaskMarkTransform,
  kmInlinePropTransform,
  kmRefsTransform,
} from "./extensions/index.ts"

// AST to nodes
export { parseMarkdownToNodes, parseMarkdownWithLinks, parsePlainTextToNodes, buildNodeTree } from "./ast2nodes.ts"

export type { ParseResult, ParseWarning, ExtractedLink } from "./ast2nodes.ts"

// Nodes to markdown
export { nodesToMarkdown, regenerateFile } from "./nodes2md.ts"
