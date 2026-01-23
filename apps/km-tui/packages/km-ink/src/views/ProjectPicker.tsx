/**
 * Project Picker Component
 *
 * Fuzzy search picker for re-parenting tasks to different projects.
 * Press 'p' on a task to open, search to filter, Enter to move.
 */
import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "inkx";
import type { KNode } from "@km/core";
import { getAllNodes, getNode } from "@km/storage";
import { getNodeDisplayName } from "../state.ts";
import { ModalDialog } from "./shared-components.tsx";

/**
 * Simple fuzzy match - check if query chars appear in order in target
 */
function fuzzyMatch(query: string, target: string): boolean {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  let queryIndex = 0;
  for (
    let i = 0;
    i < lowerTarget.length && queryIndex < lowerQuery.length;
    i++
  ) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

/**
 * Score a fuzzy match (higher = better)
 */
function fuzzyScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  if (!fuzzyMatch(query, target)) return -1;

  let score = 0;
  let queryIndex = 0;
  let consecutive = 0;

  for (
    let i = 0;
    i < lowerTarget.length && queryIndex < lowerQuery.length;
    i++
  ) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      // Bonus for consecutive matches
      consecutive++;
      score += consecutive * 2;

      // Bonus for match at start
      if (i === 0) score += 10;

      // Bonus for match after separator
      if (i > 0 && (lowerTarget[i - 1] === "/" || lowerTarget[i - 1] === " ")) {
        score += 5;
      }

      queryIndex++;
    } else {
      consecutive = 0;
    }
  }

  // Penalty for longer targets (prefer shorter matches)
  score -= lowerTarget.length * 0.1;

  return score;
}

/**
 * Get project path from a node (folder/file ancestors)
 */
function getProjectPath(node: KNode): string {
  const parts: string[] = [];
  let current: KNode | null = node;

  while (current) {
    if (current.type === "folder" || current.type === "file") {
      parts.unshift(getNodeDisplayName(current));
    }
    current = current.parent_id ? (getNode(current.parent_id) ?? null) : null;
  }

  return parts.join(" / ");
}

/**
 * Get parent display name for context
 */
function getParentName(node: KNode): string | null {
  if (!node.parent_id) return null;
  const parent = getNode(node.parent_id);
  if (!parent) return null;
  return getNodeDisplayName(parent);
}

/**
 * Project option for the picker
 */
interface ProjectOption {
  node: KNode;
  title: string; // Display name of the node
  parentContext: string | null; // Parent name for context
  path: string; // Full path for searching
  isRecent?: boolean;
}

/**
 * Get all available project targets (sections, files, folders)
 */
function getProjectOptions(recentIds?: string[]): ProjectOption[] {
  const allNodes = getAllNodes();
  const options: ProjectOption[] = [];
  const recentSet = new Set(recentIds ?? []);

  for (const node of allNodes) {
    // Only show sections, files, and folders as valid targets
    if (
      node.type === "section" ||
      node.type === "file" ||
      node.type === "folder"
    ) {
      const title = getNodeDisplayName(node);
      const parentContext = getParentName(node);
      const path = getProjectPath(node);
      options.push({
        node,
        title,
        parentContext,
        path: path || title,
        isRecent: recentSet.has(node.id),
      });
    }
  }

  return options;
}

export interface ProjectPickerProps {
  onSelect: (targetNode: KNode) => void;
  onCancel: () => void;
  width: number;
  height: number;
  recentProjectIds?: string[];
}

