/**
 * <ApplyPatch> — Aider-style search/replace block renderer.
 *
 * Shows the parallel-to-Diff format used by some agents (Aider, OpenAI
 * function-calling edit tools) — a SEARCH block + REPLACE block instead
 * of a unified hunk. Use when the ACP `ToolCall` carries `rawInput`
 * shaped as Aider patches.
 */
import React from "react"
import { ApplyPatch } from "../../src/components/ApplyPatch.tsx"
import type { Story } from "../types.ts"

export const applyPatch: Story = {
  id: "ApplyPatch/single",
  component: "ApplyPatch",
  variant: "single",
  description: "Single search/replace hunk targeting a TypeScript file.",
  render() {
    return (
      <ApplyPatch
        filePath="src/storage/sqlite.ts"
        hunks={[
          {
            search: ["const db = new Database(path)", "db.exec('PRAGMA journal_mode = WAL')"],
            replace: [
              "const db = new Database(path, { readonly: false })",
              "db.exec('PRAGMA journal_mode = WAL')",
              "db.exec('PRAGMA synchronous = NORMAL')",
            ],
          },
        ]}
      />
    )
  },
}

export const applyPatchMulti: Story = {
  id: "ApplyPatch/multi",
  component: "ApplyPatch",
  variant: "multi",
  description: "Multi-hunk patch — two independent search/replace blocks.",
  render() {
    return (
      <ApplyPatch
        filePath="src/components/SessionUpdateList.tsx"
        hunks={[
          {
            header: "rename helper",
            search: ["function previewLines(output: unknown) {"],
            replace: ["function summarizeOutput(output: unknown) {"],
          },
          {
            header: "swap call site",
            search: ["const { lines } = previewLines(o)"],
            replace: ["const { lines } = summarizeOutput(o)"],
          },
        ]}
      />
    )
  },
}
