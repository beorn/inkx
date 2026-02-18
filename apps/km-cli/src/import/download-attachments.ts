/**
 * Import Pipeline — Stage 2: Download Attachments
 *
 * Downloads attachment files to local storage, keyed by sourceId (e.g. Asana GID).
 * Skips files that already exist (idempotent). Updates ImportData with local paths.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join, extname } from "path"
import { createTerm } from "inkx"
import { ProgressBar } from "@beorn/inkx-ui/cli"
import type { ImportData, ImportItem, ImportAttachment } from "./types.ts"

const term = createTerm(process)

const DOWNLOAD_CONCURRENCY = 5

interface DownloadResult {
  downloaded: number
  skipped: number
  failed: number
}

/** Walk all items in ImportData and collect attachments */
function collectAttachments(data: ImportData): ImportAttachment[] {
  const all: ImportAttachment[] = []

  function walkItem(item: ImportItem): void {
    if (item.attachments) {
      for (const att of item.attachments) {
        if (att.url && att.type !== "link") all.push(att)
      }
    }
    if (item.children) {
      for (const child of item.children) walkItem(child)
    }
  }

  for (const project of data.projects) {
    if (project.sections) {
      for (const section of project.sections) {
        for (const item of section.items) walkItem(item)
      }
    }
    if (project.items) {
      for (const item of project.items) walkItem(item)
    }
  }

  return all
}

/** Get file extension from attachment name, with fallback */
function getExtension(att: ImportAttachment): string {
  const ext = extname(att.name)
  if (ext) return ext
  // Try to guess from type
  if (att.type === "image") return ".png"
  return ".bin"
}

/** Generate the local filename for an attachment */
function localFilename(att: ImportAttachment): string {
  const ext = getExtension(att)
  // Use sourceId if available (stable, unique), otherwise hash the URL
  if (att.sourceId) return `${att.sourceId}${ext}`
  // Fallback: sanitize name
  return att.name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

/**
 * Download all attachments in ImportData to a local directory.
 * Updates each attachment's `localPath` with the relative path.
 * Skips files that already exist (cached by sourceId).
 */
export async function downloadAttachments(
  data: ImportData,
  opts: {
    /** Directory to store downloaded files */
    dir: string
    /** Relative path prefix for localPath (from markdown file to attachments dir) */
    relativePath?: string
    /** Dry run — don't actually download */
    dryRun?: boolean
  },
): Promise<DownloadResult> {
  const attachments = collectAttachments(data)
  if (attachments.length === 0) return { downloaded: 0, skipped: 0, failed: 0 }

  if (!opts.dryRun) {
    mkdirSync(opts.dir, { recursive: true })
  }

  const result: DownloadResult = { downloaded: 0, skipped: 0, failed: 0 }
  const bar = new ProgressBar({
    total: attachments.length,
    format: "  :bar :current/:total attachments | ETA: :eta",
  })
  bar.start()

  for (let i = 0; i < attachments.length; i += DOWNLOAD_CONCURRENCY) {
    const batch = attachments.slice(i, i + DOWNLOAD_CONCURRENCY)
    await Promise.all(
      batch.map(async (att) => {
        const filename = localFilename(att)
        const localPath = join(opts.dir, filename)
        const relativePath = opts.relativePath ? `${opts.relativePath}/${filename}` : filename

        // Already cached?
        if (existsSync(localPath)) {
          att.localPath = relativePath
          result.skipped++
          bar.increment()
          return
        }

        if (opts.dryRun) {
          att.localPath = relativePath
          result.downloaded++
          bar.increment()
          return
        }

        try {
          const res = await fetch(att.url)
          if (!res.ok) {
            console.log(term.yellow(`  Failed to download ${att.name}: HTTP ${res.status}`))
            result.failed++
            bar.increment()
            return
          }
          const buffer = Buffer.from(await res.arrayBuffer())
          writeFileSync(localPath, buffer)
          att.localPath = relativePath
          result.downloaded++
        } catch (err) {
          console.log(term.yellow(`  Failed to download ${att.name}: ${(err as Error).message}`))
          result.failed++
        }
        bar.increment()
      }),
    )
  }

  bar.stop(true)
  return result
}
