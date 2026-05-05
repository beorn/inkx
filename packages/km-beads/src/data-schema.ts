/**
 * Bead Node Data Schema
 *
 * Zod schema for the `node.data` blob *as interpreted by km-beads*.
 *
 * `node.data` is a polymorphic `Record<string, unknown>` shared by every
 * km consumer: parser internals (`_mdSource`, `_mdBullet`, …), file-node
 * props (`id`, `aliases`, `dependencies`, … — usually serialized as YAML
 * frontmatter), and Logseq-style inline properties (`props`, `propsRaw`).
 * km-beads cares only about the bead-relevant subset; this module pins
 * those fields' shapes and lets everything else passthrough verbatim so
 * the markdown round-trip stays lossless.
 *
 * Two entry points:
 *   - `parseBeadData(data)` — read path. Returns `{ data, warnings }`;
 *     never throws. Unknown extras pass through untouched. Wrong-shape
 *     bead fields surface as warnings with the offending key + bead path
 *     so callers can log a helpful diagnostic.
 *   - `assertBeadDataPatch(patch)` — write path. Throws on any bead-shaped
 *     key whose value violates the schema. Use before persisting any
 *     km-beads-authored update, so future writes can't poison the column.
 *
 * Bead: km-beads.data-schema-plateau.
 */

import { z } from "zod"

/**
 * `blocked-by::` and similar `<key>::` properties (Logseq-style inline
 * properties, parsed by km-markdown into `data.props["<key>"]`).
 *
 * Two shapes — single link or list of links:
 *   - `{ type: "link", target: "<short-id>" }`
 *   - `{ type: "list", values: [{ type: "link", target: "<short-id>" }, …] }`
 *
 * Free-form `value` is preserved for non-link properties (e.g. due dates).
 */
export const beadLinkPropSchema = z.object({
  type: z.literal("link"),
  target: z.string(),
})

export const beadListPropSchema = z.object({
  type: z.literal("list"),
  values: z.array(beadLinkPropSchema.partial({ type: true })).optional(),
})

export const beadValuePropSchema = z.object({
  type: z.string(),
  value: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
  target: z.string().optional(),
})

/** A single inline property — link, list-of-links, or free-form `<key>:: <value>`. */
export const beadPropSchema = z.union([beadLinkPropSchema, beadListPropSchema, beadValuePropSchema])

/**
 * `data.props` — the parsed inline-property map. Keys are property names
 * (`blocked-by`, `due`, `priority`, …); values follow `beadPropSchema`.
 */
export const beadPropsSchema = z.record(z.string(), beadPropSchema)

/**
 * `data.propsRaw` — verbatim source text per inline property, keyed the
 * same as `data.props`. Used by nodes2md to reserialize without re-
 * canonicalizing wikilink syntax.
 */
export const beadPropsRawSchema = z.record(z.string(), z.string())

/**
 * `data.dependencies` — `dependencies:` prop on file beads (typically
 * serialized as YAML frontmatter). Mirrors `BeadsDependency` from
 * `schema.ts` but lives on the read path (markdown → `node.data.dependencies`),
 * not the JSONL import path.
 */
export const beadDataDependencySchema = z.object({
  issue_id: z.string(),
  depends_on_id: z.string(),
  type: z.string().optional(),
  dep_type: z.string().optional(),
  created_at: z.string().optional(),
  created_by: z.string().optional(),
  metadata: z.string().optional(),
})

