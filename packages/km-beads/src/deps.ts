/**
 * Beads Dependency Management
 *
 * Add and remove dependencies between issues.
 */

import type { KNode } from "@km/core";
import type { Issue } from "./types.ts";

/**
 * Add a dependency (blocked-by relationship)
 *
 * Returns updated data field for the node.
 */
export function addDependency(
  issue: Issue,
  dependsOn: string, // Short ID of the blocker
): { props: Record<string, unknown>; propsRaw: Record<string, string> } {
  const currentBlockers = issue.blockedBy || [];

  // Don't add duplicate
  if (currentBlockers.includes(dependsOn)) {
    return buildBlockedByProps(currentBlockers);
  }

  const newBlockers = [...currentBlockers, dependsOn];
  return buildBlockedByProps(newBlockers);
}

/**
 * Remove a dependency
 */
export function removeDependency(
  issue: Issue,
  dependsOn: string,
): { props: Record<string, unknown>; propsRaw: Record<string, string> } | null {
  const currentBlockers = issue.blockedBy || [];

  if (!currentBlockers.includes(dependsOn)) {
    return null; // Not a current dependency
  }

  const newBlockers = currentBlockers.filter((b) => b !== dependsOn);

  if (newBlockers.length === 0) {
    // Return empty props to clear the blocked-by property
    return { props: {}, propsRaw: {} };
  }

  return buildBlockedByProps(newBlockers);
}

/**
 * Build the blocked-by property structure
 */
function buildBlockedByProps(blockers: string[]): {
  props: Record<string, unknown>;
  propsRaw: Record<string, string>;
} {
  if (blockers.length === 0) {
    return { props: {}, propsRaw: {} };
  }

  if (blockers.length === 1) {
    return {
      props: {
        "blocked-by": { type: "link", target: blockers[0] },
      },
      propsRaw: {
        "blocked-by": `[[${blockers[0]}]]`,
      },
    };
  }

  // Multiple blockers - use list type
  return {
    props: {
      "blocked-by": {
        type: "list",
        values: blockers.map((b) => ({ type: "link", target: b })),
      },
    },
    propsRaw: {
      "blocked-by": blockers.map((b) => `[[${b}]]`).join(", "),
    },
  };
}

/**
 * Get all dependencies for an issue
 */
export function getDependencies(issue: Issue): string[] {
  return issue.blockedBy || [];
}

/**
 * Check if issue A depends on issue B
 */
export function dependsOn(issueA: Issue, issueB: Issue): boolean {
  return (issueA.blockedBy || []).includes(issueB.shortId);
}

/**
 * Merge dependency props into existing node data
 */
export function mergeDepProps(
  existingData: Record<string, unknown> | undefined,
  depProps: {
    props: Record<string, unknown>;
    propsRaw: Record<string, string>;
  },
): Record<string, unknown> {
  const data = existingData || {};
  const existingProps = (data.props || {}) as Record<string, unknown>;
  const existingPropsRaw = (data.propsRaw || {}) as Record<string, string>;

  return {
    ...data,
    props: {
      ...existingProps,
      ...depProps.props,
    },
    propsRaw: {
      ...existingPropsRaw,
      ...depProps.propsRaw,
    },
  };
}
