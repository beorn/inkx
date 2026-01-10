/**
 * Reconciliation
 *
 * Compares filesystem state to database state and generates operations
 */

import { statSync, readFileSync, existsSync } from "fs";
import { dirname, basename, relative } from "path";
import { ulid } from "ulid";
import type { Node } from "@km/core";
import {
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeMoved,
  emitNodeDeleted,
} from "@km/core";
import {
  getDb,
  getNodeByPath,
  getChildren,
  addLink,
  removeLinksFromSource,
  resolveLinks,
  hashContent,
} from "@km/store";
import { parseMarkdownWithLinks } from "@km/markdown";
import { scanDirectory } from "./watcher.ts";

export interface ReconcileOp {
  type: "create" | "update" | "rename" | "delete";
  path: string;
  nodeId?: string;
  oldPath?: string;
  ino?: number;
}

/**
 * Reconcile a directory - compare filesystem to database
 */
export function reconcileDirectory(
  dirPath: string,
  vaultRoot: string,
): ReconcileOp[] {
  const ops: ReconcileOp[] = [];
  const db = getDb();

  // Get filesystem state
  const fsEntries = scanDirectory(dirPath);

  // Get database state for this directory
  const dbNodes = db
    .prepare(
      `
      SELECT * FROM nodes
      WHERE fs_path LIKE ? || '%'
      AND (type = 'folder' OR type = 'file')
    `,
    )
    .all(dirPath) as Array<Record<string, unknown>>;

  // Index by inode and path for efficient lookup
  const dbByIno = new Map<number, Record<string, unknown>>();
  const dbByPath = new Map<string, Record<string, unknown>>();

  for (const node of dbNodes) {
    if (node.fs_ino) {
      dbByIno.set(node.fs_ino as number, node);
    }
    if (node.fs_path) {
      dbByPath.set(node.fs_path as string, node);
    }
  }

  // Process filesystem entries
  for (const entry of fsEntries) {
    const existingByIno = dbByIno.get(entry.ino);
    const existingByPath = dbByPath.get(entry.path);

    if (existingByIno && (existingByIno.fs_path as string) !== entry.path) {
      // Renamed (same inode, different path)
      ops.push({
        type: "rename",
        nodeId: existingByIno.id as string,
        oldPath: existingByIno.fs_path as string,
        path: entry.path,
        ino: entry.ino,
      });
    } else if (!existingByPath) {
      // New file/folder
      ops.push({
        type: "create",
        path: entry.path,
        ino: entry.ino,
      });
    } else if (entry.mtime > (existingByPath.updated_at as number)) {
      // Modified (mtime is newer)
      ops.push({
        type: "update",
        nodeId: existingByPath.id as string,
        path: entry.path,
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
        nodeId: node.id as string,
        path,
      });
    }
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
  for (const op of ops) {
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
    for (const { nodeId, link } of wikilinks) {
      // Try to find target node by name
      const targetNode = findNodeByName(link.target);
      addLink({
        source_id: nodeId,
        target_name: link.target,
        target_id: targetNode?.id ?? null,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
      });
    }

    // Try to resolve any pending links that point to this file
    const fileName = basename(op.path).replace(/\.md$/, "");
    if (fileNode) {
      resolveLinks(fileNode.id, fileName);
    }
  }
}

/**
 * Find a node by name (for link resolution)
 */
function findNodeByName(name: string): Node | null {
  const db = getDb();
  const normalizedName = name.toLowerCase().replace(/\.md$/, "");

  // Try to find by filename or content
  const row = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'file'
    AND (
      LOWER(REPLACE(fs_path, '.md', '')) LIKE '%' || ? || '%'
      OR LOWER(json_extract(data, '$.name')) = ?
    )
    LIMIT 1
  `,
    )
    .get(normalizedName, normalizedName) as Record<string, unknown> | null;

  if (!row) return null;

  return {
    id: row.id as string,
    type: row.type as Node["type"],
    parent_id: row.parent_id as string | null,
    parent_idx: row.parent_idx as number,
    symlink_to: row.symlink_to as string | null,
    fs_path: row.fs_path as string | undefined,
    fs_ino: row.fs_ino as number | undefined,
    content: row.content as string | undefined,
    data:
      typeof row.data === "string"
        ? (JSON.parse(row.data) as Record<string, unknown>)
        : ((row.data as Record<string, unknown>) ?? {}),
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    version: row.version as string,
  };
}

/**
 * Handle file modification
 */
async function handleUpdate(op: ReconcileOp, vaultRoot: string): Promise<void> {
  if (!op.nodeId || !op.path.endsWith(".md")) {
    return;
  }

  const content = readFileSync(op.path, "utf-8");
  const contentHash = hashContent(content);

  const db = getDb();
  const existing = db
    .prepare("SELECT content_hash FROM nodes WHERE id = ?")
    .get(op.nodeId) as { content_hash: string | null } | undefined;

  // Skip if content hasn't actually changed
  if (existing?.content_hash === contentHash) {
    return;
  }

  // Get existing nodes for this file
  const existingNodes = db
    .prepare(
      `
      SELECT * FROM nodes
      WHERE fs_path = ? OR parent_id IN (
        SELECT id FROM nodes WHERE fs_path = ?
      )
    `,
    )
    .all(op.path, op.path) as Array<Record<string, unknown>>;

  // Parse new content with wikilinks
  const stat = statSync(op.path);
  const { nodes: newNodes, wikilinks } = parseMarkdownWithLinks(
    content,
    op.path,
    stat.ino,
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

  // Update wikilinks: remove old links and add new ones
  for (const node of newNodes) {
    removeLinksFromSource(node.id);
  }

  for (const { nodeId, link } of wikilinks) {
    const targetNode = findNodeByName(link.target);
    addLink({
      source_id: nodeId,
      target_name: link.target,
      target_id: targetNode?.id ?? null,
      section: link.section ?? null,
      block_id: link.blockId ?? null,
      alias: link.alias ?? null,
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
  node?: Node;
  changes?: Record<string, unknown>;
}

function diffNodes(
  existing: Array<Record<string, unknown>>,
  newNodes: Node[],
): NodeChange[] {
  const changes: NodeChange[] = [];

  // Index existing by position (for matching)
  const existingByPos = new Map<number, Record<string, unknown>>();
  for (const node of existing) {
    if (node.md_pos !== undefined) {
      existingByPos.set(node.md_pos as number, node);
    }
  }

  // Index new by position
  const newByPos = new Map<number, Node>();
  for (const node of newNodes) {
    if (node.md_pos !== undefined) {
      newByPos.set(node.md_pos, node);
    }
  }

  // Find created/updated nodes
  for (const node of newNodes) {
    if (node.md_pos === undefined) continue;

    const existingNode = existingByPos.get(node.md_pos);

    if (!existingNode) {
      // New node
      changes.push({
        type: "created",
        node,
      });
    } else {
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

      if (Object.keys(nodeChanges).length > 0) {
        changes.push({
          type: "updated",
          nodeId: existingNode.id as string,
          changes: nodeChanges,
        });
      }

      existingByPos.delete(node.md_pos);
    }
  }

  // Remaining existing nodes were deleted
  for (const [, node] of existingByPos) {
    changes.push({
      type: "deleted",
      nodeId: node.id as string,
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
