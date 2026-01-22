/**
 * Reconciliation
 *
 * Compares filesystem state to database state and generates operations
 */

import createDebug from "debug";
import { statSync, readFileSync, existsSync } from "fs";

const debug = createDebug("km:storage:watch:reconcile");
import { dirname, basename, relative } from "path";
import { ulid } from "ulid";
import type { KNode } from "@km/core";
import {
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
} from "../emit.ts";
import {
  getNodeByPath,
  getNodesUnderPath,
  getFileWithChildren,
  getNodeContentHash,
  findFileByName,
  getChildren,
  addLink,
  removeLinksFromSource,
  resolveLinks,
  hashContent,
  parseMarkdownWithLinks,
} from "../index.ts";
import { scanDirectory } from "./watcher.ts";

export interface ReconcileOp {
  type: "create" | "update" | "rename" | "delete";
  path: string;
  nodeId?: string;
  oldPath?: string;
  ino?: number;
  mtime?: number;
}

/**
 * Reconcile a directory - compare filesystem to database
 */
export function reconcileDirectory(
  dirPath: string,
  vaultRoot: string,
  ignorePatterns?: string[],
): ReconcileOp[] {
  const ops: ReconcileOp[] = [];

  // Get filesystem state (pass ignore patterns to filter out ignored files)
  const fsEntries = scanDirectory(dirPath, ignorePatterns);

  // Get database state for this directory (using km-storage abstraction)
  const dbNodes = getNodesUnderPath(dirPath);

  debug("reconciling %s: %d fs entries, %d db nodes", dirPath, fsEntries.length, dbNodes.length);

  // Index by inode and path for efficient lookup
  const dbByIno = new Map<number, KNode>();
  const dbByPath = new Map<string, KNode>();

  for (const node of dbNodes) {
    if (node.fs_ino) {
      dbByIno.set(node.fs_ino, node);
    }
    if (node.fs_path) {
      dbByPath.set(node.fs_path, node);
    }
  }

  // Process filesystem entries
  for (const entry of fsEntries) {
    const existingByIno = dbByIno.get(entry.ino);
    const existingByPath = dbByPath.get(entry.path);

    if (existingByIno && existingByIno.fs_path !== entry.path) {
      // Renamed (same inode, different path)
      ops.push({
        type: "rename",
        nodeId: existingByIno.id,
        oldPath: existingByIno.fs_path,
        path: entry.path,
        ino: entry.ino,
      });
    } else if (!existingByPath) {
      // New file/folder
      ops.push({
        type: "create",
        path: entry.path,
        ino: entry.ino,
        mtime: entry.mtime,
      });
    } else if (entry.mtime !== existingByPath.fs_mtime) {
      // Modified (mtime changed - works for both forward and backward time changes)
      ops.push({
        type: "update",
        nodeId: existingByPath.id,
        path: entry.path,
        mtime: entry.mtime,
      });
    }

    // Remove from dbByPath so we can find deletions
    dbByPath.delete(entry.path);
  }

  // Remaining in dbByPath are deleted
  for (const [path, node] of dbByPath) {
    // Only include if it's directly in this directory
    if (dirname(path) === dirPath) {
      ops.push({
        type: "delete",
        nodeId: node.id,
        path,
      });
    }
  }

  if (ops.length > 0) {
    debug("generated %d ops: %O", ops.length, ops.map(o => ({ type: o.type, path: o.path })));
  }

  return ops;
}

/**
 * Apply reconciliation operations
 */
export async function applyReconcileOps(
  ops: ReconcileOp[],
  vaultRoot: string,
): Promise<void> {
  debug("applying %d reconcile ops", ops.length);
  const start = Date.now();

  for (const op of ops) {
    debug("applying op: %s %s", op.type, op.path);
    switch (op.type) {
      case "create":
        await handleCreate(op, vaultRoot);
        break;
      case "update":
        await handleUpdate(op, vaultRoot);
        break;
      case "rename":
        await handleRename(op);
        break;
      case "delete":
        handleDelete(op);
        break;
    }
  }

  debug("applied %d ops in %dms", ops.length, Date.now() - start);
}

/**
 * Ensure all ancestor folders exist as nodes, creating them if needed.
 * Returns the ID of the immediate parent folder node.
 */
