/**
 * Tree Utilities
 *
 * Re-exports from @km/tree for backward compatibility.
 * @deprecated Import directly from @km/tree instead.
 */

export {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
  type GetChildrenFn,
  type GetNodeFn,
  type CollapsedAncestor,
} from "@km/tree";
