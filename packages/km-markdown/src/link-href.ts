/**
 * normalizeLinkHref — authored text → canonical KLink.href.
 *
 * Every KLink writer routes through this function. Deterministic: same
 * (form, label) → same href.
 *
 * See docs/design/model/klink.md for the full notation → href table.
 */

import type { MdForm } from "@km/core"

/**
 * Canonicalize authored link text into `href` form. Total.
 *
 * - `bare` labels are classified by the first character:
 *   - starts with `#`  → `km:%23<rest>` (tag)
 *   - starts with `@` or `+` → `km:<label>` (sub-delim, passes through)
 *   - http/https/mailto/etc → pass through unchanged (external URL)
 *   - otherwise           → `km:<label>` (plain bare name reference)
 * - `wiki` labels beginning with `#` become self-ref hrefs (`#<fragment>`);
 *   all others become `km:<label>` with the label as the path.
 * - `mdlink` / `autolink` labels are URL-shaped targets from the markdown
 *   link destination — they pass through unchanged.
 */
export function normalizeLinkHref(form: MdForm, label: string): string {
  if (typeof label !== "string" || label.length === 0) {
    throw new TypeError(`normalizeLinkHref: label must be a non-empty string, got ${JSON.stringify(label)}`)
  }

  switch (form) {
    case "bare":
      return normalizeBare(label)
    case "wiki":
      return normalizeWiki(label)
    case "mdlink":
    case "autolink":
      return label
  }
}

function normalizeBare(label: string): string {
  if (isExternalScheme(label)) return label
  // All bare names normalize to `km:<path>` with reserved chars percent-encoded.
  // `#urgent` → `km:%23urgent`; `@Alice` → `km:@Alice`; `+cleanup` → `km:+cleanup`.
  return `km:${encodePath(label)}`
}

function normalizeWiki(label: string): string {
  if (label.startsWith("#")) {
    // `[[#Section]]` is Obsidian-style self-ref — href has no scheme.
    return `#${encodeFragment(label.slice(1))}`
  }
  // `[[Note]]`, `[[Note#Section]]`, `[[Note^abc]]`, `[[@Alice]]`, etc.
  // Split path vs fragment at the first `#` at position > 0, and convert
  // `^blockid` into `#^blockid` (block ref lives in the fragment).
  const hashAt = firstHashAfter(label, 1)
  if (hashAt === -1) {
    // No explicit section; check for block ref suffix `^abc`
    const caretAt = label.indexOf("^")
    if (caretAt > 0) {
      const path = label.slice(0, caretAt)
      const block = label.slice(caretAt)
      return `km:${encodePath(path)}#${encodeFragment(block)}`
    }
    return `km:${encodePath(label)}`
  }
  const path = label.slice(0, hashAt)
  const fragment = label.slice(hashAt + 1)
  return `km:${encodePath(path)}#${encodeFragment(fragment)}`
}

function firstHashAfter(s: string, minIndex: number): number {
  for (let i = minIndex; i < s.length; i++) {
    if (s[i] === "#") return i
  }
  return -1
}

// Percent-encode `#`, `?`, `%` only — other sub-delims pass through (`@`, `+`)
// as do path-allowed chars, spaces, colons, UTF-8.
function encodePath(s: string): string {
  return s.replace(/[#?%]/g, pctEncode)
}

function encodeFragment(s: string): string {
  return s.replace(/[#?%]/g, pctEncode)
}

function pctEncode(ch: string): string {
  return `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
}

// Minimal scheme sniff — anything matching `scheme:<something>` where
// scheme is a recognized external URL scheme is treated as already-encoded.
const EXTERNAL_SCHEME_RE = /^(https?|mailto|ftp|sftp|ftps|file|data|tel|ssh):/i

function isExternalScheme(s: string): boolean {
  return EXTERNAL_SCHEME_RE.test(s)
}
