/**
 * Beads Migration
 *
 * Migrate issues from .beads/issues.jsonl to km markdown tasks.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getBeadsConfig } from "@km/storage";
import type { Issue } from "./types.ts";

/** Raw beads issue format from issues.jsonl */
export interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: "open" | "in_progress" | "closed" | "blocked";
  priority: number;
  issue_type?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  // Dependencies
  blocked_by?: string[];
  blocks?: string[];
  parent_id?: string;
  // Metadata
  labels?: string[];
  assignee?: string;
}

/**
 * Find the .beads directory starting from a path
 */
export function findBeadsDir(startFrom?: string): string | null {
  let dir = startFrom || process.cwd();

  while (dir !== "/") {
    const beadsDir = join(dir, ".beads");
    if (existsSync(beadsDir)) {
      return beadsDir;
    }
    dir = dirname(dir);
  }

  return null;
}

/**
 * Read issues from .beads/issues.jsonl
 */
export function readBeadsIssues(beadsDir: string): BeadsIssue[] {
  const issuesPath = join(beadsDir, "issues.jsonl");
  if (!existsSync(issuesPath)) {
    return [];
  }

  const content = readFileSync(issuesPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line) as BeadsIssue);
}

/**
 * Convert beads status to task mark
 */
function statusToMark(status: BeadsIssue["status"]): string {
  switch (status) {
    case "open":
      return " ";
    case "in_progress":
      return "/";
    case "closed":
      return "x";
    case "blocked":
      return "!";
    default:
      return " ";
  }
}

/**
 * Convert beads issue to markdown content
 *
 * Format: Status expressed via task mark in heading, type/priority via tags
 *
 * ```markdown
 * ---
 * id: km-01c
 * created_by: beorn
 * created_at: 2024-01-15T...
 * ---
 *
 * # [x] Title @issue #feature #P2
 *
 * Description...
 * ```
 */
export function issueToMarkdown(issue: BeadsIssue, boardTag?: string): string {
  const lines: string[] = [];

  // Frontmatter - only essential metadata (status/type/priority now in heading)
  lines.push("---");
  lines.push(`id: ${issue.id}`);
  if (issue.created_by) {
    lines.push(`created_by: ${issue.created_by}`);
  }
  lines.push(`created_at: ${issue.created_at}`);
  if (issue.closed_at) {
    lines.push(`closed_at: ${issue.closed_at}`);
  }
  if (issue.close_reason) {
    lines.push(`close_reason: "${issue.close_reason.replace(/"/g, '\\"')}"`);
  }
  if (issue.blocked_by && issue.blocked_by.length > 0) {
    lines.push(`blocked_by: [${issue.blocked_by.map((b) => `"${b}"`).join(", ")}]`);
  }
  if (issue.parent_id) {
    lines.push(`parent_id: ${issue.parent_id}`);
  }
  lines.push("---");
  lines.push("");

  // Build tags for heading
  const tags: string[] = [];
  if (boardTag) {
    tags.push(`@${boardTag}`);
  }
  if (issue.issue_type) {
    tags.push(`#${issue.issue_type}`);
  }
  tags.push(`#P${issue.priority}`);
  if (issue.labels) {
    tags.push(...issue.labels.map((l) => `#${l}`));
  }
  if (issue.assignee) {
    tags.push(`@${issue.assignee}`);
  }

  // Title as h1 with task mark and tags
  const mark = statusToMark(issue.status);
  const tagStr = tags.length > 0 ? ` ${tags.join(" ")}` : "";
  lines.push(`# [${mark}] ${issue.title}${tagStr}`);
  lines.push("");

  // Description
  if (issue.description) {
    lines.push(issue.description);
  }

  return lines.join("\n");
}

/**
 * Generate a safe filename from issue title
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export interface MigrateOptions {
  /** Directory to write markdown files to */
  targetDir: string;
  /** Board tag to add to issues (e.g., "issue") */
  boardTag?: string;
  /** Only migrate issues with these statuses */
  statusFilter?: string[];
  /** Dry run - don't write files */
  dryRun?: boolean;
}

export interface MigrateResult {
  migrated: number;
  skipped: number;
  errors: string[];
  files: string[];
}

/**
 * Migrate issues from .beads/issues.jsonl to markdown files
 */
export function migrateBeadsToMarkdown(beadsDir: string, options: MigrateOptions): MigrateResult {
  const issues = readBeadsIssues(beadsDir);
  const result: MigrateResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
    files: [],
  };

  // Filter by status if specified
  let filtered = issues;
  if (options.statusFilter && options.statusFilter.length > 0) {
    filtered = issues.filter((i) => options.statusFilter!.includes(i.status));
  }

  // Ensure target directory exists
  if (!options.dryRun && !existsSync(options.targetDir)) {
    mkdirSync(options.targetDir, { recursive: true });
  }

  for (const issue of filtered) {
    try {
      const filename = `${issue.id}.md`;
      const filepath = join(options.targetDir, filename);

      // Skip if file already exists
      if (existsSync(filepath)) {
        result.skipped++;
        continue;
      }

      const content = issueToMarkdown(issue, options.boardTag);

      if (!options.dryRun) {
        writeFileSync(filepath, content, "utf-8");
      }

      result.migrated++;
      result.files.push(filepath);
    } catch (error) {
      result.errors.push(`${issue.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

/**
 * Get migration stats without migrating
 */
export function getMigrationStats(beadsDir: string): {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
} {
  const issues = readBeadsIssues(beadsDir);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const issue of issues) {
    byStatus[issue.status] = (byStatus[issue.status] || 0) + 1;
    const type = issue.issue_type || "task";
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    total: issues.length,
    byStatus,
    byType,
  };
}
