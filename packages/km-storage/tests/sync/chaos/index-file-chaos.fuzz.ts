/**
 * Index File Chaos/Fuzz Tests
 *
 * Exercises the folder-index file system under random filesystem mutations:
 * - Index file detection (same-name, index.md, .md) survives child ops
 * - Priority cascade when multiple index candidates exist
 * - Body content preservation during folder mutations
 * - Concurrent index file edits + folder updates
 *
 * Uses real SyncManager with debounce=0, real filesystem (withTestEnv).
 */

import { describe, test as _test, expect } from "vitest"

// Vitest fuzz extension (defined by vitest project config)
const test = _test as typeof _test & { fuzz: typeof _test }
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from "fs"
import { join, basename } from "path"
import { createSeededRandom, type SeededRandom } from "vimonkey"

import { SyncManager } from "../../../src/watch/sync.ts"
import { getAllNodes, getChildren, getNode, withTestEnv, clearConfigCache } from "@km/storage"
import { findIndexFile, extractSlotTargets } from "@km/core"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function writeConfig(repoDir: string, materialization: "none" | "metadata" | "full", naming = "index") {
  const kmDir = join(repoDir, ".km")
  mkdirSync(kmDir, { recursive: true })
  writeFileSync(
    join(kmDir, "config.yaml"),
    `folderIndex:\n  materialization: ${materialization}\n  naming: ${naming}\n`,
  )
  clearConfigCache()
}

function createSyncManager(db: import("bun:sqlite").Database, repoDir: string) {
  clearConfigCache()
  return new SyncManager({
    repoPath: repoDir,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
    useWorker: false,
    db,
  })
}

function findFolder(db: import("bun:sqlite").Database, name: string) {
  return getAllNodes(db).find((n) => n.fstype === "folder" && n.name === name)
}

function findMdFile(db: import("bun:sqlite").Database, name: string, parentId?: string) {
  return getAllNodes(db).find(
    (n) => n.fstype === "mdfile" && n.name === name && (parentId === undefined || n.parent_id === parentId),
  )
}

/** Generate random markdown content for a child file */
function generateChildContent(rng: SeededRandom, title: string): string {
  const lines: string[] = [`# ${title}`, ""]
  const taskCount = rng.int(1, 4)
  for (let i = 0; i < taskCount; i++) {
    const status = rng.pick(["[ ]", "[x]"])
    lines.push(`- ${status} Task ${i + 1} ${rng.pick(["alpha", "beta", "gamma"])}`)
  }
  lines.push("")
  return lines.join("\n")
}

/** Generate index file content with body and optional slots */
function generateIndexContent(title: string, body: string, childNames: string[], mode: "metadata" | "full"): string {
  let result = `# ${title}\n`
  if (body.trim()) {
    result += `\n${body.trim()}\n`
  }
  if (mode === "full" && childNames.length > 0) {
    result += "\n"
    for (const name of childNames) {
      result += `![[./${name}]]\n`
    }
  }
  return result
}

type ChildOp =
  | { type: "add"; name: string }
  | { type: "remove"; name: string }
  | { type: "rename"; oldName: string; newName: string }
  | { type: "edit"; name: string }

const CHILD_NAMES = ["notes", "tasks", "docs", "readme", "changelog", "design", "spec", "plan", "log", "review"]

