/**
 * Unified Vault Loading
 *
 * THE single entry point for loading vaults in both memory and disk modes.
 * This replaces the fragmented ensureState/rebuildState/syncState functions
 * with a unified generator-based pipeline.
 *
 * Phases:
 * - discover: Count items (files for memory, events for disk)
 * - parse: Generate events from filesystem (memory mode only)
 * - apply: Insert/update nodes in SQLite
 * - resolve: Resolve wikilinks (memory mode only - disk resolves during apply)
 * - materialize: Evaluate add= rules
 */

import createDebug from "debug";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, dirname, relative, basename } from "path";
import type { Event } from "@km/core";

/**
 * Progress yield type for step generators.
 * - String: creates new sub-step with that label
 * - Object { current, total }: updates progress on current sub-step
 * - Object { declare: [...] }: declare all sub-steps upfront (show as pending)
 */
type StepYield =
  | string
  | { current?: number; total?: number }
  | { declare: string[] };
import { parseMarkdownWithLinks } from "@km/markdown";
import { SCHEMA } from "./schema.ts";
import {
  applyEvent,
  getDb,
  resetDb,
  setDb,
  dbApplyEvent,
} from "./db.ts";
import { findChildByContent } from "./db-queries/index.ts";
import { rowToNode } from "./db-queries/utils.ts";
import type { KNode } from "@km/core";
import { getEventsPath, setKmDir, setDatabase } from "./emit.ts";
import { evaluateAllRules, setBulkMode } from "./db-rules.ts";
import { findKmRootFromPath } from "./path-utils.ts";

const debug = createDebug("km:storage:vault-loader");

/** Result from loadVault */
export interface LoadResult {
  mode: "memory" | "disk";
  nodeCount: number;
  linkCount: number;
  errors: LoadError[];
  duration: number;
  /** Pending links for deferred resolution (only present if skipLinkResolution was true) */
  pendingLinks?: PendingLink[];
}

/** Error during loading */
export interface LoadError {
  phase: "discover" | "parse" | "apply" | "resolve" | "materialize";
  path?: string;
  message: string;
}

/** Options for loadVault */
export interface LoadOptions {
  /** Search for .km in parent directories (default: true) */
  searchAncestors?: boolean;
  /** Force full rebuild even if state exists (default: false) */
  force?: boolean;
  /** Skip link resolution for faster startup (default: false) */
  skipLinkResolution?: boolean;
}

/**
 * THE unified vault loading function.
 * Handles both memory and disk modes with a shared pipeline.
 *
 * @deprecated Use createVault() instead for a proper domain object with
 * encapsulated state. This function uses global singletons.
 *
 * @param rootPath - Directory to load (default: cwd)
 * @param options - Loading options
 * @yields Progress info for each phase
 * @returns Load result with stats and errors
 */
export function* loadVault(
  rootPath?: string,
  options?: LoadOptions,
): Generator<StepYield, LoadResult, unknown> {
  const start = Date.now();
  const errors: LoadError[] = [];

  // 1. Resolve path and detect mode
  const searchAncestors = options?.searchAncestors ?? true;
  const { vaultRoot, kmDir } = resolveVaultRoot(rootPath, searchAncestors);
  const mode = kmDir ? "disk" : "memory";

  debug("loadVault", { vaultRoot, mode, force: options?.force });

  // Declare all sub-steps upfront so they appear as pending
  const skipLinks = options?.skipLinkResolution ?? false;
  if (mode === "memory") {
    yield {
      declare: skipLinks
        ? ["Discovering files", "Parsing markdown", "Applying changes", "Evaluating rules"]
        : [
            "Discovering files",
            "Parsing markdown",
            "Applying changes",
            "Resolving links",
            "Evaluating rules",
          ],
    };
  } else {
    yield {
      declare: ["Reading events", "Applying changes", "Evaluating rules"],
    };
  }

  // 2. Set up database based on mode
  let db: Database;
  if (mode === "disk") {
    setKmDir(kmDir!);
    db = getDb();
    if (options?.force) {
      resetDb();
    }
  } else {
    db = new Database(":memory:");
    db.exec(SCHEMA);
    setDb(db);
  }

  // 3. Mode-specific event source (yield* chains progress)
  const source: EventSource =
    mode === "memory"
      ? yield* discoverFromFilesystem(vaultRoot, errors)
      : yield* discoverFromEvents(kmDir!, options?.force ?? false, errors);

  // 4. Shared pipeline (SAME for both modes)
  yield* applyEvents(db, source.events, errors);

  // Resolve links (memory mode has pending links, disk mode resolves during apply)
  let linkCount = 0;
  let returnPendingLinks: PendingLink[] | undefined;

  if (source.pendingLinks.length > 0) {
    if (options?.skipLinkResolution) {
      // Skip resolution - return pending links for deferred processing
      returnPendingLinks = source.pendingLinks;
      debug("skipping link resolution, %d links deferred", source.pendingLinks.length);
    } else {
      linkCount = yield* resolveLinks(source.pendingLinks, errors);
    }
  }

  // Materialize rules
  yield* materializeRules();

  // 5. Finalize
  const nodeCount = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count;

  // Enable real-time event application for disk mode
  if (mode === "disk") {
    setDatabase(dbApplyEvent);
  }

  const duration = Date.now() - start;
  debug("loadVault complete", { mode, nodeCount, linkCount, duration });

  return {
    mode,
    nodeCount,
    linkCount,
    errors,
    duration,
    pendingLinks: returnPendingLinks,
  };
}

