// Bead — domain interface (type + namespace). Canonical surface.
export { Bead } from "./bead.ts"

// Peer surface — types, helpers, and the underlying impls used by
// `Bead.*`. After the L4 cutover the legacy free-function names
// (`createIssueNode`, `nodeToIssue`, `displayId`, `updateIssueFields`,
// `closeIssueFields`, `dropIssueFields`) and type aliases (`Issue`,
// `IssueFilter`, `CreateIssueOptions`) are gone — the impls live under
// `nodeToBead` / `formatBeadId` / `createBeadNode` / `updateBeadFields`
// / `closeBeadFields` / `dropBeadFields` and the canonical types are
// `Bead`, `BeadFilter`, `BeadCreateOptions`. External code uses `Bead.*`.
export * from "./paths.ts"
export * from "./types.ts"
export * from "./short-ids.ts"
export * from "./priority.ts"
export * from "./queries.ts"
export * from "./mutations.ts"
export * from "./move-bead.ts"
export * from "./deps.ts"
export * from "./schema.ts"
export * from "./data-schema.ts"
export * from "./migrate.ts"
export * from "./sync.ts"

// Test helpers — bd-CLI-conventional thin wrapper around @km/storage seedFileNode.
export { seedBead, type SeedBeadOptions } from "./testing/seed-bead.ts"
