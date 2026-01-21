/**
 * Beads Query Functions
 *
 * Query issues from the km database.
 */

import { queryNodes, getNode } from "@km/storage";
import type { KNode } from "@km/core";
import type { Issue, IssueFilter } from "./types.ts";

/**
 * Get the file path for a node (either direct fs_path or from ancestor)
 */
function getNodePath(node: KNode): string | undefined {
  if (node.fs_path) {
    return node.fs_path;
  }
  // For embedded nodes, try to get parent's path
  if (node.parent_id) {
    const parent = getNode(node.parent_id);
    if (parent) {
      return getNodePath(parent);
    }
  }
  return undefined;
}

/**
 * Get parent context for embedded nodes (section/file name)
 */
function getParentContext(node: KNode): string | undefined {
  if (!node.parent_id) {
    return undefined;
  }
  const parent = getNode(node.parent_id);
  if (!parent) {
    return undefined;
  }
  // Return parent's name or title
  return parent.name || parent.title || undefined;
}

/**
 * Convert a KNode to an Issue
 */
export function nodeToIssue(node: KNode): Issue {
  const data = node.data as Record<string, unknown> | undefined;
  const props = data?.props as Record<string, { type: string; target?: string; value?: unknown; values?: Array<{ target: string }> }> | undefined;

  // Extract blocked-by from props
  let blockedBy: string[] | undefined;
  if (props?.["blocked-by"]) {
    const blockedByProp = props["blocked-by"];
    if (blockedByProp.type === "link" && blockedByProp.target) {
      blockedBy = [blockedByProp.target];
    } else if (blockedByProp.type === "list" && blockedByProp.values) {
      blockedBy = blockedByProp.values.map((v) => v.target);
    }
  }

  // Determine status from task_status
  let status: Issue["status"] = "todo";
  switch (node.task_status) {
    case "done":
      status = "done";
      break;
    case "wip":
      status = "wip";
      break;
    case "blocked":
      status = "blocked";
      break;
    case "dropped":
      status = "dropped";
      break;
    default:
      status = blockedBy && blockedBy.length > 0 ? "blocked" : "todo";
  }

  // Extract priority from tags or data
  let priority = 2; // Default to P2 (medium)
  const tags = data?.tags as string[] | undefined;
  if (tags) {
    for (const tag of tags) {
      const pMatch = tag.match(/^P([0-4])$/i);
      if (pMatch) {
        priority = parseInt(pMatch[1]!, 10);
        break;
      }
    }
  }

  // Extract type from tags
  let type: string | undefined;
  const typeKeywords = ["bug", "feature", "epic", "task", "docs", "question"];
  if (tags) {
    for (const tag of tags) {
      if (typeKeywords.includes(tag.toLowerCase())) {
        type = tag.toLowerCase();
        break;
      }
    }
  }

  // Extract assignee from mentions
  const mentions = data?.mentions as string[] | undefined;
  const assignee = mentions?.[0];

  // Get path and context
  const path = getNodePath(node);
  const parentContext = getParentContext(node);

  // Count dependencies
  const dependencyCount = blockedBy?.length || 0;

  return {
    id: node.id,
    shortId: (data?.short_id as string) || `km-${node.id.slice(-4).toLowerCase()}`,
    title: node.content || node.title || "",
    description: node.content || undefined,
    status,
    priority,
    type,
    assignee,
    blockedBy,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    path,
    parentContext,
    dependencyCount,
    dependentCount: 0, // TODO: Would need reverse lookup
  };
}

/**
 * Check if an issue is blocked (has unresolved blockers)
 */
export async function isBlocked(issue: Issue): Promise<boolean> {
  if (!issue.blockedBy || issue.blockedBy.length === 0) {
    return false;
  }

  // Check if any blocker is not done
  for (const blockerId of issue.blockedBy) {
    const blockers = queryNodes(`short_id:${blockerId}`);
    if (blockers.length > 0) {
      const blocker = nodeToIssue(blockers[0]!);
      if (blocker.status !== "done" && blocker.status !== "dropped") {
        return true;
      }
    }
  }

  return false;
}

