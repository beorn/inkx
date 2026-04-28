/**
 * Phase tests — interaction polish (km-tui.omnibox-interactions).
 *
 * Sigil auto-replace and sticky memory are already covered by
 * `omnibox-state.test.ts`. This file owns the remaining Phase 7 surface:
 *
 *   - ghost completion (`ghostFor`) — what the user sees after the cursor
 *     when one result clearly out-ranks the others. Acceptance:
 *       * buffer=":ne" + top result id "new-project" → ghost "w-project"
 *       * Tab/Space/Right-Arrow accepts → buffer=":new-project"
 *       * Enter with visible ghost → accepts then confirms
 *   - modifier chord interpretation (`interpretEnter`) — pure mapping from
 *     keyboard chord to the command the omnibox should run. Covers
 *     Enter, Shift+Enter (force create_at), Ctrl+Enter (force goto), and
 *     the Ctrl+{g,m,a,l,c}+Enter direct-verb chord family.
 *   - cancel/confirm CLEAR_ALL semantics.
 */
import { describe, expect, it } from "vitest"
import { ghostFor, type GhostCandidate } from "../src/state/omnibox-ghost.ts"
import { interpretEnter, type EnterChord, type EnterIntent } from "../src/state/omnibox-chords.ts"

// ---------------------------------------------------------------------------
// ghostFor — completion suffix derivation
// ---------------------------------------------------------------------------

function row(id: string, title: string, kind: "command" | "node" = "command"): GhostCandidate {
  return { id, title, kind }
}

describe("ghostFor — basic completion", () => {
  it("returns null for empty buffer (no ghost on empty input)", () => {
    expect(ghostFor("", [row("new-project", "New project")])).toBeNull()
  })
  it("returns null when no candidates", () => {
    expect(ghostFor(":ne", [])).toBeNull()
  })
  it("returns null when buffer doesn't prefix any candidate id or title", () => {
    expect(ghostFor(":zz", [row("new-project", "New project")])).toBeNull()
  })
  it("':ne' over ':new-project' → ghost 'w-project'", () => {
    const ghost = ghostFor(":ne", [row("new-project", "New project")])
    expect(ghost).toBe("w-project")
  })
  it("'@d' over '@delei' → ghost 'elei'", () => {
    const ghost = ghostFor("@d", [row("delei", "delei", "node")])
    expect(ghost).toBe("elei")
  })
  it("buffer that fully equals a candidate id → null (nothing to complete)", () => {
    expect(ghostFor(":new-project", [row("new-project", "New project")])).toBeNull()
  })
})

describe("ghostFor — uses the top-ranked candidate", () => {
  it("only the FIRST candidate in the list contributes a ghost (caller pre-ranks)", () => {
    // Even though candidate[1] also has prefix overlap, ghost reads from [0].
    const ghost = ghostFor(":ne", [row("new-project", "New project"), row("never-mind", "Never mind")])
    expect(ghost).toBe("w-project")
  })
  it("returns null when the top candidate doesn't prefix-match", () => {
    // Top candidate is the one we ghost. If it doesn't match, no ghost — even
    // if a later one does. This keeps the rule simple and predictable; the
    // ranker is the single source of truth for ordering.
    expect(ghostFor(":ne", [row("zzz", "ZZZ"), row("new-project", "New project")])).toBeNull()
  })
})

describe("ghostFor — case-insensitive prefix matching", () => {
  it("':NE' over ':new-project' → ghost 'w-project'", () => {
    expect(ghostFor(":NE", [row("new-project", "New project")])).toBe("w-project")
  })
})

describe("ghostFor — sigil-prefix awareness", () => {
  it("'cr' (no sigil) over 'create-task' → ghost 'eate-task'", () => {
    expect(ghostFor("cr", [row("create-task", "Create task", "command")])).toBe("eate-task")
  })
  it("':cr' over ':create-task' (sigil already in buffer) → ghost 'eate-task'", () => {
    expect(ghostFor(":cr", [row("create-task", "Create task", "command")])).toBe("eate-task")
  })
})

// ---------------------------------------------------------------------------
// interpretEnter — modifier chord routing
// ---------------------------------------------------------------------------

function chord(partial: Partial<EnterChord> = {}): EnterChord {
  return {
    shift: partial.shift ?? false,
    ctrl: partial.ctrl ?? false,
    meta: partial.meta ?? false,
    verbKey: partial.verbKey,
  }
}

describe("interpretEnter — base behavior", () => {
  it("plain Enter → run-default", () => {
    expect(interpretEnter(chord())).toEqual<EnterIntent>({ kind: "run-default" })
  })
  it("Shift+Enter → force-create-at", () => {
    expect(interpretEnter(chord({ shift: true }))).toEqual<EnterIntent>({ kind: "force-create-at" })
  })
  it("Ctrl+Enter → force-goto", () => {
    expect(interpretEnter(chord({ ctrl: true }))).toEqual<EnterIntent>({ kind: "force-goto" })
  })
})

describe("interpretEnter — direct-verb chords (Ctrl+{g,m,a,l,c}+Enter)", () => {
  it("Ctrl+g+Enter → goto", () => {
    expect(interpretEnter(chord({ ctrl: true, verbKey: "g" }))).toEqual<EnterIntent>({
      kind: "force-verb",
      commandId: "goto",
    })
  })
  it("Ctrl+m+Enter → move", () => {
    expect(interpretEnter(chord({ ctrl: true, verbKey: "m" }))).toEqual<EnterIntent>({
      kind: "force-verb",
      commandId: "move",
    })
  })
  it("Ctrl+a+Enter → add", () => {
    expect(interpretEnter(chord({ ctrl: true, verbKey: "a" }))).toEqual<EnterIntent>({
      kind: "force-verb",
      commandId: "add",
    })
  })
  it("Ctrl+l+Enter → add_link", () => {
    expect(interpretEnter(chord({ ctrl: true, verbKey: "l" }))).toEqual<EnterIntent>({
      kind: "force-verb",
      commandId: "add_link",
    })
  })
  it("Ctrl+c+Enter → capture_inbox", () => {
    expect(interpretEnter(chord({ ctrl: true, verbKey: "c" }))).toEqual<EnterIntent>({
      kind: "force-verb",
      commandId: "capture_inbox",
    })
  })
  it("Ctrl+z+Enter (unknown verb key) → falls back to force-goto", () => {
    expect(interpretEnter(chord({ ctrl: true, verbKey: "z" }))).toEqual<EnterIntent>({ kind: "force-goto" })
  })
})

describe("interpretEnter — combined modifiers", () => {
  it("Shift+Ctrl+Enter → force-create-at wins (shift is the precedence)", () => {
    expect(interpretEnter(chord({ shift: true, ctrl: true }))).toEqual<EnterIntent>({ kind: "force-create-at" })
  })
})
