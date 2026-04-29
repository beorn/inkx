/**
 * resolveShortId / getIssue — property tests over (id-form × scope × bead-class).
 *
 * Tracking bead: @km/beads/id-resolution-plateau
 *
 * The id-resolver chain in `packages/km-beads/src/short-ids.ts` is:
 *   1. canonical path-form              `scope/slug`         → match `data.id`
 *   2. sigil-prefixed path-form         `@km/scope/slug`     → match `data.id`
 *   3. legacy bd-form short_id          `km-scope.slug`      → match `data.short_id`
 *   4. legacy bd-form via aliases       `km-scope.slug-old`  → entry in `data.aliases`
 *
 * Properties verified here (random instances of `(scope, slug, prefix)`):
 *
 * - **Forward equivalence** — for a bead seeded with all three id forms,
 *   `resolveShortId` resolves each form to the same node id.
 * - **`getIssue` consistency** — `getIssue(form)` returns the same `Issue`
 *   (same `id`, `shortId`, `path`) regardless of which id-form the caller
 *   passes.
 * - **Cross-scope disambiguation** — two beads with identical slug under
 *   different scopes resolve to distinct nodes; no slug-only collision
 *   bleeds the answer between scopes.
 * - **Unknown id is null, not throw** — a well-formed input that doesn't
 *   match any bead returns `null` (typed not-found).
 * - **Aliases override bd-form when both exist** — when a bead carries an
 *   alias for a foreign bd-form id, `resolveShortId(alias)` resolves it.
 * - **Sigil stripping is prefix-aware** — `@km/scope/slug` and
 *   `@vendor/scope/slug` both strip to `scope/slug` for the LIKE-match
 *   arm, so a bead stored under one prefix is reachable via the other
 *   form's sigil only when the underlying canonical path matches.
 *
 * No fix work in this slot — these tests document the *current* contract
 * of the resolver. Surprises become follow-up beads (see notes inline).
 */

import { describe, test, expect } from "vitest"
import fc from "fast-check"
import { createTestRepo } from "@km/storage"
import type { Repo } from "@km/storage"

import { resolveShortId } from "../src/short-ids.ts"
import { getIssue } from "../src/queries.ts"

// =============================================================================
// Generators
// =============================================================================

/**
 * Hyphen-separated lower-case slug tokens. Two-segment min so the bd-form
 * `<prefix>-<scope>.<slug>` has both a scope and a slug. Length capped to
 * keep shrinking fast.
 */
const slugSegment = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/)

const scope = slugSegment.filter((s) => s.length > 0)
const slug = fc
  .array(slugSegment, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"))
  .filter((s) => s.length > 0)

const prefix = fc
  .stringMatching(/^[a-z]{2,5}$/)
  .filter((p) => p.length >= 2)

/**
 * (scope, slug, prefix) — the basic coordinate space for a bead.
 */
const beadCoord = fc.record({ scope, slug, prefix })

// =============================================================================
// Fixtures
// =============================================================================

interface BeadSpec {
  scope: string
  slug: string
  prefix: string
}

interface SeededBead extends BeadSpec {
  /** Internal node id (ULID). */
  nodeId: string
  /** All four user-supplied forms that should resolve to nodeId. */
  forms: {
    canonical: string // "scope/slug"
    sigil: string // "@<prefix>/scope/slug"
    bdForm: string // "<prefix>-scope.slug"
    sigilStored: string // "@<prefix>/scope/slug" — the form actually written to data.id
  }
}

/**
 * Seed a single bead with the canonical-plus-legacy id triple. Mirrors the
 * production migrator (packages/km-beads/src/migrate.ts) — `data.id` carries
 * the sigil-prefixed canonical path, `data.short_id` carries bd-form, and
 * `data.aliases` lists historical bd-form variants.
 */
function seedBead(repo: Repo, b: BeadSpec): SeededBead {
  const sigilStored = `@${b.prefix}/${b.scope}/${b.slug}`
  const bdForm = `${b.prefix}-${b.scope}.${b.slug}`
  const dashForm = `${b.prefix}-${b.scope}-${b.slug}`

  const nodeId = repo.addNode(null, {
    type: "p",
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content: `Bead ${b.scope}/${b.slug}`,
    fs_path: `${sigilStored}.md`,
    data: {
      id: sigilStored,
      short_id: bdForm,
      aliases: [bdForm, dashForm],
    },
  })

  return {
    ...b,
    nodeId,
    forms: {
      canonical: `${b.scope}/${b.slug}`,
      sigil: sigilStored,
      bdForm,
      sigilStored,
    },
  }
}

// =============================================================================
// Property: forward equivalence — three id-forms resolve to the same node
// =============================================================================

describe("id-resolution property: id-form × scope × bead-class", () => {
  test("all three id-forms resolve to the same node id", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const seeded = seedBead(repo, b)

        const byCanonical = resolveShortId(seeded.forms.canonical, { repo })
        const bySigil = resolveShortId(seeded.forms.sigil, { repo })
        const byBdForm = resolveShortId(seeded.forms.bdForm, { repo })

        expect(byCanonical).toBe(seeded.nodeId)
        expect(bySigil).toBe(seeded.nodeId)
        expect(byBdForm).toBe(seeded.nodeId)
      }),
      { numRuns: 100 },
    )
  })

  test("getIssue returns a structurally-equal Issue regardless of input form", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const seeded = seedBead(repo, b)

        const fromCanonical = getIssue(seeded.forms.canonical, { repo })
        const fromSigil = getIssue(seeded.forms.sigil, { repo })
        const fromBdForm = getIssue(seeded.forms.bdForm, { repo })

        expect(fromCanonical).not.toBeNull()
        expect(fromSigil).not.toBeNull()
        expect(fromBdForm).not.toBeNull()

        // The node id, shortId, and path must agree across input forms —
        // they are pure properties of the underlying bead, not the lookup
        // path used to reach it.
        expect(fromSigil?.id).toBe(fromCanonical?.id)
        expect(fromBdForm?.id).toBe(fromCanonical?.id)
        expect(fromSigil?.shortId).toBe(fromCanonical?.shortId)
        expect(fromBdForm?.shortId).toBe(fromCanonical?.shortId)
        expect(fromSigil?.path).toBe(fromCanonical?.path)
        expect(fromBdForm?.path).toBe(fromCanonical?.path)
      }),
      { numRuns: 100 },
    )
  })
})