/**
 * Query ready issues (unblocked, todo status, sorted by priority)
 * @param filter - Optional filters for type, assignee, priority
 * @param scopePath - Optional path to scope results to (e.g., "/vault/Projects")
 * @param boardTag - Optional board tag to filter by (e.g., "issues" for @issues)
 */
export function queryReady(filter?: Partial<IssueFilter>, scopePath?: string, boardTag?: string): Issue[] {
  // Build query for open tasks
  let query = "status:todo";

  // Add board tag filter if provided (tasks tagged with @board)
  if (boardTag) {
    // Strip @ prefix if present
    const tag = boardTag.startsWith("@") ? boardTag.slice(1) : boardTag;
    query += ` @${tag}`;
  }

  if (filter?.type) {
    query += ` #${filter.type}`;
  }
  if (filter?.assignee) {
    query += ` @${filter.assignee}`;
  }
  if (filter?.priority !== undefined) {
    query += ` #P${filter.priority}`;
  }

  // Don't filter by type='task' - issues can be file nodes with task_status
  const nodes = queryNodes(query);
  let issues = nodes.map(nodeToIssue);

  // Apply path scope filter after query (since path: syntax not supported)
  if (scopePath) {
    issues = issues.filter((issue) => issue.path?.startsWith(scopePath));
  }

  // Filter out blocked issues
  const ready = issues.filter((issue) => {
    // Quick sync check - if has blockedBy, consider blocked
    // Full async check would require isBlocked() call
    return !issue.blockedBy || issue.blockedBy.length === 0;
  });

  // Sort by priority (lower = higher priority)
  ready.sort((a, b) => a.priority - b.priority);

  return ready;
}

/**
 * Query issues with filters
 * @param filter - Optional filters for status, type, assignee, priority, blocked
 * @param scopePath - Optional path to scope results to (e.g., "/vault/Projects")
 * @param boardTag - Optional board tag to filter by (e.g., "issues" for @issues)
 */
export function queryIssues(filter?: IssueFilter, scopePath?: string, boardTag?: string): Issue[] {
  let query = "";

  // Add board tag filter if provided (tasks tagged with @board)
  if (boardTag) {
    // Strip @ prefix if present
    const tag = boardTag.startsWith("@") ? boardTag.slice(1) : boardTag;
    query += ` @${tag}`;
  }

  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    query += ` status:${statuses.join(",")}`;
  }
  if (filter?.type) {
    query += ` #${filter.type}`;
  }
  if (filter?.assignee) {
    query += ` @${filter.assignee}`;
  }
  if (filter?.priority !== undefined) {
    query += ` #P${filter.priority}`;
  }

  // Don't filter by type='task' - issues can be file nodes with task_status
  const nodes = queryNodes(query.trim() || "*");
  let issues = nodes.map(nodeToIssue);

  // Apply path scope filter after query (since path: syntax not supported)
  if (scopePath) {
    issues = issues.filter((issue) => issue.path?.startsWith(scopePath));
  }

  // Apply blocked filter
  if (filter?.blocked !== undefined) {
    if (filter.blocked) {
      issues = issues.filter((i) => i.blockedBy && i.blockedBy.length > 0);
    } else {
      issues = issues.filter((i) => !i.blockedBy || i.blockedBy.length === 0);
    }
  }

  return issues;
}

/**
 * Get a single issue by short ID
 */
export function getIssue(shortId: string): Issue | null {
  // Try to find by short_id in data
  // Don't filter by type='task' - issues can be file nodes with task_status
  const nodes = queryNodes(`@issue`);

  for (const node of nodes) {
    const data = node.data as Record<string, unknown> | undefined;
    const nodeShortId = data?.short_id as string | undefined;
    const derivedShortId = `km-${node.id.slice(-4).toLowerCase()}`;

    if (nodeShortId === shortId || derivedShortId === shortId) {
      return nodeToIssue(node);
    }
  }

  return null;
}
