import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Listener } from "./types.ts"

export interface LoadOptions {
  userDir?: string
  projectDir?: string
  projectPath?: string
}

function isListenerShape(value: unknown): value is Listener {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.name === "string" && typeof v.handle === "function"
}

async function loadDir(dir: string): Promise<Listener[]> {
  if (!existsSync(dir)) return []
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const listeners: Listener[] = []
  for (const entry of entries) {
    if (entry.startsWith(".")) continue
    if (!entry.endsWith(".ts") && !entry.endsWith(".mts") && !entry.endsWith(".js") && !entry.endsWith(".mjs")) {
      continue
    }
    const filePath = join(dir, entry)
    try {
      const mod = await import(pathToFileURL(filePath).href)
      const candidate = mod.default ?? mod.listener
      if (isListenerShape(candidate)) {
        listeners.push(candidate)
      } else if (process.env.KM_HOOKS_DEBUG) {
        process.stderr.write(`[km hooks] ${filePath}: no default export with { name, handle }\n`)
      }
    } catch (err) {
      process.stderr.write(
        `[km hooks] failed to load ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }
  return listeners
}

export async function loadListeners(opts: LoadOptions = {}): Promise<Listener[]> {
  const userDir = opts.userDir ?? join(homedir(), ".km", "hooks.d")
  const projectDir = opts.projectDir ?? (opts.projectPath ? join(opts.projectPath, ".km", "hooks.d") : undefined)
  const [userListeners, projectListeners] = await Promise.all([
    loadDir(userDir),
    projectDir ? loadDir(projectDir) : Promise.resolve([]),
  ])
  return [...userListeners, ...projectListeners]
}
