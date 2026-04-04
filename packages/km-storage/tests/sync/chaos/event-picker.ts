/**
 * FS event picker for vimonkey's gen()
 *
 * Generates random but valid filesystem events, maintaining file state
 * so operations are always coherent (e.g., won't change a nonexistent file).
 */

import type { Picker, PickerContext, SeededRandom } from "vimonkey"
import type { FsEvent, FsEventType } from "./types.ts"

interface FileState {
  files: Set<string>
  directories: Set<string>
}

const DIR_NAMES = ["notes", "tasks", "docs", "archive", "projects"] as const
const FILE_NAMES = ["note", "task", "doc", "readme", "index", "inbox"] as const

type TreeOp = "add" | "change" | "unlink" | "rename"
const OPERATIONS: readonly TreeOp[] = ["add", "change", "unlink", "rename"]
const OPERATION_WEIGHTS: Partial<Record<TreeOp, number>> = {
  add: 3,
  change: 5,
  unlink: 1,
  rename: 1,
}

/**
 * Create a picker that generates random FS events while tracking file state.
 * Returns a picker function suitable for vimonkey's gen().
 */
function createFsEventPicker(initialFiles: string[]): Picker<FsEvent> {
  const state: FileState = {
    files: new Set(initialFiles),
    directories: new Set<string>(),
  }

  // Extract directory paths from initial files
  for (const file of initialFiles) {
    const parts = file.split("/")
    for (let i = 1; i < parts.length; i++) {
      state.directories.add(parts.slice(0, i).join("/"))
    }
  }

  return (ctx: PickerContext): FsEvent | FsEvent[] => {
    const { random } = ctx
    const op = chooseOperation(random, state)

    switch (op) {
      case "add": {
        const path = generateFilePath(random, state.files)
        state.files.add(path)
        addParentDirs(path, state.directories)
        return { type: "add", path }
      }
      case "change": {
        const path = random.pick([...state.files])
        return { type: "change", path }
      }
      case "unlink": {
        const path = random.pick([...state.files])
        state.files.delete(path)
        return { type: "unlink", path }
      }
      case "rename": {
        const oldPath = random.pick([...state.files])
        const newPath = generateFilePath(random, state.files)
        state.files.delete(oldPath)
        state.files.add(newPath)
        addParentDirs(newPath, state.directories)
        return [
          { type: "unlink", path: oldPath },
          { type: "add", path: newPath },
        ]
      }
    }
  }
}

/**
 * Choose a valid operation given current file state.
 * Falls back to 'add' when no files exist, avoids 'unlink' with only 1 file.
 */
function chooseOperation(random: SeededRandom, state: FileState): TreeOp {
  if (state.files.size === 0) return "add"

  if (state.files.size === 1) {
    // Don't unlink the last file; allow add, change, rename (rename preserves count)
    return random.weightedPick(["add", "change", "rename"] as const, {
      add: 3,
      change: 5,
      rename: 1,
    })
  }

  return random.weightedPick(OPERATIONS, OPERATION_WEIGHTS)
}

/** Add parent directory segments to the directory set */
function addParentDirs(path: string, directories: Set<string>): void {
  const parts = path.split("/")
  for (let i = 1; i < parts.length; i++) {
    directories.add(parts.slice(0, i).join("/"))
  }
}

/**
 * Generate a random .md file path that doesn't collide with existing paths.
 * Produces paths with 0-2 subdirectory segments.
 */
function generateFilePath(random: SeededRandom, existing: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const depth = random.int(0, 2)
    const segments: string[] = []

    for (let d = 0; d < depth; d++) {
      const suffix = random.bool(0.5) ? `-${random.int(1, 99)}` : ""
      segments.push(random.pick(DIR_NAMES) + suffix)
    }

    const fileSuffix = random.bool(0.5) ? `-${random.int(1, 99)}` : ""
    segments.push(random.pick(FILE_NAMES) + fileSuffix + ".md")

    const path = segments.join("/")
    if (!existing.has(path)) return path
  }

  // Fallback with unique suffix
  return `file-${random.int(0, 999999)}.md`
}

/**
 * Generate random markdown content with a title, tasks, and optional text.
 * Useful for creating initial file contents in tests.
 */
export function generateFileContent(random: SeededRandom): string {
  const lines: string[] = []

  // Header
  lines.push(`# Test File ${random.int(1, 999)}`)
  lines.push("")

  // Random tasks
  const numTasks = random.int(0, 10)
  for (let i = 0; i < numTasks; i++) {
    const status = random.pick(["[ ]", "[x]", "[/]", "[-]"])
    const priority = random.bool(0.3) ? `[#${random.pick(["A", "B", "C"])}] ` : ""
    lines.push(`- ${status} ${priority}Task ${i + 1}`)
  }

  // Optional paragraph
  if (random.bool(0.5)) {
    lines.push("")
    lines.push(`Some text content ${random.int(1, 999)}`)
  }

  return lines.join("\n")
}