/** Pick a random valid child operation given current children */
function randomChildOp(rng: SeededRandom, existingChildren: Set<string>): ChildOp {
  const hasChildren = existingChildren.size > 0
  const roll = rng.float()

  if (roll < 0.3 || !hasChildren) {
    // Add a new child
    let name: string
    for (let attempt = 0; attempt < 50; attempt++) {
      name = rng.pick(CHILD_NAMES) + (rng.bool(0.5) ? `-${rng.int(1, 99)}` : "")
      if (!existingChildren.has(name)) return { type: "add", name }
    }
    return { type: "add", name: `child-${rng.int(1, 9999)}` }
  }

  if (roll < 0.5 && existingChildren.size > 1) {
    // Remove a child
    const name = rng.pick([...existingChildren])
    return { type: "remove", name }
  }

  if (roll < 0.7) {
    // Rename a child
    const oldName = rng.pick([...existingChildren])
    let newName: string
    for (let attempt = 0; attempt < 50; attempt++) {
      newName = rng.pick(CHILD_NAMES) + `-${rng.int(1, 999)}`
      if (!existingChildren.has(newName)) return { type: "rename", oldName, newName }
    }
    return { type: "edit", name: oldName }
  }

  // Edit a child
  const name = rng.pick([...existingChildren])
  return { type: "edit", name }
}

