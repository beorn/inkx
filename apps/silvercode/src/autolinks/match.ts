/**
 * Autolink pattern matcher.
 *
 * `detectAutolinks(text, rules)` scans `text` against the user's autolink
 * rules and emits a `Detection`-shaped record for every non-overlapping
 * match. Results merge with the built-in detections (URL, file path, bead
 * ID) downstream — see `mergeDetections` in this file.
 *
 * The merged list is what flows through `<DetectionText/>` unchanged.
 *
 * After the URI pivot, this module ALSO emits *virtual* autolink detections
 * for URL-shaped tokens in the input text that aren't covered by a
 * configured rule. Those virtual detections carry `preview: "https"` (or
 * the URL's scheme) and `resolves_to: <url>` so the handler registry can
 * render them through the same dispatch pipeline as configured rules. See
 * `PLAIN_URL_RE` and `virtualUrlDetections` below.
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
/**
 * Plain URL matcher used for "virtual" autolink detections — any
 * `https?://...` token in displayed text becomes an autolink so the
 * handler registry resolves it the same way as a configured rule.
 *
 * Mirrors the shape of the URL_RE in `detection.ts` (which handles the
 * built-in `kind: "url"` detection) but lives here so virtual rules can
 * coexist with built-ins. A built-in URL detection still wins via
 * `mergeDetections` precedence — virtual autolink detections only land in
 * the merged list when no built-in covers the same span (which is by
 * design: built-ins draw plain URL popovers; plain URLs as autolinks would
 * be the path forward only after we rip out the built-in renderer).
 */
const PLAIN_URL_RE = /\bhttps?:\/\/[^\s)\]]+/g

export function detectAutolinks(text: string, rules: readonly AutolinkRule[]): Detection[] {
  if (text.length === 0) return []

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
      // shell rules carry their structured `command` through to the popover
      // layer (JSON-encoded; `payload` is `Record<string, string>` for cache
      // simplicity). The resolver decodes back into `{exec, args}`.
      if (rule.preview === "shell" && rule.command !== undefined) {
        payload["command"] = JSON.stringify(rule.command)
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

  // Append virtual detections for plain URLs not already covered by a
  // configured rule. The virtual rule_idx is `Number.MAX_SAFE_INTEGER` so
  // configured rules always win in the priority sort below.
  for (const v of virtualUrlDetections(text)) {
    candidates.push(v)
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
 * Emit virtual autolink detections for plain URLs in the text. Each
 * detection carries `preview: "https"` (a synthetic preview kind that
 * `resolveURI` routes to the `https:` handler) and the URL itself as
 * `resolves_to`. The cache key is `<plain-url>::<url>` so different URLs
 * stay isolated.
 *
 * `rule_idx` is set high so configured rules sort earlier in the priority
 * pass — a user's regex pattern that overlaps a URL still wins.
 */
function virtualUrlDetections(text: string): Detection[] {
  const out: Detection[] = []
  for (const m of text.matchAll(PLAIN_URL_RE)) {
    const start = m.index ?? 0
    const url = m[0]
    if (typeof url !== "string" || url.length === 0) continue
    out.push({
      kind: "autolink",
      match: url,
      start,
      end: start + url.length,
      payload: {
        source: "<virtual:plain-url>",
        resolves_to: url,
        // The handler registry dispatches on URI scheme; `https` is a
        // synthetic preview kind here, NOT one of the user-facing
        // `AutolinkPreviewKind` values. resolvePreview routes
        // explicit-scheme resolves_to through whatever scheme it carries,
        // so the handler choice (httpsHandler) is unaffected by this
        // value; we keep it for diagnostic clarity in tests.
        preview: "https",
        cache_key: `<plain-url>::${url}`,
        rule_idx: String(Number.MAX_SAFE_INTEGER),
        virtual: "1",
      },
    })
  }
  return out
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
