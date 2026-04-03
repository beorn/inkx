/**
 * WriteTokenMap
 *
 * Content-hash based ownership tracking for the sync pipeline.
 * When km writes a file (DB -> FS), we record the SHA-256 hash of the content.
 * When the watcher sees a change, we compare the current file content's hash
 * against the stored token to determine if the change was ours or external.
 *
 * Replaces the timestamp-based recentWrites suppression with deterministic hashing.
 */

import { hashContent } from "../cas.ts"

export class WriteTokenMap {
  private tokens = new Map<string, string>() // absPath -> sha256 hex hash
  private deleted = new Set<string>() // absPath of files we deleted

  /** Record that we wrote this content to this path */
  record(absPath: string, content: string): void {
    this.tokens.set(absPath, hashContent(content))
  }

  /** Check if a file change is ours. Consumes the token (one-shot). */
  consume(absPath: string, currentContent: string): "ours" | "external" {
    const storedHash = this.tokens.get(absPath)
    if (!storedHash) return "external"
    this.tokens.delete(absPath)
    return hashContent(currentContent) === storedHash ? "ours" : "external"
  }

  /** Check if we have a token for this path (without consuming) */
  has(absPath: string): boolean {
    return this.tokens.has(absPath)
  }

  /** Record that we deleted this path */
  recordDelete(absPath: string): void {
    this.deleted.add(absPath)
  }

  /** Check if a delete was ours. Consumes the tombstone (one-shot). */
  consumeDelete(absPath: string): boolean {
    if (!this.deleted.has(absPath)) return false
    this.deleted.delete(absPath)
    return true
  }

  /** Check if we have a delete tombstone for this path (without consuming) */
  hasDelete(absPath: string): boolean {
    return this.deleted.has(absPath)
  }

  clear(): void {
    this.tokens.clear()
    this.deleted.clear()
  }

  get size(): number {
    return this.tokens.size
  }

  get deleteSize(): number {
    return this.deleted.size
  }
}
