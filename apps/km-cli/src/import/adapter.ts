/**
 * Import Adapter Interface
 *
 * Every import source (Asana, CSV, Todoist, etc.) implements this interface.
 * Adapters convert source-specific data into the universal ImportData format,
 * which then flows through the shared convert → write pipeline.
 *
 * Pipeline: Source → Adapter.fetch() → ImportData → convert → write
 */

import type { ImportData, ImportAttachment } from "./types.ts"

/** Options passed to adapter.fetch() */
export interface AdapterFetchOptions {
  /** Directory to save intermediate artifacts (e.g. per-project JSON files) */
  downloadDir: string
  /** Preview only, don't fetch/download */
  dryRun?: boolean
}

/** Result of adapter.fetch() */
export interface AdapterFetchResult {
  data: ImportData
}

/** Options passed to adapter.parse() */
export interface AdapterParseOptions {
  /** The raw input (file contents or directory path) */
  input: string
  /** Whether the input is a file path (true) or raw content (false) */
  isPath?: boolean
}

/**
 * Import adapter: converts a specific source format into ImportData.
 *
 * Adapters may support one or both of:
 * - parse(): Convert a local file/string into ImportData (offline, no auth)
 * - fetch(): Fetch from an API and return ImportData (online, requires auth)
 *
 * At least one of parse() or fetch() must be implemented.
 */
export interface ImportAdapter {
  /** Short identifier for this adapter (e.g. "asana", "csv", "todoist") */
  readonly id: string
  /** Human-readable name */
  readonly name: string
  /** File extensions this adapter can parse (e.g. [".csv", ".tsv"]) */
  readonly fileExtensions?: string[]

  /**
   * Parse a local file or string into ImportData.
   * Not all adapters support this (e.g. API-only adapters).
   */
  parse?(options: AdapterParseOptions): Promise<ImportData> | ImportData

  /**
   * Fetch from a remote API and return ImportData.
   * Not all adapters support this (e.g. file-only adapters like CSV).
   */
  fetch?(options: AdapterFetchOptions & Record<string, unknown>): Promise<AdapterFetchResult>

  /**
   * Optional: preprocess ImportData before the convert stage.
   * Used for source-specific link conversion, dedup, etc.
   * Default: identity (no preprocessing).
   */
  preprocess?(data: ImportData): ImportData

  /**
   * Optional: provide a function to refresh expired download URLs for attachments.
   * Used by sources with signed/expiring URLs (e.g. Asana).
   */
  refreshAttachmentUrl?(att: ImportAttachment): Promise<string | null>
}

// =============================================================================
// Adapter Registry
// =============================================================================

const adapters = new Map<string, ImportAdapter>()

/** Register an adapter */
export function registerAdapter(adapter: ImportAdapter): void {
  adapters.set(adapter.id, adapter)
}

/** Get an adapter by id */
export function getAdapter(id: string): ImportAdapter | undefined {
  return adapters.get(id)
}

/** List all registered adapter ids */
export function listAdapters(): string[] {
  return [...adapters.keys()]
}

/** Find an adapter that can parse the given file extension */
export function findAdapterForExtension(ext: string): ImportAdapter | undefined {
  const normalized = ext.startsWith(".") ? ext : `.${ext}`
  for (const adapter of adapters.values()) {
    if (adapter.fileExtensions?.includes(normalized)) return adapter
  }
  return undefined
}
