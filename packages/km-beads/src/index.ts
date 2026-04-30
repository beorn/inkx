// Bead — domain interface (type + namespace). Canonical surface.
export { Bead } from "./bead.ts"

// Legacy/peer surface — types, helpers, and the underlying impls used by
// `Bead.*`. The function-named exports in queries.ts / mutations.ts /
// deps.ts / paths.ts remain for one-commit consumer migration; they're
// JSDoc-`@deprecated`. New code should reach for `Bead.*`.
export * from "./paths.ts"
export * from "./types.ts"
export * from "./short-ids.ts"
export * from "./priority.ts"
export * from "./queries.ts"
export * from "./mutations.ts"
export * from "./deps.ts"
export * from "./schema.ts"
export * from "./data-schema.ts"
export * from "./migrate.ts"
export * from "./sync.ts"
