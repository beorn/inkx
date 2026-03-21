/**
 * Import Pipeline — Stage 2: Download Attachments
 *
 * Downloads attachment files to local storage, keyed by sourceId (e.g. Asana GID).
 * Skips files that already exist (idempotent). Updates ImportData with local paths.
 */

import { existsSync, mkdirSync, writeFileSync, utimesSync } from "fs"
import { join, extname } from "path"
import type { ImportData, ImportItem, ImportAttachment } from "./types.ts"

const DOWNLOAD_CONCURRENCY = 5

interface DownloadResult {
  downloaded: number
  skipped: number
  failed: number
  bailedRemaining?: number
}

/** Markdown image pattern: ![alt](url) */
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g

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

/** Extract inline image URLs from body text that are remote (http/https) */
function extractInlineImageUrls(text: string): string[] {
  const urls: string[] = []
  for (const match of text.matchAll(MD_IMAGE_RE)) {
    const url = match[1]
    if (url?.startsWith("http://") || url?.startsWith("https://")) {
      urls.push(url!)
    }
  }
  return urls
}

/** Derive a stable filename from a URL (used as sourceId for inline images) */
function urlToSourceId(url: string): string {
  // Use a hash of the URL as a stable identifier
  const hash = Bun.hash(url).toString(36)
  return `inline-${hash}`
}

/**
 * Walk all items and collect inline image URLs from body text.
 * Creates synthetic ImportAttachment entries and returns a map of URL→attachment
 * for post-download body text replacement.
 */
function collectInlineImages(data: ImportData): Map<string, ImportAttachment> {
  const urlMap = new Map<string, ImportAttachment>()
  const existingUrls = new Set<string>()

  // First pass: collect all attachment URLs so we don't duplicate
  function collectExistingUrls(item: ImportItem): void {
    if (item.attachments) {
      for (const att of item.attachments) existingUrls.add(att.url)
    }
    if (item.children) {
      for (const child of item.children) collectExistingUrls(child)
    }
  }

  function walkItem(item: ImportItem): void {
    if (item.body) {
      for (const url of extractInlineImageUrls(item.body)) {
        if (!existingUrls.has(url) && !urlMap.has(url)) {
          // Guess extension from URL path
          let ext = ".png"
          try {
            ext = extname(new URL(url).pathname) || ".png"
          } catch {
            /* use default */
          }
          const name = `inline-image${ext}`
          const att: ImportAttachment = {
            sourceId: urlToSourceId(url),
            name,
            url,
            type: "image",
          }
          urlMap.set(url, att)
        }
      }
    }
    if (item.children) {
      for (const child of item.children) walkItem(child)
    }
  }

  for (const project of data.projects) {
    if (project.sections) {
      for (const section of project.sections) {
        for (const item of section.items) {
          collectExistingUrls(item)
        }
        for (const item of section.items) walkItem(item)
      }
    }
    if (project.items) {
      for (const item of project.items) {
        collectExistingUrls(item)
      }
      for (const item of project.items) walkItem(item)
    }
  }

  return urlMap
}

/** Replace inline image URLs in body text with local paths */
function replaceInlineImageUrls(data: ImportData, urlMap: Map<string, ImportAttachment>): void {
  function walkItem(item: ImportItem): void {
    if (item.body) {
      for (const [url, att] of urlMap) {
        if (att.localPath && item.body.includes(url)) {
          item.body = item.body.replaceAll(url, att.localPath)
        }
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
    /** Called on 403 to refresh an expired download URL. Returns fresh URL or null. */
    refreshUrl?: (att: ImportAttachment) => Promise<string | null>
    /** Progress callback: called with (current, total) as items complete */
    onProgress?: (current: number, total: number) => void
  },
): Promise<DownloadResult> {
  const attachments = collectAttachments(data)

  // Collect inline images from body text (not already in attachments)
  const inlineImages = collectInlineImages(data)
  const inlineAttachments = [...inlineImages.values()]
  const allAttachments = [...attachments, ...inlineAttachments]

  if (allAttachments.length === 0) return { downloaded: 0, skipped: 0, failed: 0 }

  if (!opts.dryRun) {
    mkdirSync(opts.dir, { recursive: true })
  }

  const result: DownloadResult = { downloaded: 0, skipped: 0, failed: 0 }
  let progressCount = 0
  opts.onProgress?.(0, allAttachments.length)

  let consecutiveAuthFailures = 0
  const MAX_AUTH_FAILURES = 5

  for (let i = 0; i < allAttachments.length; i += DOWNLOAD_CONCURRENCY) {
    // Rate limit: delay between batches to respect server limits
    if (i > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
    }
    // Only bail if re-authentication keeps failing (token is invalid)
    if (consecutiveAuthFailures >= MAX_AUTH_FAILURES) {
      const remaining = allAttachments.length - i
      result.failed += remaining
      result.bailedRemaining = remaining
      progressCount += remaining
      opts.onProgress?.(progressCount, allAttachments.length)
      break
    }
    const batch = allAttachments.slice(i, i + DOWNLOAD_CONCURRENCY)
    await Promise.all(
      batch.map(async (att) => {
        const filename = localFilename(att)
        const localPath = join(opts.dir, filename)
        const relativePath = opts.relativePath ? `${opts.relativePath}/${filename}` : filename

        // Already cached?
        if (existsSync(localPath)) {
          att.localPath = relativePath
          result.skipped++
          progressCount++
          opts.onProgress?.(progressCount, allAttachments.length)
          return
        }

        if (opts.dryRun) {
          att.localPath = relativePath
          result.downloaded++
          progressCount++
          opts.onProgress?.(progressCount, allAttachments.length)
          return
        }

        try {
          let url = att.url
          let res = await fetch(url)

          // On 403, re-authenticate by fetching a fresh download URL
          if (res.status === 403 && opts.refreshUrl && att.sourceId) {
            const freshUrl = await opts.refreshUrl(att)
            if (freshUrl) {
              url = freshUrl
              res = await fetch(url)
            }
          }

          if (!res.ok) {
            // Track auth failures separately — only bail on repeated auth failure
            if (res.status === 403) consecutiveAuthFailures++
            result.failed++
            progressCount++
            opts.onProgress?.(progressCount, allAttachments.length)
            return
          }
          consecutiveAuthFailures = 0
          const buffer = Buffer.from(await res.arrayBuffer())
          writeFileSync(localPath, buffer)
          if (att.createdAt) {
            const ts = new Date(att.createdAt)
            utimesSync(localPath, ts, ts)
          }
          att.localPath = relativePath
          result.downloaded++
        } catch {
          result.failed++
        }
        progressCount++
        opts.onProgress?.(progressCount, allAttachments.length)
      }),
    )
  }

  // Replace inline image URLs in body text with downloaded local paths
  if (inlineImages.size > 0) {
    replaceInlineImageUrls(data, inlineImages)
  }

  return result
}
