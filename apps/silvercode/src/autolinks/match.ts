/**
 * Autolink pattern matcher.
 *
 * `detectAutolinks(text, rules)` scans `text` against the user's autolink
 * rules and emits a `Detection`-shaped record for every non-overlapping
 * match. Results merge with the built-in detections (URL, file path, bead
 * ID) downstream — see `mergeDetections` in this file.
 *
 * The merged list is what flows through `<DetectionText/>` unchanged.
 */

import type { Detection } from "../detection.ts"
import type { AutolinkRule } from "./config.ts"

/**
 * Run every rule's regex against `text` and return non-overlapping
 * autolink detections (sorted by start offset).
 *
 * Within autolinks themselves, rule order = priority: an earlier rule's
 * match wins over a later rule covering the same range. This keeps user
 * intent predictable — the first declared `[[autolinks]]` block in TOML
 * is the canonical source for any overlapping span.
 */
export function detectAutolinks(text: string, rules: readonly AutolinkRule[]): Detection[] {
  if (text.length === 0 || rules.length === 0) return []

  const candidates: Detection[] = []
  for (let ruleIdx = 0; ruleIdx < rules.length; ruleIdx++) {
    const rule = rules[ruleIdx]
    if (!rule) continue
    // Reset lastIndex defensively — global RegExps are stateful and
    // matchAll on a string with the same RegExp returns a fresh
    // iterator, but a shared `g` regex used across calls otherwise
    // accumulates state. matchAll already resets internally; we keep
    // the assignment as documentation of intent.
    rule.regex.lastIndex = 0
    for (const m of text.matchAll(rule.regex)) {
      const start = m.index ?? 0
      const matchText = m[0]
      if (typeof matchText !== "string" || matchText.length === 0) continue
      const payload: Record<string, string> = {
        source: rule.source,
        resolves_to: rule.resolvesTo,
        preview: rule.preview,
        // Stable cache key: per-rule + matched text. The matched text
        // matters because regex rules can resolve to different concrete
        // targets per match (e.g. /\+(\w+)/ → +km, +pam).
        cache_key: `${rule.source}::${matchText}`,
        rule_idx: String(ruleIdx),
      }
      // shell rules carry their `command` through to the popover layer so
      // the resolver can spawn it without re-walking the rule list.
      if (rule.preview === "shell" && typeof rule.command === "string") {
        payload["command"] = rule.command
      }
      candidates.push({
        kind: "autolink",
        match: matchText,
        start,
        end: start + matchText.length,
        payload,
      })
    }
  }

  // Resolve overlaps: rule order = priority, earlier wins. Sort by start
  // ascending, ties broken by rule index ascending, then by length
  // descending (longer match wins for identical priority).
  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    const ai = Number(a.payload.rule_idx ?? 0)
    const bi = Number(b.payload.rule_idx ?? 0)
    if (ai !== bi) return ai - bi
    return b.end - a.end - (b.start - a.start)
  })

  const kept: Detection[] = []
  let cursor = -1
  for (const d of candidates) {
    if (d.start < cursor) continue
    kept.push(d)
    cursor = d.end
  }
  return kept
}

/**
 * Merge built-in detections with autolink detections. Built-ins take
 * priority over autolinks when ranges overlap — URLs and file paths are
 * unambiguous and shouldn't be shadowed by a user pattern that happens
 * to match "/path/to/something".
 *
 * Returns a new sorted, non-overlapping array.
 */
export function mergeDetections(builtins: readonly Detection[], autolinks: readonly Detection[]): Detection[] {
  if (builtins.length === 0) return [...autolinks]
  if (autolinks.length === 0) return [...builtins]

  // Build an interval set from builtins; drop any autolink that overlaps.
  const out: Detection[] = [...builtins]
  for (const a of autolinks) {
    const overlaps = builtins.some((b) => a.start < b.end && a.end > b.start)
    if (!overlaps) out.push(a)
  }
  out.sort((x, y) => x.start - y.start)
  return out
}
