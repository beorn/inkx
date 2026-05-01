import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Central filesystem paths for km apps and packages.
 *
 * Helpers read environment variables at call time so tests can redirect
 * HOME/XDG safely. Add new persistent path conventions here instead of
 * scattering `join(homedir(), "...")` across apps.
 */

export function userHome(): string {
  return process.env.HOME ?? homedir()
}

export function expandHomePath(path: string): string {
  if (!path.startsWith("~")) return path
  const home = userHome()
  if (path === "~") return home
  if (path.startsWith("~/")) return join(home, path.slice(2))
  return path
}

export function silvercodeCacheDir(): string {
  return join(userHome(), ".cache", "silvercode")
}

export function silvercodeActiveAccountCachePath(profileDir: string): string {
  const slug = profileDir.replace(/[^a-zA-Z0-9@._-]/g, "_")
  return join(silvercodeCacheDir(), `quota-${slug}.json`)
}

export function silvercodeAllAccountsCachePath(): string {
  return join(silvercodeCacheDir(), "accounts-all.json")
}

export function claudeProfilesRoot(): string {
  return join(userHome(), ".config", "claude-profiles")
}

export function claudeProfileDir(name: string): string {
  return join(claudeProfilesRoot(), name)
}

export function claudeProjectsRoot(): string {
  return join(userHome(), ".claude", "projects")
}

export function codexSessionsRoot(): string {
  return join(userHome(), ".codex", "sessions")
}

export function kmUserDir(): string {
  return join(userHome(), ".km")
}

export function defaultTribeBusPath(): string {
  return join(kmUserDir(), "tribe-bus.jsonl")
}
