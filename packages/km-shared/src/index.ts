export {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
} from "./tree.ts";

export type { CollapsedAncestor, GetChildrenFn, GetNodeFn } from "./tree.ts";

export {
  getStatusIcon,
  getTypeIcon,
  getNodeIcon,
  COLORED_CIRCLE,
} from "./icons.ts";

export type { StatusIcon } from "./icons.ts";