/**
 * Bead-relevant fields on `node.data`. Every key is optional —
 * `node.data` is shared with non-bead nodes, parser internals, and
 * the markdown round-trip. `.passthrough()` preserves unknown extras
 * so authoring a bead update doesn't accidentally drop them.
 *
 * Field provenance (where each appears):
 *
 *   File-bead props (top-level beads at `<root>/<scope>/<slug>.md` —
 *   serialized as YAML frontmatter)
 *     id, aliases, created_at, created_by, owner, assignee, started_at,
 *     closed_at, close_reason, closeReason, dropReason, dependencies,
 *     metadata, defer_until, work_type
 *
 *   Inline-bead properties (sub-checkboxes elevated via `+` sigil)
 *     props, propsRaw — Logseq-style `<key>:: <value>` blocks
 *
 *   Sigil-mirror refs (synced by mutations.ts on every update)
 *     short_id, mentions
 *     — `tags` was dissolved into the `links` table, see
 *     @km/all/dissolve-data-tags-to-links.
 *
 *   Parser internals (km-markdown, NOT bead-authored)
 *     _mdSource, _mdSourceContent, _mdBullet,
 *     _h1Title, _allMentions, _allProjects, _rawFrontmatter, _stub,
 *     list_start, lang, meta, rules
 *
 *   Recurrence (km-cli recurrence helpers)
 *     rrule
 *
 * Wrong-shape values produce warnings on the read path; passthrough
 * fields (anything not listed here) are preserved verbatim.
 */
export const beadDataSchema = z
  .object({
    // Identity
    id: z.string().optional(),
    short_id: z.string().optional(),
    aliases: z.array(z.string()).optional(),

    // Lifecycle (mirror of BeadsIssue lifecycle fields when present in props)
    created_at: z.string().optional(),
    created_by: z.string().optional(),
    started_at: z.string().optional(),
    closed_at: z.string().optional(),
    close_reason: z.string().optional(),
    closeReason: z.string().optional(),
    dropReason: z.string().optional(),
    owner: z.string().optional(),
    assignee: z.string().optional(),
    defer_until: z.string().optional(),
    work_type: z.string().optional(),

    // Dependencies (file-bead props)
    dependencies: z.array(beadDataDependencySchema).optional(),

    // Inline properties
    props: beadPropsSchema.optional(),
    propsRaw: beadPropsRawSchema.optional(),

    // Sigil-mirror refs (`tags` was dissolved into the `links` table —
    // see @km/all/dissolve-data-tags-to-links).
    mentions: z.array(z.string()).optional(),

    // bd export metadata (preserved verbatim)
    metadata: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  })
  .passthrough()

export type BeadData = z.infer<typeof beadDataSchema>
export type BeadProp = z.infer<typeof beadPropSchema>
export type BeadProps = z.infer<typeof beadPropsSchema>
export type BeadDataDependency = z.infer<typeof beadDataDependencySchema>

/** Result of `parseBeadData` — typed data + non-fatal warnings. */
export interface BeadDataParseResult {
  data: BeadData
  warnings: BeadDataWarning[]
}

export interface BeadDataWarning {
  /** Dotted key path to the offending field (e.g. `props.blocked-by`). */
  path: string
  /** Zod's human-readable error message. */
  message: string
}

/**
 * Parse and validate `node.data` against the bead schema.
 *
 * Never throws. Unknown extras pass through. Validation problems on
 * known fields are surfaced as `warnings` so callers can log them
 * alongside the bead path or short-id for triage. The returned `data`
 * is the original input (cast to `BeadData`) so we don't drop fields
 * Zod failed to validate — strictness lives in tests + writer assertions.
 */
export function parseBeadData(input: Record<string, unknown> | undefined | null): BeadDataParseResult {
  const data = (input ?? {}) as BeadData
  const result = beadDataSchema.safeParse(input ?? {})
  if (result.success) {
    return { data, warnings: [] }
  }
  const warnings: BeadDataWarning[] = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }))
  return { data, warnings }
}

/**
 * Assert that a write-path patch matches the bead schema. Throws on any
 * known-key violation; unknown extras are still allowed (passthrough).
 *
 * Used by `mutations.ts` callers wrapping `repo.updateNode(id, patch)`
 * — the goal is to fail loudly on drift in km-beads-authored writes,
 * not to police every consumer of `node.data`.
 */
export function assertBeadDataPatch(patch: Record<string, unknown>): void {
  const result = beadDataSchema.safeParse(patch)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
    throw new BeadDataValidationError(`bead data patch failed schema validation:\n${issues}`, result.error.issues)
  }
}

export class BeadDataValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
  ) {
    super(message)
    this.name = "BeadDataValidationError"
  }
}
