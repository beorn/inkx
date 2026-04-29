/**
 * Resolve the current user's assignee handle for bd/tasks claim.
 *
 * Priority: git config user.name → env.USER → "unknown".
 * Result is kebab-cased + lowercased for use as a node-name-friendly id.
 */

import { execSync } from "node:child_process"

export function resolveAssignee(): string {
  try {
    const gitName = execSync("git config user.name", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    if (gitName) return kebabCase(gitName)
  } catch {
    // git not available or no config — fall through
  }
  const envUser = process.env.USER
  if (envUser) return kebabCase(envUser)
  return "unknown"
}

function kebabCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}