// =============================================================================
// Property: cross-scope disambiguation
// =============================================================================

describe("cross-scope disambiguation", () => {
  test("identical slugs under different scopes resolve to distinct beads", () => {
    fc.assert(
      fc.property(
        prefix,
        scope,
        scope,
        slug,
        (p, scopeA, scopeB, sharedSlug) => {
          fc.pre(scopeA !== scopeB)
          using repo = createTestRepo()
          const a = seedBead(repo, { prefix: p, scope: scopeA, slug: sharedSlug })
          const b = seedBead(repo, { prefix: p, scope: scopeB, slug: sharedSlug })
          expect(a.nodeId).not.toBe(b.nodeId)

          // Each canonical form must resolve to its own bead — no
          // slug-only collision picks the wrong scope.
          expect(resolveShortId(a.forms.canonical, { repo })).toBe(a.nodeId)
          expect(resolveShortId(b.forms.canonical, { repo })).toBe(b.nodeId)
          expect(resolveShortId(a.forms.sigil, { repo })).toBe(a.nodeId)
          expect(resolveShortId(b.forms.sigil, { repo })).toBe(b.nodeId)
          expect(resolveShortId(a.forms.bdForm, { repo })).toBe(a.nodeId)
          expect(resolveShortId(b.forms.bdForm, { repo })).toBe(b.nodeId)
        },
      ),
      { numRuns: 50 },
    )
  })

  test("bd-form disambiguates across foreign prefixes (always — short_id is unique per bead)", () => {
    fc.assert(
      fc.property(prefix, prefix, scope, slug, (pA, pB, s, k) => {
        fc.pre(pA !== pB)
        using repo = createTestRepo()
        const a = seedBead(repo, { prefix: pA, scope: s, slug: k })
        const b = seedBead(repo, { prefix: pB, scope: s, slug: k })

        // bd-form is prefix-bearing — `<prefix>-<scope>.<slug>` — and
        // hits arm 2 (`data.short_id = ?`) by exact match. No ambiguity.
        expect(resolveShortId(a.forms.bdForm, { repo })).toBe(a.nodeId)
        expect(resolveShortId(b.forms.bdForm, { repo })).toBe(b.nodeId)
      }),
      { numRuns: 50 },
    )
  })

  test("bare scope/slug is ambiguous across multiple prefixes — returns one of them", () => {
    // Two beads, same scope/slug, different prefix sigils. Bare
    // `scope/slug` hits arm 1 via the LIKE clause `data.id LIKE '%/<s>/<k>'`,
    // which matches both rows; SQLite's LIMIT 1 returns whichever the
    // planner picked first — caller cannot rely on which.
    fc.assert(
      fc.property(prefix, prefix, scope, slug, (pA, pB, s, k) => {
        fc.pre(pA !== pB)
        using repo = createTestRepo()
        const a = seedBead(repo, { prefix: pA, scope: s, slug: k })
        const b = seedBead(repo, { prefix: pB, scope: s, slug: k })

        const bareResult = resolveShortId(a.forms.canonical, { repo })
        expect([a.nodeId, b.nodeId]).toContain(bareResult)
      }),
      { numRuns: 50 },
    )
  })

  // KNOWN BUG (filed as follow-up): the sigil-prefixed canonical form
  // currently does NOT reliably disambiguate when two beads share the
  // same `scope/slug` under different prefixes.
  //
  // Root cause: `resolveShortId` issues a single SQL statement with three
  // OR-ed predicates against `data.id`:
  //
  //     data.id = ?              -- exact, with sigil
  //   OR data.id = ?              -- exact, sigil-stripped
  //   OR data.id LIKE ?           -- '%/<sigil-stripped>'
  //   LIMIT 1
  //
  // The third predicate matches BOTH `@<prefixA>/scope/slug` AND
  // `@<prefixB>/scope/slug`, and `LIMIT 1` over an OR is order-undefined,
  // so the result can flip to the foreign-prefix bead even when arm 1's
  // exact match would succeed.
  //
  // Expected fix: short-circuit — try exact match first; only fall back
  // to LIKE when no exact match found. Tracked in follow-up bead
  // `@km/beads/resolver-sigil-ambiguity`.
  //
  // Marked `.fails` so CI surfaces the bug without blocking the suite.
  // Once the resolver is fixed, this test will pass and `.fails` should
  // be removed.
  test.fails("KNOWN BUG: sigil form should disambiguate across foreign prefixes", () => {
    fc.assert(
      fc.property(prefix, prefix, scope, slug, (pA, pB, s, k) => {
        fc.pre(pA !== pB)
        using repo = createTestRepo()
        const a = seedBead(repo, { prefix: pA, scope: s, slug: k })
        const b = seedBead(repo, { prefix: pB, scope: s, slug: k })

        // Sigil-prefixed forms SHOULD disambiguate — exact data.id match
        // ought to win over the LIKE-match arm.
        expect(resolveShortId(a.forms.sigil, { repo })).toBe(a.nodeId)
        expect(resolveShortId(b.forms.sigil, { repo })).toBe(b.nodeId)
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Property: unknown id → null (typed not-found)
// =============================================================================

describe("unknown id returns null, not throw", () => {
  test("resolveShortId returns null for unknown well-formed inputs", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        // Don't seed any beads — every lookup must return null.
        expect(resolveShortId(`${b.scope}/${b.slug}`, { repo })).toBeNull()
        expect(resolveShortId(`@${b.prefix}/${b.scope}/${b.slug}`, { repo })).toBeNull()
        expect(resolveShortId(`${b.prefix}-${b.scope}.${b.slug}`, { repo })).toBeNull()
      }),
      { numRuns: 50 },
    )
  })

  test("getIssue returns null for unknown ids", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        expect(getIssue(`${b.scope}/${b.slug}`, { repo })).toBeNull()
        expect(getIssue(`@${b.prefix}/${b.scope}/${b.slug}`, { repo })).toBeNull()
        expect(getIssue(`${b.prefix}-${b.scope}.${b.slug}`, { repo })).toBeNull()
      }),
      { numRuns: 50 },
    )
  })

  test("resolver does not pluck a different bead when querying a non-existent slug", () => {
    fc.assert(
      fc.property(beadCoord, slug, (b, otherSlug) => {
        fc.pre(b.slug !== otherSlug)
        using repo = createTestRepo()
        seedBead(repo, b)

        // Query for a slug that doesn't exist under the same scope.
        const ghost = resolveShortId(`${b.scope}/${otherSlug}`, { repo })
        expect(ghost).toBeNull()

        // Real bead still resolves.
        const real = resolveShortId(`${b.scope}/${b.slug}`, { repo })
        expect(real).not.toBeNull()
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Property: aliases
// =============================================================================

describe("aliases", () => {
  test("alias entries resolve to the host bead", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        const seeded = seedBead(repo, b)

        // Both forms registered in `data.aliases` (bd-form + dash-form)
        // resolve to the same node.
        const dashForm = `${b.prefix}-${b.scope}-${b.slug}`
        expect(resolveShortId(dashForm, { repo })).toBe(seeded.nodeId)
      }),
      { numRuns: 50 },
    )
  })

  test("alias under one bead does NOT shadow a different bead's canonical id", () => {
    // Bead A's alias must not cause `resolveShortId(B.canonical)` to return
    // A. The chain order (canonical → short_id → aliases) makes canonical
    // win when both could match, but here we test the opposite arm: the
    // alias lookup must not pre-empt a canonical match elsewhere.
    fc.assert(
      fc.property(prefix, scope, slug, scope, slug, (p, scopeA, slugA, scopeB, slugB) => {
        fc.pre(scopeA !== scopeB || slugA !== slugB)
        using repo = createTestRepo()

        // Bead A seeded normally with bd-form alias.
        const a = seedBead(repo, { prefix: p, scope: scopeA, slug: slugA })

        // Bead B carries Bead A's bd-form id as one of *its* aliases —
        // pathological but possible if migration accidentally duplicates.
        const bSigil = `@${p}/${scopeB}/${slugB}`
        const bNode = repo.addNode(null, {
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" } },
          content: `Bead B`,
          fs_path: `${bSigil}.md`,
          data: {
            id: bSigil,
            short_id: `${p}-${scopeB}.${slugB}`,
            aliases: [a.forms.bdForm], // ← collides with A's bd-form
          },
        })

        // Looking up A's bd-form: arm 2 (short_id) hits A first, before
        // arm 3 (aliases) would hit B. So A wins. This is the contract.
        const result = resolveShortId(a.forms.bdForm, { repo })
        expect(result).toBe(a.nodeId)
        expect(result).not.toBe(bNode)
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Property: bead-class — only beads carry resolvable ids
// =============================================================================

describe("bead-class — non-bead nodes are not addressable", () => {
  test("a node without data.id / data.short_id / data.aliases is not resolvable", () => {
    fc.assert(
      fc.property(beadCoord, (b) => {
        using repo = createTestRepo()
        // Anonymous node — no bead identity at all.
        repo.addNode(null, {
          type: "p",
          item: { list: "-", task: { marker: "[ ]", status: "todo" } },
          content: "anonymous descendant",
        })

        // None of the well-formed user-supplied forms resolve to it.
        expect(resolveShortId(`${b.scope}/${b.slug}`, { repo })).toBeNull()
        expect(resolveShortId(`@${b.prefix}/${b.scope}/${b.slug}`, { repo })).toBeNull()
        expect(resolveShortId(`${b.prefix}-${b.scope}.${b.slug}`, { repo })).toBeNull()
      }),
      { numRuns: 50 },
    )
  })
})

// =============================================================================
// Hand-rolled regression cases — keep alongside the property tests so the
// shrinker has concrete anchors and humans have concrete examples.
// =============================================================================

describe("id-resolution — hand-rolled cases", () => {
  test("canonical path-form resolves through the LIKE arm even without sigil-stored data", () => {
    using repo = createTestRepo()
    // Some beads in older migrations may store data.id WITHOUT the sigil.
    const nodeId = repo.addNode(null, {
      type: "p",
      content: "old-style id",
      fs_path: "@km/scope/old-style.md",
      data: { id: "scope/old-style" },
    })

    // Bare canonical hits arm 1 directly (exact match against data.id).
    expect(resolveShortId("scope/old-style", { repo })).toBe(nodeId)

    // Sigil form hits via the third predicate (LIKE '%/scope/old-style')
    // after stripping `@km/`.
    expect(resolveShortId("@km/scope/old-style", { repo })).toBe(nodeId)
  })

  test("multiple foreign sigils against the same canonical path resolve to the only bead", () => {
    using repo = createTestRepo()
    const nodeId = repo.addNode(null, {
      type: "p",
      content: "shared-canonical",
      fs_path: "@km/scope/shared.md",
      data: { id: "@km/scope/shared" },
    })

    // Foreign sigil — gets stripped, falls through to LIKE '%/scope/shared'.
    expect(resolveShortId("@vendor/scope/shared", { repo })).toBe(nodeId)
    expect(resolveShortId("@otherprefix/scope/shared", { repo })).toBe(nodeId)
  })

  test("empty-string and degenerate inputs return null (no exception)", () => {
    using repo = createTestRepo()
    repo.addNode(null, {
      type: "p",
      content: "Real bead",
      fs_path: "@km/scope/real.md",
      data: { id: "@km/scope/real", short_id: "km-scope.real" },
    })

    // Empty input matches nothing — assert null and no throw.
    expect(resolveShortId("", { repo })).toBeNull()
    expect(resolveShortId("@", { repo })).toBeNull()
    expect(resolveShortId("/", { repo })).toBeNull()
    expect(resolveShortId("@km/", { repo })).toBeNull()
  })

  test("resolveShortId throws when no repo is supplied", () => {
    // Unambiguous: this is contract — caller must thread a repo.
    expect(() => resolveShortId("scope/slug", {} as never)).toThrow(/repo/)
  })

  test("getIssue returns null with no repo (typed not-found)", () => {
    expect(getIssue("scope/slug")).toBeNull()
    expect(getIssue("scope/slug", {})).toBeNull()
  })
})
