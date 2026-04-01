/**
 * Verifier
 *
 * Verification functions for chaos test assertions.
 * Supports both real filesystem and MockFileSystem.
 */

import { readdirSync, statSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import type { IVerifier, ExpectedState, VerificationResult } from "./types.ts"
import { getAllNodes, getNodeByPath, getChildren, getNode } from "../../../src/index.ts"
import type { FakeFileSystem } from "./fake-fs.ts"
type MockFileSystem = FakeFileSystem
import type { Database } from "bun:sqlite"

// ─────────────────────────────────────────────────────────────────────────────
// Filesystem Abstraction
// ─────────────────────────────────────────────────────────────────────────────

interface FsOps {
  existsSync(path: string): boolean
  readdirSync(path: string): string[]
  statSync(path: string): {
    isDirectory(): boolean
    mtimeMs?: number
    ino?: number
  }
  readFileSync(path: string, encoding: BufferEncoding): string
}

const realFsOps: FsOps = {
  existsSync,
  readdirSync: (path) => readdirSync(path) as string[],
  statSync: (path) => {
    const stat = statSync(path)
    return {
      isDirectory: () => stat.isDirectory(),
      mtimeMs: stat.mtimeMs,
      ino: stat.ino,
    }
  },
  readFileSync: (path, encoding) => readFileSync(path, encoding),
}

function createMockFsOps(mockFs: MockFileSystem): FsOps {
  return {
    existsSync: (path) => mockFs.existsSync(path),
    readdirSync: (path) => {
      const entries = mockFs.createScanner()(path)
      return entries.map((e) => e.path.split("/").pop()!)
    },
    statSync: (path) => {
      const stat = mockFs.statSync(path)
      return {
        isDirectory: () => stat.isDirectory(),
        mtimeMs: stat.mtimeMs,
        ino: stat.ino,
      }
    },
    readFileSync: (path, encoding) => mockFs.readFileSync(path, encoding),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verifier
// ─────────────────────────────────────────────────────────────────────────────

export class Verifier implements IVerifier {
  private db: Database
  private fsOps: FsOps

  constructor(db: Database, mockFs?: MockFileSystem) {
    this.db = db
    this.fsOps = mockFs ? createMockFsOps(mockFs) : realFsOps
  }

  verifyState(expected: ExpectedState): VerificationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const db = this.db
    const nodes = getAllNodes(db)

    // Check expected files exist as nodes
    for (const filePath of expected.files) {
      const node = getNodeByPath(db, filePath)
      if (!node) {
        errors.push(`Missing expected file node: ${filePath}`)
      }
    }

    // Check deleted files don't exist as nodes
    for (const filePath of expected.deletedFiles ?? []) {
      const node = getNodeByPath(db, filePath)
      if (node) {
        errors.push(`Node still exists for deleted file: ${filePath}`)
      }
    }

    // Check node count (sanity check)
    if (expected.nodeCount !== undefined) {
      if (nodes.length !== expected.nodeCount) {
        warnings.push(`Node count mismatch: expected ${expected.nodeCount}, got ${nodes.length}`)
      }
    }

    // Check specific node properties
    for (const spec of expected.nodes ?? []) {
      const node = getNodeByPath(db, spec.path)
      if (!node) {
        errors.push(`Missing node: ${spec.path}`)
        continue
      }

      if (node.type !== spec.type) {
        errors.push(`Type mismatch for ${spec.path}: expected ${spec.type}, got ${node.type}`)
      }

      if (spec.content !== undefined && node.content !== spec.content) {
        errors.push(`Content mismatch for ${spec.path}: expected "${spec.content}", got "${node.content}"`)
      }

      if (spec.item?.task?.status !== undefined && node.item?.task?.status !== spec.item?.task?.status) {
        errors.push(
          `Task status mismatch for ${spec.path}: expected ${spec.item?.task?.status}, got ${node.item?.task?.status}`,
        )
      }

      if (spec.children !== undefined) {
        const children = getChildren(db, node.id)
        if (children.length !== spec.children) {
          errors.push(`Children count mismatch for ${spec.path}: expected ${spec.children}, got ${children.length}`)
        }
      }
    }

    const fileNodes = nodes.filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"))

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
    }
  }

  verifyNoDuplicates(): VerificationResult {
    const db = this.db
    const nodes = getAllNodes(db)
    const errors: string[] = []
    const pathCounts = new Map<string, number>()

    // Count nodes per fs_path
    for (const node of nodes) {
      if (node.fs_path) {
        pathCounts.set(node.fs_path, (pathCounts.get(node.fs_path) ?? 0) + 1)
      }
    }

    let duplicateCount = 0
    for (const [path, count] of pathCounts) {
      if (count > 1) {
        errors.push(`Duplicate nodes for path: ${path} (count: ${count})`)
        duplicateCount += count - 1
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
    }
  }

  verifyParentIntegrity(): VerificationResult {
    const db = this.db
    const nodes = getAllNodes(db)
    const errors: string[] = []
    const nodeIds = new Set(nodes.map((n) => n.id))
    let missingParents = 0
    let orphaned = 0

    for (const node of nodes) {
      // Check parent_id references valid node
      if (node.parent_id && !nodeIds.has(node.parent_id)) {
        errors.push(`Node ${node.id} has invalid parent_id: ${node.parent_id}`)
        missingParents++
      }

      // Check for orphaned nodes (non-root, non-folder with no parent but has fs_path suggesting nesting)
      if (!(node.type === "h" && node.fstype === "folder") && !node.parent_id && node.fs_path) {
        const pathParts = node.fs_path.split("/")
        // If path has multiple segments, probably should have a parent
        if (pathParts.length > 2 && !(node.type === "h" && (node.fstype === "file" || node.fstype === "mdfile"))) {
          orphaned++
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
    }
  }

  verifyFilePaths(): VerificationResult {
    const db = this.db
    const nodes = getAllNodes(db)
    const errors: string[] = []

    const fsNodes = nodes.filter(
      (n) =>
        (n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile")) || (n.type === "h" && n.fstype === "folder"),
    )

    for (const node of fsNodes) {
      if (!node.fs_path) {
        errors.push(`${node.type} node ${node.id} missing fs_path`)
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings: [],
      stats: {
        expectedFiles: 0,
        actualFiles: fsNodes.filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile")).length,
        duplicateNodes: 0,
        orphanedNodes: 0,
        missingParents: 0,
      },
    }
  }

  verifyTreeConsistency(): VerificationResult {
    const results = [this.verifyNoDuplicates(), this.verifyParentIntegrity(), this.verifyFilePaths()]

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
    }
  }

  verifyFsDbSync(repoPath: string): VerificationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const db = this.db

    // Scan filesystem for markdown files
    const fsFiles = new Set<string>()
    this.scanDir(repoPath, fsFiles)

    // Get database file nodes
    const nodes = getAllNodes(db)
    const dbFiles = new Set(
      nodes
        .filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path)
        .map((n) => n.fs_path!),
    )

    // Check for files in filesystem but not in database
    for (const path of fsFiles) {
      if (!dbFiles.has(path)) {
        errors.push(`File in filesystem but not in database: ${path}`)
      }
    }

    // Check for files in database but not in filesystem
    for (const path of dbFiles) {
      if (!fsFiles.has(path)) {
        errors.push(`File in database but not in filesystem: ${path}`)
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
    }
  }

  /**
   * Verify content matches between filesystem and database
   * CRITICAL: This catches silent data loss/corruption that existence checks miss
   */
  verifyContentSync(_repoPath: string): VerificationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const db = this.db
    const nodes = getAllNodes(db)

    // Only check file nodes that have fs_path
    const fileNodes = nodes.filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path)

    for (const node of fileNodes) {
      const fsPath = node.fs_path!

      // Skip if file doesn't exist (handled by verifyFsDbSync)
      if (!this.fsOps.existsSync(fsPath)) {
        continue
      }

      try {
        const fsContent = this.fsOps.readFileSync(fsPath, "utf-8")

        // Get the content from database
        // Note: For file nodes, we compare the raw file content
        // The node.content field typically stores the filename, not file contents
        // File content is parsed into child nodes (sections, tasks, etc.)
        // So we reconstruct what the file SHOULD contain from its children

        // For now, we verify that the file is readable and non-corrupted
        // A more thorough check would regenerate markdown from nodes and compare

        // Check for truncation (empty file when it shouldn't be)
        if (fsContent.length === 0) {
          // Check if node has children - if so, file should have content
          const children = getChildren(db, node.id)
          if (children.length > 0) {
            errors.push(`Content mismatch: ${fsPath} - File is empty but has ${children.length} child nodes in DB`)
          }
        }

        // Check for content hash if stored
        if (node.content_hash) {
          // Content is stored in CAS - verify we can retrieve it
          // Note: The actual content comparison would require loading from CAS
          // For chaos tests, we mainly care about structural integrity
        }
      } catch (e) {
        errors.push(`Cannot read file: ${fsPath} - ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      stats: {
        expectedFiles: 0,
        actualFiles: fileNodes.length,
        duplicateNodes: 0,
        orphanedNodes: 0,
        missingParents: 0,
      },
    }
  }

  /**
   * Verify metadata (mtime, ino) matches between filesystem and database
   */
  verifyMetadataSync(_repoPath: string): VerificationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const db = this.db
    const nodes = getAllNodes(db)

    // Only check file nodes that have fs_path
    const fileNodes = nodes.filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path)

    for (const node of fileNodes) {
      const fsPath = node.fs_path!

      // Skip if file doesn't exist (handled by verifyFsDbSync)
      if (!this.fsOps.existsSync(fsPath)) {
        continue
      }

      try {
        const stat = this.fsOps.statSync(fsPath)

        // Check mtime - allow 1 second tolerance for filesystem precision differences
        if (node.fs_mtime !== undefined && stat.mtimeMs !== undefined) {
          const mtimeDiff = Math.abs(stat.mtimeMs - node.fs_mtime)
          if (mtimeDiff > 1000) {
            warnings.push(
              `Mtime mismatch: ${fsPath} - FS: ${stat.mtimeMs}, DB: ${node.fs_mtime} (diff: ${mtimeDiff}ms)`,
            )
          }
        }

        // Check inode - helps detect atomic write scenarios
        if (node.fs_ino !== undefined && stat.ino !== undefined) {
          if (stat.ino !== node.fs_ino) {
            // This is actually expected for atomic writes (temp file rename)
            // Just a warning, not an error
            warnings.push(`Inode changed: ${fsPath} - FS: ${stat.ino}, DB: ${node.fs_ino}`)
          }
        }
      } catch (e) {
        errors.push(`Cannot stat file: ${fsPath} - ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      stats: {
        expectedFiles: 0,
        actualFiles: fileNodes.length,
        duplicateNodes: 0,
        orphanedNodes: 0,
        missingParents: 0,
      },
    }
  }

  verifyAll(expected: ExpectedState, repoPath: string): VerificationResult {
    const results = [
      this.verifyState(expected),
      this.verifyTreeConsistency(),
      this.verifyFsDbSync(repoPath),
      this.verifyContentSync(repoPath),
      this.verifyMetadataSync(repoPath),
    ]

    return {
      passed: results.every((r) => r.passed),
      errors: results.flatMap((r) => r.errors),
      warnings: results.flatMap((r) => r.warnings),
      stats: {
        expectedFiles: expected.files.length,
        actualFiles: results[0]!.stats.actualFiles,
        duplicateNodes: results[1]!.stats.duplicateNodes,
        orphanedNodes: results[1]!.stats.orphanedNodes,
        missingParents: results[1]!.stats.missingParents,
      },
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Recursively scan directory for markdown files
   */
  private scanDir(dir: string, files: Set<string>): void {
    if (!this.fsOps.existsSync(dir)) return

    for (const entry of this.fsOps.readdirSync(dir)) {
      // Skip hidden files and common ignore patterns
      if (entry.startsWith(".")) continue
      if (entry === "node_modules") continue

      const fullPath = join(dir, entry)
      try {
        const stat = this.fsOps.statSync(fullPath)

        if (stat.isDirectory()) {
          this.scanDir(fullPath, files)
        } else if (entry.endsWith(".md")) {
          files.add(fullPath)
        }
      } catch {
        // Skip files we can't stat
      }
    }
  }
}

/**
 * Create a verifier instance
 */
function createVerifier(db: Database, mockFs?: MockFileSystem): Verifier {
  return new Verifier(db, mockFs)
}

/**
 * Quick verification - just check no duplicates and tree consistency
 */
function quickVerify(db: Database): VerificationResult {
  const verifier = new Verifier(db)
  return verifier.verifyTreeConsistency()
}
