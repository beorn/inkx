/**
 * Content-Addressable Store (CAS)
 *
 * Stores large content by SHA-256 hash for deduplication.
 * Used when content exceeds inline threshold.
 *
 * All functions require explicit kmDir parameter (no singletons).
 */

import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const INLINE_THRESHOLD = 4096 // 4KB - content larger than this goes to CAS

/**
 * Get the blobs directory path for a given kmDir
 */
export function getBlobsPath(kmDir: string): string {
  return join(kmDir, "blobs")
}

/**
 * Compute SHA-256 hash of content
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex")
}

/**
 * Get the storage path for a hash (with prefix sharding)
 */
function getBlobPath(kmDir: string, hash: string): string {
  const prefix = hash.slice(0, 2)
  return join(getBlobsPath(kmDir), prefix, hash.slice(2))
}

/**
 * Store content in CAS
 * Returns the hash (content address)
 */
export function storeContent(kmDir: string, content: string): string {
  const hash = hashContent(content)
  const blobPath = getBlobPath(kmDir, hash)

  if (!existsSync(blobPath)) {
    const dir = join(getBlobsPath(kmDir), hash.slice(0, 2))
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(blobPath, content, "utf-8")
  }

  return hash
}

/**
 * Load content from CAS by hash
 */
export function loadContent(kmDir: string, hash: string): string | null {
  const blobPath = getBlobPath(kmDir, hash)

  if (!existsSync(blobPath)) {
    return null
  }

  return readFileSync(blobPath, "utf-8")
}

/**
 * Check if content exists in CAS
 */
export function hasContent(kmDir: string, hash: string): boolean {
  return existsSync(getBlobPath(kmDir, hash))
}

/**
 * Determine if content should be stored inline or in CAS
 */
export function shouldStoreInCas(content: string): boolean {
  return Buffer.byteLength(content, "utf-8") > INLINE_THRESHOLD
}

/**
 * Store content appropriately based on size
 * Returns { content, content_hash } where one is set based on size
 */
export function storeContentAuto(
  kmDir: string,
  content: string,
): {
  content: string | null
  content_hash: string | null
} {
  if (shouldStoreInCas(content)) {
    return {
      content: null,
      content_hash: storeContent(kmDir, content),
    }
  }

  return {
    content,
    content_hash: null,
  }
}

/**
 * Load content from either inline or CAS
 */
export function loadContentAuto(
  kmDir: string,
  inlineContent: string | null | undefined,
  contentHash: string | null | undefined,
): string | null {
  if (inlineContent) {
    return inlineContent
  }

  if (contentHash) {
    return loadContent(kmDir, contentHash)
  }

  return null
}
