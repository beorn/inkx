/**
 * Verifier
 *
 * Verification functions for chaos test assertions.
 */

import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import type { IVerifier, ExpectedState, VerificationResult } from "./types.ts";
import {
  getAllNodes,
  getNodeByPath,
  getChildren,
  getNode,
} from "../../../src/index.ts";

export class Verifier implements IVerifier {
  verifyState(expected: ExpectedState): VerificationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const nodes = getAllNodes();

    // Check expected files exist as nodes
    for (const filePath of expected.files) {
      const node = getNodeByPath(filePath);
      if (!node) {
        errors.push(`Missing expected file node: ${filePath}`);
      }
    }

    // Check deleted files don't exist as nodes
    for (const filePath of expected.deletedFiles ?? []) {
      const node = getNodeByPath(filePath);
      if (node) {
        errors.push(`Node still exists for deleted file: ${filePath}`);
      }
    }

    // Check node count (sanity check)
    if (expected.nodeCount !== undefined) {
      if (nodes.length !== expected.nodeCount) {
        warnings.push(
          `Node count mismatch: expected ${expected.nodeCount}, got ${nodes.length}`,
        );
      }
    }

    // Check specific node properties
    for (const spec of expected.nodes ?? []) {
      const node = getNodeByPath(spec.path);
      if (!node) {
        errors.push(`Missing node: ${spec.path}`);
        continue;
      }

      if (node.type !== spec.type) {
        errors.push(
          `Type mismatch for ${spec.path}: expected ${spec.type}, got ${node.type}`,
        );
      }

      if (spec.content !== undefined && node.content !== spec.content) {
        errors.push(
          `Content mismatch for ${spec.path}: expected "${spec.content}", got "${node.content}"`,
        );
      }

      if (spec.task_status !== undefined && node.task_status !== spec.task_status) {
        errors.push(
          `Task status mismatch for ${spec.path}: expected ${spec.task_status}, got ${node.task_status}`,
        );
      }

      if (spec.children !== undefined) {
        const children = getChildren(node.id);
        if (children.length !== spec.children) {
          errors.push(
            `Children count mismatch for ${spec.path}: expected ${spec.children}, got ${children.length}`,
          );
        }
      }
    }

