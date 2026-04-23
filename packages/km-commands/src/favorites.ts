/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Favorites Registry
 *
 * Mutable map of key -> location template for quick navigation.
 * Accessible to both keybinding generation and TUI action handlers.
 *
 * Any single printable key can be a favorite, except reserved keys
 * used by system locations and picker locations.
 *
 * The favorites map is populated from <vault>/.km/config.json on startup
 * via loadConfig() from config.ts. This module provides the in-memory
 * store; persistence is handled at the app layer.
 */

import { DEFAULT_LOCATIONS } from "./config.ts"

/** User-assigned favorites: key -> location template. Starts empty; populated from config on startup. */
const favorites = new Map<string, string>()

/**
 * Default system locations -- re-exported from config.ts for backwards compatibility.
 * Prefer importing DEFAULT_LOCATIONS from config.ts directly.
 * @deprecated Use DEFAULT_LOCATIONS from config.ts (re-exported from index.ts)
 */
export const DEFAULT_SYSTEM_LOCATIONS: Record<string, string> = DEFAULT_LOCATIONS

/** Human-readable labels for system location keys */
const SYSTEM_KEY_LABELS: Record<string, string> = {
  h: "home",
  i: "inbox",
  j: "journal",
  a: "archive",
  p: "parent",
  g: "first",
  G: "last",
}

/**
 * Keys reserved by system locations (h,i,j,a,p,g,G) and picker locations (#,@,+,[).
 * These cannot be assigned as user favorites.
 */
const RESERVED_KEY_LABELS: Record<string, string> = {
  ...SYSTEM_KEY_LABELS,
  "#": "tag",
  "@": "assignee",
  "+": "project",
  "[": "item",
}

export const RESERVED_KEYS: ReadonlySet<string> = new Set(Object.keys(RESERVED_KEY_LABELS))

/** The set of system location keys (h,i,j,a,p,g,G) — not assignable as favorites. */
export const SYSTEM_LOCATION_KEYS: ReadonlySet<string> = new Set(Object.keys(SYSTEM_KEY_LABELS))

/** Digit keys 0-9 — always shown in the favorites dialog */
export const DIGIT_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const

// =============================================================================
// Favorites API (user-assigned locations: digits 0-9, custom letters)
// =============================================================================

/** Get the location template for a favorite key */
export function getFavorite(key: string): string | undefined {
  return favorites.get(key)
}

/** Assign a location to a favorite key */
export function setFavorite(key: string, value: string): void {
  favorites.set(key, value)
  onChangeCallback?.()
}

/** Clear a favorite key assignment */
export function clearFavorite(key: string): void {
  favorites.delete(key)
  onChangeCallback?.()
}

/** Get all favorites as a read-only map */
export function getAllFavorites(): ReadonlyMap<string, string> {
  return favorites
}

// =============================================================================
// System Locations API (h,i,j,a,p,g,G — from config or defaults)
// =============================================================================

/** System location overrides from config. Falls back to DEFAULT_LOCATIONS. */
const systemOverrides = new Map<string, string>()

/** Get the location template for a system key (h,i,j,a,p,g,G). */
export function getSystemLocation(key: string): string | undefined {
  return systemOverrides.get(key) ?? DEFAULT_LOCATIONS[key]
}

// =============================================================================
// Bulk initialization (called by km-tui on startup from config)
// =============================================================================

/**
 * Initialize all locations from a unified config map.
 * System keys (h,i,j,a,p,g,G) go into system overrides.
 * Other keys go into the favorites map.
 */
export function initLocations(locations: Record<string, string>): void {
  systemOverrides.clear()
  favorites.clear()
  for (const [key, value] of Object.entries(locations)) {
    if (SYSTEM_LOCATION_KEYS.has(key)) {
      // Only store if different from default
      if (DEFAULT_LOCATIONS[key] !== value) {
        systemOverrides.set(key, value)
      }
    } else {
      favorites.set(key, value)
    }
  }
}

/** Callback invoked when favorites change (for persistence). Set by app layer. */
let onChangeCallback: (() => void) | null = null

/** Register a callback for when favorites change. Returns unsubscribe function. */
export function onFavoritesChange(cb: () => void): () => void {
  onChangeCallback = cb
  return () => {
    onChangeCallback = null
  }
}

/** Get the human-readable label for a reserved key, or undefined if not reserved */
export function getReservedKeyLabel(key: string): string | undefined {
  return RESERVED_KEY_LABELS[key]
}

/** Get all locations (system + favorites) as a flat record for persistence. */
export function getAllLocations(): Record<string, string> {
  const result: Record<string, string> = {}
  // System locations (defaults + overrides)
  for (const key of SYSTEM_LOCATION_KEYS) {
    result[key] = systemOverrides.get(key) ?? DEFAULT_LOCATIONS[key]!
  }
  // User favorites
  for (const [key, value] of favorites) {
    result[key] = value
  }
  return result
}
