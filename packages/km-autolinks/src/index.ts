/**
 * @km/autolinks — pattern→URI→preview pipeline.
 *
 * Umbrella package for autolinks substrate:
 *   - "syntaxlinks": run-time pattern→popover (silvercode's subtype)
 *   - "termlinks":   build-time term→anchor (website subtype, future)
 *
 * The YAML config key (`syntaxlinks:`) and existing function names
 * (`parseSyntaxlinksYaml`, etc.) keep their specific names — they describe
 * silvercode's subtype, not the umbrella.
 *
 * See `docs/design/autolinks.md` for terminology + design.
 */

export * from "./detection.ts"
export * from "./config.ts"
export * from "./match.ts"
export * from "./previews.ts"
export * from "./uri.ts"
export * from "./shell-utils.ts"
export * from "./handlers/index.ts"