    const fileNodes = nodes.filter((n) => n.type === "file");

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      stats: {
        expectedFiles: expected.files.length,
        actualFiles: fileNodes.length,
        duplicateNodes: 0, // Will be calculated by verifyNoDuplicates
        orphanedNodes: 0,
        missingParents: 0,
      },
    };
  }

  verifyNoDuplicates(): VerificationResult {
    const nodes = getAllNodes();
    const errors: string[] = [];
    const pathCounts = new Map<string, number>();

    // Count nodes per fs_path
    for (const node of nodes) {
      if (node.fs_path) {
        pathCounts.set(node.fs_path, (pathCounts.get(node.fs_path) ?? 0) + 1);
      }
    }

    let duplicateCount = 0;
    for (const [path, count] of pathCounts) {
      if (count > 1) {
        errors.push(`Duplicate nodes for path: ${path} (count: ${count})`);
        duplicateCount += count - 1;
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
      stats: {
        expectedFiles: 0,
        actualFiles: 0,
        duplicateNodes: duplicateCount,
        orphanedNodes: 0,
        missingParents: 0,
      },
    };
  }

  verifyParentIntegrity(): VerificationResult {
    const nodes = getAllNodes();
    const errors: string[] = [];
    const nodeIds = new Set(nodes.map((n) => n.id));
    let missingParents = 0;
    let orphaned = 0;

    for (const node of nodes) {
      // Check parent_id references valid node
      if (node.parent_id && !nodeIds.has(node.parent_id)) {
        errors.push(`Node ${node.id} has invalid parent_id: ${node.parent_id}`);
        missingParents++;
      }

      // Check for orphaned nodes (non-root, non-folder with no parent but has fs_path suggesting nesting)
      if (node.type !== "folder" && !node.parent_id && node.fs_path) {
        const pathParts = node.fs_path.split("/");
        // If path has multiple segments, probably should have a parent
        if (pathParts.length > 2 && node.type !== "file") {
          orphaned++;
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
      stats: {
        expectedFiles: 0,
        actualFiles: 0,
        duplicateNodes: 0,
        orphanedNodes: orphaned,
        missingParents,
      },
    };
  }

  verifyFilePaths(): VerificationResult {
    const nodes = getAllNodes();
    const errors: string[] = [];

    const fsNodes = nodes.filter((n) => n.type === "file" || n.type === "folder");

    for (const node of fsNodes) {
      if (!node.fs_path) {
        errors.push(`${node.type} node ${node.id} missing fs_path`);
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
      stats: {
        expectedFiles: 0,
        actualFiles: fsNodes.filter((n) => n.type === "file").length,
        duplicateNodes: 0,
        orphanedNodes: 0,
        missingParents: 0,
      },
    };
  }

  verifyTreeConsistency(): VerificationResult {
    const results = [
      this.verifyNoDuplicates(),
      this.verifyParentIntegrity(),
      this.verifyFilePaths(),
    ];

    return {
      passed: results.every((r) => r.passed),
      errors: results.flatMap((r) => r.errors),
      warnings: results.flatMap((r) => r.warnings),
      stats: {
        expectedFiles: 0,
        actualFiles: 0,
        duplicateNodes: results.reduce((s, r) => s + r.stats.duplicateNodes, 0),
        orphanedNodes: results.reduce((s, r) => s + r.stats.orphanedNodes, 0),
        missingParents: results.reduce((s, r) => s + r.stats.missingParents, 0),
      },
    };
  }

  verifyFsDbSync(vaultPath: string): VerificationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Scan filesystem for markdown files
    const fsFiles = new Set<string>();
    scanDir(vaultPath, fsFiles);

    // Get database file nodes
    const nodes = getAllNodes();
    const dbFiles = new Set(
      nodes.filter((n) => n.type === "file" && n.fs_path).map((n) => n.fs_path!),
    );

    // Check for files in filesystem but not in database
    for (const path of fsFiles) {
      if (!dbFiles.has(path)) {
        errors.push(`File in filesystem but not in database: ${path}`);
      }
    }

    // Check for files in database but not in filesystem
    for (const path of dbFiles) {
      if (!fsFiles.has(path)) {
        errors.push(`File in database but not in filesystem: ${path}`);
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      stats: {
        expectedFiles: fsFiles.size,
        actualFiles: dbFiles.size,
        duplicateNodes: 0,
        orphanedNodes: 0,
        missingParents: 0,
      },
    };
  }

  verifyAll(expected: ExpectedState, vaultPath: string): VerificationResult {
    const results = [
      this.verifyState(expected),
      this.verifyTreeConsistency(),
      this.verifyFsDbSync(vaultPath),
    ];

    return {
      passed: results.every((r) => r.passed),
      errors: results.flatMap((r) => r.errors),
      warnings: results.flatMap((r) => r.warnings),
      stats: {
        expectedFiles: expected.files.length,
        actualFiles: results[0].stats.actualFiles,
        duplicateNodes: results[1].stats.duplicateNodes,
        orphanedNodes: results[1].stats.orphanedNodes,
        missingParents: results[1].stats.missingParents,
      },
    };
  }
}

/**
 * Recursively scan directory for markdown files
 */
function scanDir(dir: string, files: Set<string>): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    // Skip hidden files and common ignore patterns
    if (entry.startsWith(".")) continue;
    if (entry === "node_modules") continue;

    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, files);
      } else if (entry.endsWith(".md")) {
        files.add(fullPath);
      }
    } catch {
      // Skip files we can't stat
    }
  }
}

/**
 * Create a verifier instance
 */
export function createVerifier(): Verifier {
  return new Verifier();
}

/**
 * Quick verification - just check no duplicates and tree consistency
 */
export function quickVerify(): VerificationResult {
  const verifier = new Verifier();
  return verifier.verifyTreeConsistency();
}
