/**
 * Import Pipeline — Stage 3: Write
 *
 * Writes FileMap to disk with idempotency, --dry-run, and --force support.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)

import type { FileMap } from "./types.ts"

export interface WriteOptions {
  /** Base output directory */
  outDir: string
  /** Preview only, don't write */
  dryRun?: boolean
  /** Overwrite existing files */
  force?: boolean
}

export type FileSource = FileMap | Iterable<[string, string]>

/** Extract frontmatter field from markdown content */
function getFrontmatterField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`^${field}:\\s*"?([^"\\n]+)"?`, "m"))
  return match?.[1]
}

/** Write files to disk from a FileMap or any iterable of [path, content] pairs */
export function writeFiles(files: FileSource, options: WriteOptions): { written: string[]; skipped: string[] } {
  const written: string[] = []
  const skipped: string[] = []

  for (const [relativePath, content] of files) {
    const fullPath = join(options.outDir, relativePath)

    // Check idempotency
    if (existsSync(fullPath) && !options.force) {
      const existing = readFileSync(fullPath, "utf-8")
      const existingId = getFrontmatterField(existing, ".*_project_id")
      const newId = getFrontmatterField(content, ".*_project_id")

      if (existingId && newId && existingId === newId) {
        skipped.push(relativePath)
        if (!options.dryRun) {
          console.log(term.dim(`  skip ${relativePath} (already imported, use --force to overwrite)`))
        }
        continue
      } else {
        skipped.push(relativePath)
        if (!options.dryRun) {
          console.log(term.dim(`  skip ${relativePath} (exists, use --force to overwrite)`))
        }
        continue
      }
    }

    if (options.dryRun) {
      console.log(term.cyan(`  [dry-run] would write ${relativePath}`))
      console.log(term.dim(`  ${content.split("\n").length} lines, ${content.length} bytes`))
      written.push(relativePath)
      continue
    }

    // Ensure directory exists
    const dir = dirname(fullPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(fullPath, content, "utf-8")
    written.push(relativePath)
    console.log(term.green("  +"), relativePath)
  }

  return { written, skipped }
}
