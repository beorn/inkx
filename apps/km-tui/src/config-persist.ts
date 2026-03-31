/**
 * Config Persistence — <vault>/.km/config.json
 *
 * Unified locations map: system keys (h,i,j,a,p,g,G), digit favorites (0-9),
 * and custom letter favorites. Values are templates with tokens expanded at
 * navigation time:
 *
 *   - Date tokens: {YYYY}, {MM}, {DD}, {YYYY-MM-DD}
 *   - Positional tokens: {parent}, {first}, {last}
 *   - Literal node references: @next, @inbox, node IDs
 *
 * Loaded on startup, written on favorite set/clear.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

// =============================================================================
// Types
// =============================================================================

export interface KmConfig {
  locations: Record<string, string>
}

// =============================================================================
// Default Config
// =============================================================================

export const DEFAULT_LOCATIONS: Record<string, string> = {
  h: "@next",
  i: "@inbox",
  j: "journals/{YYYY}/{YYYY-MM-DD}.md",
  a: "@archive",
  p: "{parent}",
  g: "{first}",
  G: "{last}",
}

function defaultConfig(): KmConfig {
  return { locations: { ...DEFAULT_LOCATIONS } }
}

// =============================================================================
// Read / Write
// =============================================================================

function configPath(vaultPath: string): string {
  return join(vaultPath, ".km", "config.json")
}

export function loadConfig(vaultPath: string): KmConfig {
  const path = configPath(vaultPath)
  if (!existsSync(path)) return defaultConfig()

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
    const locations =
      typeof raw.locations === "object" && raw.locations !== null ? (raw.locations as Record<string, unknown>) : {}
    // Merge with defaults — user config overrides, defaults fill gaps
    const merged = { ...DEFAULT_LOCATIONS }
    for (const [key, value] of Object.entries(locations)) {
      if (typeof value === "string") {
        merged[key] = value
      }
    }
    return { locations: merged }
  } catch {
    return defaultConfig()
  }
}

export function saveConfig(vaultPath: string, config: KmConfig): void {
  const path = configPath(vaultPath)
  const dir = join(vaultPath, ".km")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Only persist entries that differ from defaults
  const toSave: Record<string, string> = {}
  for (const [key, value] of Object.entries(config.locations)) {
    if (DEFAULT_LOCATIONS[key] !== value) {
      toSave[key] = value
    }
  }
  // Only write if there's something user-specific to persist
  if (Object.keys(toSave).length > 0) {
    writeFileSync(path, JSON.stringify({ locations: toSave }, null, 2) + "\n", "utf-8")
  } else if (existsSync(path)) {
    // All defaults — remove the file to keep things clean
    writeFileSync(path, JSON.stringify({ locations: {} }, null, 2) + "\n", "utf-8")
  }
}

// =============================================================================
// Template Expansion
// =============================================================================

const DATE_TOKEN_RE = /\{(YYYY|MM|DD|YYYY-MM-DD)\}/g
const POSITIONAL_RE = /^\{(parent|first|last)\}$/

export type ExpandedLocation =
  | { type: "positional"; key: string } // parent, first, last
  | { type: "resolved"; value: string } // node ref or expanded date path

/**
 * Expand a location template value.
 *
 * - "{parent}" → { type: "positional", key: "parent" }
 * - "journals/{YYYY}/{YYYY-MM-DD}.md" → { type: "resolved", value: "journals/2026/2026-03-30.md" }
 * - "@inbox" → { type: "resolved", value: "@inbox" }
 */
export function expandLocationTemplate(template: string, now?: Date): ExpandedLocation {
  // Check positional tokens first
  const positionalMatch = POSITIONAL_RE.exec(template)
  if (positionalMatch) {
    return { type: "positional", key: positionalMatch[1]! }
  }

  // Expand date tokens
  if (DATE_TOKEN_RE.test(template)) {
    const d = now ?? new Date()
    const yyyy = String(d.getFullYear())
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    // Reset lastIndex since we used .test()
    DATE_TOKEN_RE.lastIndex = 0
    const expanded = template.replace(DATE_TOKEN_RE, (_match, token: string) => {
      switch (token) {
        case "YYYY":
          return yyyy
        case "MM":
          return mm
        case "DD":
          return dd
        case "YYYY-MM-DD":
          return `${yyyy}-${mm}-${dd}`
        default:
          return _match
      }
    })
    return { type: "resolved", value: expanded }
  }

  // Literal — pass through
  return { type: "resolved", value: template }
}

/**
 * Check if a template value contains date tokens (needs daily re-expansion).
 */
export function isDateTemplate(template: string): boolean {
  DATE_TOKEN_RE.lastIndex = 0
  return DATE_TOKEN_RE.test(template)
}

/**
 * Check if a template value is a positional reference.
 */
export function isPositionalTemplate(template: string): boolean {
  return POSITIONAL_RE.test(template)
}
