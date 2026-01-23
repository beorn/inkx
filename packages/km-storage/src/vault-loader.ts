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
import type { ProgressInfo } from "@beorn/inkx-ui";
import { parseMarkdownWithLinks } from "@km/markdown";
import { SCHEMA } from "./schema.ts";
import {
  applyEvent,
  getDb,
  resetDb,
  setDb,
  addLink,
  dbApplyEvent,
} from "./db.ts";
import { findFileByName, findChildByContent } from "./db-queries/index.ts";
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
}

/**
 * THE unified vault loading function.
 * Handles both memory and disk modes with a shared pipeline.
 *
 * @param rootPath - Directory to load (default: cwd)
 * @param options - Loading options
 * @yields Progress info for each phase
 * @returns Load result with stats and errors
 */
export function* loadVault(
  rootPath?: string,
  options?: LoadOptions,
): Generator<ProgressInfo, LoadResult, unknown> {
  const start = Date.now();
  const errors: LoadError[] = [];

  // 1. Resolve path and detect mode
  const searchAncestors = options?.searchAncestors ?? true;
  const { vaultRoot, kmDir } = resolveVaultRoot(rootPath, searchAncestors);
  const mode = kmDir ? "disk" : "memory";

  debug("loadVault", { vaultRoot, mode, force: options?.force });

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
  if (source.pendingLinks.length > 0) {
    linkCount = yield* resolveLinks(source.pendingLinks, errors);
  }

  // Materialize rules
  yield* materializeRules();

  // 5. Finalize
  const nodeCount = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count;

  // Enable real-time event application for disk mode
  if (mode === "disk") {
    setDatabase({ applyEvent: dbApplyEvent });
  }

  const duration = Date.now() - start;
  debug("loadVault complete", { mode, nodeCount, linkCount, duration });

  return { mode, nodeCount, linkCount, errors, duration };
}

// --- Types ---

interface EventSource {
  events: Event[];
  pendingLinks: PendingLink[];
}

interface PendingLink {
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
): Generator<ProgressInfo, EventSource, unknown> {
  // Phase: discover - count markdown files
  yield { phase: "discover", current: 0, total: 0 };
  const total = countMarkdownFiles(vaultRoot);
  yield { phase: "discover", current: total, total };

  // Phase: parse - scan filesystem and generate events
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
    sortOrder: number,
  ): Generator<ProgressInfo, void, unknown> {
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
              yield { phase: "parse", current, total };
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
  kmDir: string,
  force: boolean,
  errors: LoadError[],
): Generator<ProgressInfo, EventSource, unknown> {
  // Phase: discover - read and count events
  yield { phase: "discover", current: 0, total: 0 };

  const eventsPath = getEventsPath();
  if (!existsSync(eventsPath)) {
    debug("no events file at %s", eventsPath);
    yield { phase: "discover", current: 0, total: 0 };
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

  yield { phase: "discover", current: events.length, total: events.length };
  debug("discovered %d events (%d new)", allEvents.length, events.length);

  // Disk mode: links are resolved during applyEvent, no pending links
  return { events, pendingLinks: [] };
}

// --- Shared Pipeline ---

function* applyEvents(
  db: Database,
  events: Event[],
  errors: LoadError[],
): Generator<ProgressInfo, void, unknown> {
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
        yield { phase: "apply", current: i + 1, total };
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
): Generator<ProgressInfo, number, unknown> {
  const total = pendingLinks.length;
  let resolved = 0;

  yield { phase: "resolve", current: 0, total };

  for (const [i, { nodeId, link, relationship }] of pendingLinks.entries()) {
    try {
      // Find target file by name
      const fileNode = findFileByName(link.target);

      // If there's a section reference, try to find the specific child node
      let targetNode = fileNode;
      if (fileNode && link.section) {
        const childNode = findChildByContent(fileNode.id, link.section);
        if (childNode) {
          targetNode = childNode;
        }
      }

      addLink({
        source_id: nodeId,
        target_name: link.target,
        target_id: targetNode?.id ?? null,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      });

      if (targetNode) {
        resolved++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ phase: "resolve", message });
    }

    // Yield progress every 10 links
    if (i % 10 === 0 || i === total - 1) {
      yield { phase: "resolve", current: i + 1, total };
    }
  }

  return resolved;
}

function* materializeRules(): Generator<ProgressInfo, void, unknown> {
  for (const progress of evaluateAllRules()) {
    yield {
      phase: "materialize",
      current: progress.current,
      total: progress.total,
    };
  }
}