// --- Types ---

interface EventSource {
  events: Event[];
  pendingLinks: PendingLink[];
}

/** Pending link for deferred resolution */
export interface PendingLink {
  nodeId: string;
  link: {
    target: string;
    section?: string;
    blockId?: string;
    alias?: string;
    embedded?: boolean;
  };
  relationship?: string;
}

// --- Path Resolution ---

function resolveVaultRoot(
  rootPath: string | undefined,
  searchAncestors: boolean,
): { vaultRoot: string; kmDir: string | null } {
  const path = rootPath ?? process.cwd();

  if (searchAncestors) {
    const kmDir = findKmRootFromPath(path);
    if (kmDir) {
      return { vaultRoot: dirname(kmDir), kmDir };
    }
  } else {
    const kmDir = join(path, ".km");
    if (existsSync(kmDir) && statSync(kmDir).isDirectory()) {
      return { vaultRoot: path, kmDir };
    }
  }

  return { vaultRoot: path, kmDir: null };
}

// --- Memory Mode Discovery ---

function* discoverFromFilesystem(
  vaultRoot: string,
  errors: LoadError[],
): Generator<StepYield, EventSource, unknown> {
  // Discover - count markdown files
  yield "Discovering files";
  const total = countMarkdownFiles(vaultRoot);
  yield { current: total, total };

  // Parse - scan filesystem and generate events
  yield "Parsing markdown";
  const events: Event[] = [];
  const pendingLinks: PendingLink[] = [];
  let current = 0;
  const now = Date.now();

  yield* scanDirectory(vaultRoot, null, 0);

  return { events, pendingLinks };

  // Recursive scanner (hoisted generator)
  function* scanDirectory(
    dirPath: string,
    parentId: string | null,
    _sortOrder: number,
  ): Generator<StepYield, void, unknown> {
    if (!existsSync(dirPath)) return;

    const dirName = basename(dirPath);
    if (
      parentId !== null &&
      (dirName.startsWith(".") || dirName === "node_modules")
    ) {
      return;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true });
    let order = 0;

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Create folder node
        const folderId = generateId(vaultRoot, fullPath);
        events.push({
          id: folderId,
          type: "node_created",
          actor: "fs-scan",
          ts: now,
          data: {
            id: folderId,
            type: "folder",
            parent_id: parentId,
            parent_idx: order++,
            fs_path: fullPath,
            content: entry.name,
          },
        });

        // Recurse into subdirectory
        yield* scanDirectory(fullPath, folderId, 0);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".md")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            const { nodes, wikilinks } = parseMarkdownWithLinks(
              content,
              fullPath,
            );

            // First node is always the file node
            const fileNode = nodes[0];
            if (fileNode?.type === "file") {
              fileNode.parent_id = parentId;
              fileNode.parent_idx = order++;
            }

            // Convert nodes to events
            for (const node of nodes) {
              const nodeId =
                node.id ?? generateId(vaultRoot, fullPath, node.md_line);
              events.push({
                id: nodeId,
                type: "node_created",
                actor: "fs-scan",
                ts: now,
                data: { ...node, id: nodeId },
              });
            }

            // Collect wikilinks for later resolution
            for (const wikilink of wikilinks) {
              pendingLinks.push(wikilink);
            }

            current++;
            // Yield progress every 50 files
            if (current % 50 === 0) {
              yield { current, total };
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push({ phase: "parse", path: fullPath, message });
          }
        } else {
          // Non-markdown file node
          const fileId = generateId(vaultRoot, fullPath);
          events.push({
            id: fileId,
            type: "node_created",
            actor: "fs-scan",
            ts: now,
            data: {
              id: fileId,
              type: "file",
              parent_id: parentId,
              parent_idx: order++,
              fs_path: fullPath,
              content: entry.name,
            },
          });
        }
      }
    }
  }
}

function countMarkdownFiles(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;

  let count = 0;
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countMarkdownFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count++;
    }
  }
  return count;
}

function generateId(
  vaultRoot: string,
  filePath: string,
  lineNum?: number,
): string {
  const relPath = relative(vaultRoot, filePath);
  return lineNum !== undefined ? `${relPath}:${lineNum}` : relPath;
}