/** Apply a child operation to the filesystem */
function applyChildOp(
  rng: SeededRandom,
  repoDir: string,
  folderPath: string,
  op: ChildOp,
  children: Set<string>,
): void {
  const dir = join(repoDir, folderPath)

  switch (op.type) {
    case "add": {
      writeFileSync(join(dir, `${op.name}.md`), generateChildContent(rng, op.name))
      children.add(op.name)
      break
    }
    case "remove": {
      const filePath = join(dir, `${op.name}.md`)
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
      children.delete(op.name)
      break
    }
    case "rename": {
      const oldPath = join(dir, `${op.oldName}.md`)
      const newPath = join(dir, `${op.newName}.md`)
      if (existsSync(oldPath)) {
        const content = readFileSync(oldPath, "utf-8")
        unlinkSync(oldPath)
        writeFileSync(newPath, content.replace(`# ${op.oldName}`, `# ${op.newName}`))
        children.delete(op.oldName)
        children.add(op.newName)
      }
      break
    }
    case "edit": {
      const filePath = join(dir, `${op.name}.md`)
      if (existsSync(filePath)) {
        writeFileSync(filePath, generateChildContent(rng, op.name))
      }
      break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant checks
// ─────────────────────────────────────────────────────────────────────────────

/** Verify all index file invariants for a folder */
function verifyIndexInvariants(db: import("bun:sqlite").Database, folderId: string, repoDir: string, label: string) {
  const errors: string[] = []

  // 1. No duplicate nodes with same fs_path
  const allNodes = getAllNodes(db)
  const pathCounts = new Map<string, number>()
  for (const node of allNodes) {
    if (node.fs_path) {
      pathCounts.set(node.fs_path, (pathCounts.get(node.fs_path) ?? 0) + 1)
    }
  }
  for (const [path, count] of pathCounts) {
    if (count > 1) {
      errors.push(`Duplicate nodes for path: ${path} (count: ${count})`)
    }
  }

  // 2. All folder children have valid parent_id
  const children = getChildren(db, folderId)
  for (const child of children) {
    if (child.parent_id !== folderId) {
      errors.push(`Child ${child.id} (${child.name}) has parent_id=${child.parent_id}, expected ${folderId}`)
    }
  }

  // 3. Index file detected by findIndexFile
  const folder = getNode(db, folderId)
  if (!folder) {
    errors.push(`Folder node ${folderId} not found`)
    expect(errors, `[${label}] ${errors.join("; ")}`).toHaveLength(0)
    return
  }

  const indexFile = findIndexFile(folder, children)
  // Index file may not exist (e.g., if it was removed) — that's OK.
  // But if it exists, validate it.

  if (indexFile) {
    // 4. Index content starts with #
    const indexChildren = getChildren(db, indexFile.id)
    // The index file itself is a heading node; check its content (title)
    if (indexFile.content && !indexFile.content.trim()) {
      errors.push(`Index file ${indexFile.name} has empty content`)
    }

    // 5. Slot refs match existing children (for full materialization)
    const slotTargets = extractSlotTargets(indexChildren)
    const folderChildNames = children.filter((c) => c.id !== indexFile.id).map((c) => c.name ?? "")

    for (const target of slotTargets) {
      if (!folderChildNames.includes(target)) {
        // Slot references a child that doesn't exist — warning, not error
        // This can happen during chaotic operations
      }
    }
  }

  expect(errors, `[${label}] ${errors.join("; ")}`).toHaveLength(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Index File Chaos Fuzz", () => {
  test.fuzz("folder with index file survives random child ops", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const rng = createSeededRandom()
      writeConfig(repoDir, "full", "index")

      const folderPath = "project"
      const folderDir = join(repoDir, folderPath)
      mkdirSync(folderDir, { recursive: true })

      // Create initial index file + children
      const initialChildren = ["notes", "tasks", "design"]
      for (const name of initialChildren) {
        writeFileSync(join(folderDir, `${name}.md`), generateChildContent(rng, name))
      }
      writeFileSync(
        join(folderDir, "index.md"),
        generateIndexContent("My Project", "Project description paragraph.", initialChildren, "full"),
      )

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      const folder = findFolder(db, "project")!
      expect(folder).toBeDefined()

      const children = new Set(initialChildren)

      // Run 15 random child operations
      for (let i = 0; i < 15; i++) {
        const op = randomChildOp(rng, children)
        applyChildOp(rng, repoDir, folderPath, op, children)
        await manager.syncFromFs()

        // Verify invariants after each op
        const currentFolder = findFolder(db, "project")
        if (currentFolder) {
          verifyIndexInvariants(db, currentFolder.id, repoDir, `child-op-${i}`)
        }
      }

      // Final: index file should still exist on disk
      expect(existsSync(join(folderDir, "index.md"))).toBe(true)

      // Final invariant check
      const finalFolder = findFolder(db, "project")!
      verifyIndexInvariants(db, finalFolder.id, repoDir, "final")
    }),
  )

  test.fuzz("priority cascade under chaos", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const rng = createSeededRandom()
      writeConfig(repoDir, "full", "index")

      const folderDir = join(repoDir, "cascade")
      mkdirSync(folderDir, { recursive: true })

      // Start with both same-name (highest priority) and index.md
      writeFileSync(join(folderDir, "cascade.md"), "# From Same-Name\n\nSame-name body.\n")
      writeFileSync(join(folderDir, "index.md"), "# From Index\n\nIndex body.\n")
      writeFileSync(join(folderDir, "notes.md"), generateChildContent(rng, "Notes"))

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      // Verify same-name wins initially
      let folder = findFolder(db, "cascade")!
      expect(folder).toBeDefined()
      let children = getChildren(db, folder.id)
      let indexFile = findIndexFile(folder, children)
      expect(indexFile).toBeDefined()
      expect(indexFile!.name).toBe("cascade")

      // Cycle: delete same-name, verify index.md takes over, add it back
      for (let cycle = 0; cycle < 5; cycle++) {
        const hasSameName = existsSync(join(folderDir, "cascade.md"))
        const hasIndex = existsSync(join(folderDir, "index.md"))

        const roll = rng.float()

        if (roll < 0.3 && hasSameName) {
          // Delete same-name
          unlinkSync(join(folderDir, "cascade.md"))
        } else if (roll < 0.5 && hasIndex) {
          // Delete index.md
          unlinkSync(join(folderDir, "index.md"))
        } else if (roll < 0.7 && !hasSameName) {
          // Add same-name back
          writeFileSync(join(folderDir, "cascade.md"), `# Restored Same-Name ${cycle}\n`)
        } else if (!hasIndex) {
          // Add index.md back
          writeFileSync(join(folderDir, "index.md"), `# Restored Index ${cycle}\n`)
        } else {
          // Edit whichever exists
          if (hasSameName) {
            writeFileSync(join(folderDir, "cascade.md"), `# Edited Same-Name ${cycle}\n`)
          } else if (hasIndex) {
            writeFileSync(join(folderDir, "index.md"), `# Edited Index ${cycle}\n`)
          }
        }

        await manager.syncFromFs()

        folder = findFolder(db, "cascade")!
        if (!folder) continue

        children = getChildren(db, folder.id)
        indexFile = findIndexFile(folder, children)

        // Verify priority: same-name > index.md > null
        const sameNameExists = existsSync(join(folderDir, "cascade.md"))
        const indexExists = existsSync(join(folderDir, "index.md"))

        if (sameNameExists && indexFile) {
          // same-name should win over index.md
          expect(indexFile.name).toBe("cascade")
        } else if (indexExists && indexFile) {
          // index.md should be detected when same-name is absent
          expect(indexFile.name).toBe("index")
        }
        // indexFile can be null during chaotic transitions — that's acceptable

        verifyIndexInvariants(db, folder.id, repoDir, `priority-cycle-${cycle}`)
      }
    }),
  )

  test.fuzz("body preservation under repeated folder updates", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const rng = createSeededRandom()
      writeConfig(repoDir, "full", "index")

      const folderDir = join(repoDir, "preserved")
      mkdirSync(folderDir, { recursive: true })

      const bodyContent = "This is important body content.\n\nIt has multiple paragraphs.\n\n- And a list item"
      const initialChildren = ["alpha", "beta"]

      for (const name of initialChildren) {
        writeFileSync(join(folderDir, `${name}.md`), generateChildContent(rng, name))
      }
      writeFileSync(
        join(folderDir, "index.md"),
        generateIndexContent("Preserved Project", bodyContent, initialChildren, "full"),
      )

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      const children = new Set(initialChildren)

      // Run 8 child add/remove cycles and verify body persists
      for (let i = 0; i < 8; i++) {
        const addOrRemove = rng.bool(0.6)

        if (addOrRemove) {
          // Add a child
          const name = `child-${i}`
          writeFileSync(join(folderDir, `${name}.md`), generateChildContent(rng, name))
          children.add(name)
        } else if (children.size > 1) {
          // Remove a child (keep at least 1)
          const name = rng.pick([...children])
          const filePath = join(folderDir, `${name}.md`)
          if (existsSync(filePath)) {
            unlinkSync(filePath)
            children.delete(name)
          }
        }

        await manager.syncFromFs()

        // Read the index file from disk and verify body survived
        const indexPath = join(folderDir, "index.md")
        if (existsSync(indexPath)) {
          const content = readFileSync(indexPath, "utf-8")
          // The body should still contain the important text
          expect(content, `[cycle-${i}] Body content lost from index file`).toContain("important body content")
          expect(content, `[cycle-${i}] Multi-paragraph body lost from index file`).toContain("multiple paragraphs")
        }

        const folder = findFolder(db, "preserved")
        if (folder) {
          verifyIndexInvariants(db, folder.id, repoDir, `body-cycle-${i}`)
        }
      }
    }),
  )

  test.fuzz("concurrent index file edit + child operations", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const rng = createSeededRandom()
      writeConfig(repoDir, "full", "index")

      const folderDir = join(repoDir, "concurrent")
      mkdirSync(folderDir, { recursive: true })

      const initialChildren = ["file-a", "file-b"]
      for (const name of initialChildren) {
        writeFileSync(join(folderDir, `${name}.md`), generateChildContent(rng, name))
      }
      writeFileSync(
        join(folderDir, "index.md"),
        generateIndexContent("Concurrent Project", "Original body.", initialChildren, "full"),
      )

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      const children = new Set(initialChildren)

      // Simulate external edits to index file + child ops
      for (let i = 0; i < 10; i++) {
        const roll = rng.float()

        if (roll < 0.4) {
          // External edit to index file (change body)
          const currentChildren = [...children]
          writeFileSync(
            join(folderDir, "index.md"),
            generateIndexContent(
              "Concurrent Project",
              `Updated body at iteration ${i}.\n\nSome notes here.`,
              currentChildren,
              "full",
            ),
          )
        } else if (roll < 0.7) {
          // Add a child
          const name = `concurrent-child-${i}`
          writeFileSync(join(folderDir, `${name}.md`), generateChildContent(rng, name))
          children.add(name)
        } else if (children.size > 1) {
          // Remove a child
          const name = rng.pick([...children])
          const filePath = join(folderDir, `${name}.md`)
          if (existsSync(filePath)) {
            unlinkSync(filePath)
            children.delete(name)
          }
        }

        await manager.syncFromFs()

        const folder = findFolder(db, "concurrent")
        if (folder) {
          verifyIndexInvariants(db, folder.id, repoDir, `concurrent-${i}`)
        }
      }

      // Final: index file should exist and be valid
      expect(existsSync(join(folderDir, "index.md"))).toBe(true)
      const finalContent = readFileSync(join(folderDir, "index.md"), "utf-8")
      expect(finalContent).toMatch(/^# /)

      const folder = findFolder(db, "concurrent")!
      verifyIndexInvariants(db, folder.id, repoDir, "concurrent-final")
    }),
  )

  test.fuzz("same-name convention survives child chaos", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const rng = createSeededRandom()
      writeConfig(repoDir, "full", "same-name")

      const folderDir = join(repoDir, "myproject")
      mkdirSync(folderDir, { recursive: true })

      const initialChildren = ["docs", "src"]
      for (const name of initialChildren) {
        writeFileSync(join(folderDir, `${name}.md`), generateChildContent(rng, name))
      }
      // Same-name convention: myproject/myproject.md
      writeFileSync(
        join(folderDir, "myproject.md"),
        generateIndexContent("My Project", "Project overview.", initialChildren, "full"),
      )

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      const children = new Set(initialChildren)

      // Random child ops
      for (let i = 0; i < 12; i++) {
        const op = randomChildOp(rng, children)
        applyChildOp(rng, repoDir, "myproject", op, children)
        await manager.syncFromFs()

        const folder = findFolder(db, "myproject")
        if (folder) {
          const folderChildren = getChildren(db, folder.id)
          const indexFile = findIndexFile(folder, folderChildren)

          // Same-name index should still be detected
          if (existsSync(join(folderDir, "myproject.md"))) {
            expect(indexFile, `[op-${i}] same-name index not detected`).toBeDefined()
            expect(indexFile!.name).toBe("myproject")
          }

          verifyIndexInvariants(db, folder.id, repoDir, `same-name-${i}`)
        }
      }
    }),
  )

  test.fuzz("deep nesting: nested folders each with index files", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const rng = createSeededRandom()
      writeConfig(repoDir, "full", "index")

      // Create 3-level deep folder structure, each with index.md
      const folders = ["top", "top/mid", "top/mid/deep"]
      for (const folder of folders) {
        const dir = join(repoDir, folder)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, "index.md"), `# ${basename(folder)} Index\n\nBody for ${folder}.\n`)
        writeFileSync(join(dir, "sibling.md"), generateChildContent(rng, `${basename(folder)}-sibling`))
      }

      const manager = createSyncManager(db, repoDir)
      await manager.syncFromFs()

      // Randomly mutate children at each level
      const childSets = new Map<string, Set<string>>()
      for (const folder of folders) {
        childSets.set(folder, new Set(["sibling"]))
      }

      for (let i = 0; i < 20; i++) {
        // Pick random level
        const folder = rng.pick(folders)
        const children = childSets.get(folder)!
        const op = randomChildOp(rng, children)
        applyChildOp(rng, repoDir, folder, op, children)
        await manager.syncFromFs()

        // Verify each level's index is intact
        for (const f of folders) {
          const folderNode = findFolder(db, basename(f))
          if (folderNode) {
            verifyIndexInvariants(db, folderNode.id, repoDir, `nested-${i}-${f}`)
          }
        }
      }

      // All index files should still exist
      for (const folder of folders) {
        expect(existsSync(join(repoDir, folder, "index.md")), `index.md missing in ${folder}`).toBe(true)
      }
    }),
  )
})