function ensureFolderHierarchy(path: string, vaultRoot: string): string | null {
  const parentPath = dirname(path);

  // If we're at or above the vault root, no parent
  if (
    parentPath === vaultRoot ||
    parentPath === dirname(vaultRoot) ||
    parentPath === path
  ) {
    return null;
  }

  // Check if parent folder node already exists
  const parentNode = getNodeByPath(parentPath);
  if (parentNode) {
    return parentNode.id;
  }

  // Recursively ensure grandparent exists first
  const grandparentId = ensureFolderHierarchy(parentPath, vaultRoot);

  // Create the parent folder node
  try {
    const stat = statSync(parentPath);
    const folderId = ulid();
    emitNodeCreated("fs-watch", {
      id: folderId,
      type: "folder",
      fs_path: parentPath,
      fs_ino: stat.ino,
      fs_mtime: stat.mtimeMs,
      parent_id: grandparentId,
      content: basename(parentPath),
      data: { name: basename(parentPath) },
    });
    return folderId;
  } catch {
    // Parent folder doesn't exist on filesystem
    return null;
  }
}

/**
 * Handle new file/folder creation
 */
async function handleCreate(op: ReconcileOp, vaultRoot: string): Promise<void> {
  const stat = statSync(op.path);

  // Ensure all parent folders exist as nodes
  const parentId = ensureFolderHierarchy(op.path, vaultRoot);

  if (stat.isDirectory()) {
    // Create folder node
    emitNodeCreated("fs-watch", {
      id: ulid(),
      type: "folder",
      fs_path: op.path,
      fs_ino: op.ino,
      fs_mtime: op.mtime ?? stat.mtimeMs,
      parent_id: parentId,
      content: basename(op.path),
      data: { name: basename(op.path) },
    });
  } else if (op.path.endsWith(".md")) {
    // Parse markdown file and create nodes with wikilinks
    const content = readFileSync(op.path, "utf-8");
    const { nodes, wikilinks } = parseMarkdownWithLinks(
      content,
      op.path,
      op.ino,
      op.mtime ?? stat.mtimeMs,
    );

    // Set parent for file node
    const fileNode = nodes[0];
    if (fileNode) {
      fileNode.parent_id = parentId;
    }

    // Emit creation events for all nodes
    for (const node of nodes) {
      emitNodeCreated("fs-watch", node as unknown as Record<string, unknown>);
    }

    // Store wikilinks and try to resolve them
    for (const { nodeId, link, relationship } of wikilinks) {
      // Try to find target node by name
      const targetNode = findNodeByName(link.target);
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
    }

    // Try to resolve any pending links that point to this file
    const fileName = basename(op.path).replace(/\.md$/, "");
    if (fileNode) {
      resolveLinks(fileNode.id, fileName);
    }
  }
}

// Use km-storage's findFileByName for link resolution (aliased as findNodeByName for local use)
const findNodeByName = findFileByName;

/**
 * Handle file modification
 */
async function handleUpdate(op: ReconcileOp, vaultRoot: string): Promise<void> {
  if (!op.nodeId || !op.path.endsWith(".md")) {
    return;
  }

  const content = readFileSync(op.path, "utf-8");
  const contentHash = hashContent(content);

  // Use km-storage abstraction to get content hash
  const existingHash = getNodeContentHash(op.nodeId);

  // Skip if content hasn't actually changed
  if (existingHash === contentHash) {
    return;
  }

  // Get existing nodes for this file using km-storage abstraction
  const existingNodes = getFileWithChildren(op.path);

  // Parse new content with wikilinks
  const stat = statSync(op.path);
  const newMtime = op.mtime ?? stat.mtimeMs;
  const { nodes: newNodes, wikilinks } = parseMarkdownWithLinks(
    content,
    op.path,
    stat.ino,
    newMtime,
  );

  // Diff and emit changes
  const changes = diffNodes(existingNodes, newNodes);

  for (const change of changes) {
    switch (change.type) {
      case "created":
        if (change.node) {
          emitNodeCreated(
            "fs-watch",
            change.node as unknown as Record<string, unknown>,
          );
        }
        break;
      case "updated":
        if (change.nodeId && change.changes) {
          emitNodeUpdated("fs-watch", change.nodeId, change.changes);
        }
        break;
      case "deleted":
        if (change.nodeId) emitNodeDeleted("fs-watch", change.nodeId);
        break;
    }
  }

  // Always update the file node's fs_mtime to track the last synced mtime
  if (op.nodeId) {
    emitNodeUpdated("fs-watch", op.nodeId, { fs_mtime: newMtime });
  }

  // Update wikilinks: remove old links and add new ones
  for (const node of newNodes) {
    removeLinksFromSource(node.id);
  }

  for (const { nodeId, link, relationship } of wikilinks) {
    const targetNode = findNodeByName(link.target);
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
  }
}

/**
 * Handle file/folder rename
 */
async function handleRename(op: ReconcileOp): Promise<void> {
  if (!op.nodeId) return;

  emitNodeUpdated("fs-watch", op.nodeId, {
    fs_path: op.path,
  });
}