// --- Disk Mode Discovery ---

function* discoverFromEvents(
  _kmDir: string,
  force: boolean,
  _errors: LoadError[],
): Generator<StepYield, EventSource, unknown> {
  // Discover - read and count events
  yield "Reading events";

  const eventsPath = getEventsPath();
  if (!existsSync(eventsPath)) {
    debug("no events file at %s", eventsPath);
    yield { current: 0, total: 0 };
    return { events: [], pendingLinks: [] };
  }

  const content = readFileSync(eventsPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  const allEvents: Event[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event;
      if (!seen.has(event.id)) {
        seen.add(event.id);
        allEvents.push(event);
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Sort by ULID (lexicographic = chronological)
  allEvents.sort((a, b) => a.id.localeCompare(b.id));

  // Filter to only new events (unless force rebuild)
  let events: Event[];
  if (force) {
    events = allEvents;
  } else {
    const db = getDb();
    const lastApplied = db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get("last_event") as { value: string } | undefined;

    events = lastApplied?.value
      ? allEvents.filter((e) => e.id > lastApplied.value)
      : allEvents;
  }

  yield { current: events.length, total: events.length };
  debug("discovered %d events (%d new)", allEvents.length, events.length);

  // Disk mode: links are resolved during applyEvent, no pending links
  return { events, pendingLinks: [] };
}

// --- Shared Pipeline ---

function* applyEvents(
  db: Database,
  events: Event[],
  errors: LoadError[],
): Generator<StepYield, void, unknown> {
  yield "Applying changes";

  const total = events.length;
  if (total === 0) return;

  // Enable bulk mode to suppress incremental rule evaluation
  setBulkMode(true);

  db.run("BEGIN IMMEDIATE");
  try {
    for (const [i, event] of events.entries()) {
      try {
        applyEvent(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ phase: "apply", message });
      }

      // Yield progress every 100 events
      if (i % 100 === 0 || i === total - 1) {
        yield { current: i + 1, total };
      }
    }
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    setBulkMode(false);
    throw error;
  }

  setBulkMode(false);
}

function* resolveLinks(
  pendingLinks: PendingLink[],
  errors: LoadError[],
): Generator<StepYield, number, unknown> {
  const total = pendingLinks.length;
  if (total === 0) return 0;

  yield "Resolving links";
  yield { current: 0, total };

  // Build file lookup index for O(1) resolution instead of O(n) SQL per link
  const fileIndex = buildFileIndex();

  // Collect all link data for batch INSERT
  const linksToInsert: Array<{
    source_id: string;
    target_name: string;
    target_id: string | null;
    section: string | null;
    block_id: string | null;
    alias: string | null;
    embedded: boolean;
    relationship: string | null;
  }> = [];

  // Collect embedded link updates for batch UPDATE
  const embeddedUpdates: Array<{
    source_id: string;
    target_id: string;
    alias: string | null;
  }> = [];

  let resolved = 0;

  // Phase 1: Build link data (O(1) lookups)
  for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
    try {
      // Find target file by normalized name (O(1) lookup)
      const normalizedTarget = link.target.toLowerCase().replace(/\.md$/, "");
      const fileNode = fileIndex.get(normalizedTarget) ?? null;

      // If there's a section reference, try to find the specific child node
      let targetNode = fileNode;
      if (fileNode && link.section) {
        const childNode = findChildByContent(fileNode.id, link.section);
        if (childNode) {
          targetNode = childNode;
        }
      }

      linksToInsert.push({
        source_id: nodeId,
        target_name: link.target,
        target_id: targetNode?.id ?? null,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      });

      // Track embedded links that need node updates
      if (link.embedded && targetNode?.id) {
        embeddedUpdates.push({
          source_id: nodeId,
          target_id: targetNode.id,
          alias: link.alias ?? null,
        });
      }

      if (targetNode) {
        resolved++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ phase: "resolve", message });
    }

    // Yield progress every 100 links (building phase)
    if (i % 100 === 0) {
      yield { current: Math.floor(i / 2), total }; // First half is building
    }
  }

  // Phase 2: Batch INSERT in single transaction
  const db = getDb();
  const now = Date.now();

  db.run("BEGIN IMMEDIATE");
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO links
      (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const link of linksToInsert) {
      insertStmt.run(
        link.source_id,
        link.target_name,
        link.target_id,
        link.section,
        link.block_id,
        link.alias,
        link.embedded ? 1 : 0,
        link.relationship,
        now,
      );
    }

    // Batch UPDATE for embedded links (update source node's link_to)
    if (embeddedUpdates.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE nodes SET link_to = ?, link_alias = ?, updated_at = ? WHERE id = ?
      `);
      for (const update of embeddedUpdates) {
        updateStmt.run(update.target_id, update.alias, now, update.source_id);
      }
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  yield { current: total, total };
  return resolved;
}

/**
 * Resolve pending links asynchronously (after board renders).
 * Call this with pendingLinks from loadVault({ skipLinkResolution: true }).
 *
 * Yields to event loop between batches to keep UI responsive.
 *
 * @param pendingLinks - Links to resolve (from LoadResult.pendingLinks)
 * @param onProgress - Optional callback for progress updates
 * @returns Number of successfully resolved links
 */
export async function resolveLinksAsync(
  pendingLinks: PendingLink[],
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const total = pendingLinks.length;
  if (total === 0) return 0;

  debug("resolveLinksAsync: starting %d links", total);

  // Build file lookup index for O(1) resolution
  const fileIndex = buildFileIndex();

  // Collect all link data for batch INSERT
  const linksToInsert: Array<{
    source_id: string;
    target_name: string;
    target_id: string | null;
    section: string | null;
    block_id: string | null;
    alias: string | null;
    embedded: boolean;
    relationship: string | null;
  }> = [];

  // Collect embedded link updates for batch UPDATE
  const embeddedUpdates: Array<{
    source_id: string;
    target_id: string;
    alias: string | null;
  }> = [];

  let resolved = 0;
  const BATCH_SIZE = 50;

  // Phase 1: Build link data (O(1) lookups), yielding periodically
  for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
    // Find target file by normalized name (O(1) lookup)
    const normalizedTarget = link.target.toLowerCase().replace(/\.md$/, "");
    const fileNode = fileIndex.get(normalizedTarget) ?? null;

    // If there's a section reference, try to find the specific child node
    let targetNode = fileNode;
    if (fileNode && link.section) {
      const childNode = findChildByContent(fileNode.id, link.section);
      if (childNode) {
        targetNode = childNode;
      }
    }

    linksToInsert.push({
      source_id: nodeId,
      target_name: link.target,
      target_id: targetNode?.id ?? null,
      section: link.section ?? null,
      block_id: link.blockId ?? null,
      alias: link.alias ?? null,
      embedded: link.embedded ?? false,
      relationship: relationship ?? null,
    });

    // Track embedded links that need node updates
    if (link.embedded && targetNode?.id) {
      embeddedUpdates.push({
        source_id: nodeId,
        target_id: targetNode.id,
        alias: link.alias ?? null,
      });
    }

    if (targetNode) {
      resolved++;
    }

    // Yield to event loop periodically to keep UI responsive
    if (i % BATCH_SIZE === 0) {
      onProgress?.(i, total);
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }
  }

  // Phase 2: Batch INSERT in single transaction
  const db = getDb();
  const now = Date.now();

  db.run("BEGIN IMMEDIATE");
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO links
      (source_id, target_name, target_id, section, block_id, alias, embedded, relationship, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const link of linksToInsert) {
      insertStmt.run(
        link.source_id,
        link.target_name,
        link.target_id,
        link.section,
        link.block_id,
        link.alias,
        link.embedded ? 1 : 0,
        link.relationship,
        now,
      );
    }

    // Batch UPDATE for embedded links (update source node's link_to)
    if (embeddedUpdates.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE nodes SET link_to = ?, link_alias = ?, updated_at = ? WHERE id = ?
      `);
      for (const update of embeddedUpdates) {
        updateStmt.run(update.target_id, update.alias, now, update.source_id);
      }
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  onProgress?.(total, total);
  debug("resolveLinksAsync: completed, %d resolved", resolved);
  return resolved;
}

/**
 * Build an index of file nodes by normalized name for O(1) lookup.
 * This replaces per-link SQL queries which were O(n) each.
 */
function buildFileIndex(): Map<string, KNode> {
  const db = getDb();
  const index = new Map<string, KNode>();

  const rows = db
    .query("SELECT * FROM nodes WHERE type = 'file'")
    .all() as Record<string, unknown>[];

  for (const row of rows) {
    const node = rowToNode(row);
    if (node.fs_path) {
      // Index by filename without extension (e.g., "test" for "test.md")
      const filename = basename(node.fs_path)
        .toLowerCase()
        .replace(/\.md$/, "");
      index.set(filename, node);

      // Also index by full path without extension for disambiguation
      const fullPath = node.fs_path.toLowerCase().replace(/\.md$/, "");
      index.set(fullPath, node);
    }
    // Also index by data.name if present
    const data = node.data as Record<string, unknown> | undefined;
    if (data?.name && typeof data.name === "string") {
      index.set(data.name.toLowerCase(), node);
    }
  }

  return index;
}

function* materializeRules(): Generator<StepYield, void, unknown> {
  yield "Evaluating rules";
  for (const progress of evaluateAllRules()) {
    yield { current: progress.current, total: progress.total };
  }
}