export function ProjectPicker({
  onSelect,
  onCancel,
  width,
  height,
  recentProjectIds = [],
}: ProjectPickerProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get and filter options
  const allOptions = useMemo(
    () => getProjectOptions(recentProjectIds),
    [recentProjectIds],
  );

  const filteredOptions = useMemo(() => {
    if (!query) {
      // Show recent first, then alphabetically by title
      return [...allOptions].sort((a, b) => {
        if (a.isRecent && !b.isRecent) return -1;
        if (!a.isRecent && b.isRecent) return 1;
        return a.title.localeCompare(b.title);
      });
    }

    // Filter and score by query - match against title, parent, and full path
    return allOptions
      .map((opt) => {
        // Score against title (primary), parent context, and full path
        const titleScore = fuzzyScore(query, opt.title);
        const parentScore = opt.parentContext
          ? fuzzyScore(query, opt.parentContext) * 0.8
          : -1;
        const pathScore = fuzzyScore(query, opt.path) * 0.6;
        const bestScore = Math.max(titleScore, parentScore, pathScore);
        return { ...opt, score: bestScore };
      })
      .filter((opt) => opt.score >= 0)
      .sort((a, b) => b.score - a.score);
  }, [allOptions, query]);

  // Max visible items based on height
  const maxVisible = Math.max(1, height - 6); // Reserve space for header, search, hints

  // Scroll offset to keep selection visible
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, filteredOptions.length - maxVisible),
    ),
  );

  const visibleOptions = filteredOptions.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  );

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      const selected = filteredOptions[selectedIndex];
      if (selected) {
        onSelect(selected.node);
      }
      return;
    }

    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelectedIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
      return;
    }

    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Tab could toggle between search and create mode (future enhancement)

    // Regular character input
    if (input.length === 1 && input >= " ") {
      setQuery((q) => q + input);
      setSelectedIndex(0);
    }
  });

  const innerWidth = Math.max(10, width - 8); // Account for border + paddingX(2)

  return (
    <ModalDialog borderColor="cyan" width={width} height={height}>
      {/* Header */}
      <Text bold>Move to project:</Text>

      {/* Separator */}
      <Text dimColor>{"─".repeat(innerWidth)}</Text>

      {/* Search input */}
      <Text>
        <Text dimColor>[Search: </Text>
        <Text color="cyan">{query || " "}</Text>
        <Text inverse> </Text>
        <Text dimColor>]</Text>
      </Text>

      {/* Options list */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleOptions.map((opt, i) => {
          const actualIndex = scrollOffset + i;
          const isSelected = actualIndex === selectedIndex;

          // Calculate available width for content
          const prefix = isSelected ? "▸ " : "  ";
          const recentSuffix = opt.isRecent ? " (recent)" : "";
          const contextSuffix = opt.parentContext
            ? ` < ${opt.parentContext}`
            : "";
          const availableWidth =
            innerWidth -
            prefix.length -
            recentSuffix.length -
            contextSuffix.length -
            2;

          // Truncate title if needed
          const displayTitle =
            opt.title.length > availableWidth
              ? opt.title.slice(0, availableWidth - 1) + "…"
              : opt.title;

          return (
            <Text
              key={opt.node.id}
              backgroundColor={isSelected ? "yellow" : undefined}
              color={isSelected ? "black" : undefined}
              wrap="truncate"
            >
              {prefix}
              {displayTitle}
              {opt.parentContext && (
                <Text
                  dimColor={!isSelected}
                  color={isSelected ? "gray" : undefined}
                >
                  {` < ${opt.parentContext}`}
                </Text>
              )}
              {opt.isRecent && (
                <Text color="yellow" dimColor={!isSelected}>
                  {" (recent)"}
                </Text>
              )}
            </Text>
          );
        })}
        {filteredOptions.length === 0 && (
          <Text dimColor>No matching projects</Text>
        )}
      </Box>

      {/* Scroll indicator */}
      {filteredOptions.length > maxVisible && (
        <Text dimColor>
          {scrollOffset > 0 ? "↑ " : "  "}
          {`${selectedIndex + 1}/${filteredOptions.length}`}
          {scrollOffset + maxVisible < filteredOptions.length ? " ↓" : ""}
        </Text>
      )}

      {/* Hints */}
      <Text dimColor>↑↓:nav Enter:select Esc:cancel</Text>
    </ModalDialog>
  );
}

// Export fuzzy functions for testing
export { fuzzyMatch, fuzzyScore, getProjectPath };