/**
 * Handle file/folder deletion
 */
function handleDelete(op: ReconcileOp): void {
  if (!op.nodeId) return;

  emitNodeDeleted("fs-watch", op.nodeId);
}

/**
 * Diff existing nodes against new nodes
 */
interface NodeChange {
  type: "created" | "updated" | "deleted";
  nodeId?: string;
  node?: KNode;
  changes?: Record<string, unknown>;
}

/**
 * Match nodes by structural position (parent_id + parent_idx + type).
 * This is more stable than md_pos which shifts when content changes.
 */
function makeStructuralKey(node: KNode): string {
  return `${node.parent_id ?? "root"}:${node.parent_idx ?? 0}:${node.type}`;
}

function diffNodes(existing: KNode[], newNodes: KNode[]): NodeChange[] {
  const changes: NodeChange[] = [];

  // Index existing by structural key (parent + index + type)
  const existingByKey = new Map<string, KNode>();
  for (const node of existing) {
    const key = makeStructuralKey(node);
    existingByKey.set(key, node);
  }

  // Map from new node IDs to existing node IDs (for parent_id remapping)
  const idMap = new Map<string, string>();

  // First pass: match file nodes by type (always root)
  const existingFile = existing.find((n) => n.type === "file");
  const newFile = newNodes.find((n) => n.type === "file");
  if (existingFile && newFile) {
    idMap.set(newFile.id, existingFile.id);
  }

  // Process non-file nodes with remapped parent IDs
  for (const node of newNodes) {
    if (node.type === "file") continue;

    // Remap parent_id for key lookup
    const remappedParentId = node.parent_id ? (idMap.get(node.parent_id) ?? node.parent_id) : null;
    const key = `${remappedParentId ?? "root"}:${node.parent_idx ?? 0}:${node.type}`;

    const existingNode = existingByKey.get(key);

    if (!existingNode) {
      // New node - need to remap its parent_id to existing parent
      const nodeToCreate = { ...node };
      if (nodeToCreate.parent_id && idMap.has(nodeToCreate.parent_id)) {
        nodeToCreate.parent_id = idMap.get(nodeToCreate.parent_id)!;
      }
      changes.push({
        type: "created",
        node: nodeToCreate,
      });
    } else {
      // Map new ID to existing ID for child nodes
      idMap.set(node.id, existingNode.id);

      // Check for changes
      const nodeChanges: Record<string, unknown> = {};

      if (node.content !== existingNode.content) {
        nodeChanges.content = node.content;
      }
      if (node.task_status !== existingNode.task_status) {
        nodeChanges.task_status = node.task_status;
      }
      if (node.task_mark !== existingNode.task_mark) {
        nodeChanges.task_mark = node.task_mark;
      }
      // Compare data field for mentions, tags, projects changes
      const newData = JSON.stringify(node.data ?? {});
      const existingData = JSON.stringify(existingNode.data ?? {});
      if (newData !== existingData) {
        nodeChanges.data = node.data;
      }
      // Update md_pos since it may have shifted
      if (node.md_pos !== existingNode.md_pos) {
        nodeChanges.md_pos = node.md_pos;
      }

      if (Object.keys(nodeChanges).length > 0) {
        changes.push({
          type: "updated",
          nodeId: existingNode.id,
          changes: nodeChanges,
        });
      }

      existingByKey.delete(key);
    }
  }

  // Handle file node updates
  if (existingFile && newFile) {
    const nodeChanges: Record<string, unknown> = {};
    if (newFile.content !== existingFile.content) {
      nodeChanges.content = newFile.content;
    }
    if (newFile.title !== existingFile.title) {
      nodeChanges.title = newFile.title;
    }
    const newData = JSON.stringify(newFile.data ?? {});
    const existingData = JSON.stringify(existingFile.data ?? {});
    if (newData !== existingData) {
      nodeChanges.data = newFile.data;
    }
    if (Object.keys(nodeChanges).length > 0) {
      changes.push({
        type: "updated",
        nodeId: existingFile.id,
        changes: nodeChanges,
      });
    }
    // Remove file from remaining check
    const fileKey = makeStructuralKey(existingFile);
    existingByKey.delete(fileKey);
  }

  // Remaining existing nodes were deleted
  for (const [, node] of existingByKey) {
    // Don't delete file nodes
    if (node.type === "file") continue;
    changes.push({
      type: "deleted",
      nodeId: node.id,
    });
  }

  return changes;
}

/**
 * Get parent node ID from filesystem path
 */
export function getParentNodeId(fsPath: string): string | null {
  const parentPath = dirname(fsPath);
  const parentNode = getNodeByPath(parentPath);
  return parentNode?.id ?? null;
}
