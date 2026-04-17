/**
 * KLink — canonical link type in the km AST.
 *
 * Represents every reference the km model knows about: wikilinks, embeds,
 * sigils, external URLs. The host node is implicit — it's whichever KNode
 * owns the AST the link lives in, so KLink has no host/source field.
 *
 * See docs/design/links.md for the full model.
 */

/**
 * The canonical link record. Lives inside KNode.content.
 *
 * - `href` is the parsed, normalized target reference. For km: names this
 *   is `km:<name>[#<fragment>]` with reserved chars percent-encoded. For
 *   self-refs it's `#<fragment>` (no scheme, HTML convention). For externals
 *   it's the original URL.
 * - `rel` is a closed enum for v1. Widens to string when typed predicates
 *   (blocked-by, author, cites, …) land.
 * - `alias` is the `|alias` display override from `[[Note|alias]]`, or the
 *   link-text portion of `[text](url)`.
 * - `md` records the notation used, for roundtrip fidelity.
 */
export type KLink = {
  href: string
  rel: KLinkRel
  alias?: string
  md?: { form?: MdForm }
}

/**
 * Closed enum for v1. Typed predicates deferred.
 */
export type KLinkRel = "link" | "embed"

/**
 * The markdown notation a KLink was parsed from. Used for roundtrip
 * reconstruction. Sigil-inline text (`@Alice`, `#urgent`, `+cleanup`)
 * is `bare` — sigils are just name prefixes, not a separate form.
 */
export type MdForm = "wiki" | "mdlink" | "autolink" | "bare"
