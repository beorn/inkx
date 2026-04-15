/**
 * Phase 1 tests — omnibox normalized types and pure derived functions.
 *
 * See docs/design/omnibox.md and apps/km-tui/src/state/omnibox.ts.
 */
import { describe, expect, it } from "vitest"
import {
  SIGIL_MODES,
  applySigilRule,
  createOmniboxPane,
  dismissOmnibox,
  dispatchOmnibox,
  initialStateFromSpec,
  modeOf,
  omniboxReduce,
  openOmnibox,
  resolveEffectiveCommand,
  resolveEnterInvocation,
  withUpdatedState,
  type OmniboxBaseState,
  type OmniboxInvocationSpec,
  type OmniboxPane,
} from "../src/state/omnibox.ts"

function spec(partial: Partial<OmniboxInvocationSpec> = {}): OmniboxInvocationSpec {
  return {
    initialBuffer: partial.initialBuffer ?? "",
    initialDefaultCommand: partial.initialDefaultCommand ?? "default",
    initialArgumentId: partial.initialArgumentId ?? null,
    anchorPaneId: partial.anchorPaneId ?? "pane-1",
    subjectSelection: partial.subjectSelection ?? {
      cursorId: "subject-node",
      selectedIds: ["subject-node"],
    },
    candidateProvider: partial.candidateProvider ?? (() => []),
  }
}

describe("modeOf", () => {
  it("empty buffer → universal", () => {
    expect(modeOf("")).toBe("universal")
  })
  it(": → command", () => {
    expect(modeOf(":move")).toBe("command")
  })
  it("@ → context", () => {
    expect(modeOf("@delei")).toBe("context")
  })
  it("# → tag", () => {
    expect(modeOf("#urgent")).toBe("tag")
  })
  it("+ → project", () => {
    expect(modeOf("+km")).toBe("project")
  })
  it("[ → node", () => {
    expect(modeOf("[foo")).toBe("node")
  })
  it("/ → local_find", () => {
    expect(modeOf("/todo")).toBe("local_find")
  })
  it("unknown leading char → universal", () => {
    expect(modeOf("foo")).toBe("universal")
  })
  it("SIGIL_MODES has 6 canonical entries", () => {
    expect(Object.keys(SIGIL_MODES)).toEqual([":", "@", "#", "+", "[", "/"])
  })
})

describe("resolveEffectiveCommand", () => {
  function state(buffer: string, defaultCommand = "default"): OmniboxBaseState {
    return { buffer, defaultCommand, selectedArgumentId: null }
  }

  it("/ always derives local_find regardless of defaultCommand", () => {
    expect(resolveEffectiveCommand(state("/todo", "goto"))).toBe("local_find")
    expect(resolveEffectiveCommand(state("/", "move"))).toBe("local_find")
  })

  it("non-/ buffer returns defaultCommand as-is", () => {
    expect(resolveEffectiveCommand(state(":create", "move"))).toBe("move")
    expect(resolveEffectiveCommand(state("@del", "goto"))).toBe("goto")
    expect(resolveEffectiveCommand(state("", "default"))).toBe("default")
  })

  it("backspace-through-/ restores the sticky command (no reducer work)", () => {
    // The state.defaultCommand stays 'move' across a /-probe; only the
    // derived value flips back.
    let s = state("", "move")
    expect(resolveEffectiveCommand(s)).toBe("move")
    s = { ...s, buffer: "/" }
    expect(resolveEffectiveCommand(s)).toBe("local_find")
    // user backspaces
    s = { ...s, buffer: "" }
    expect(resolveEffectiveCommand(s)).toBe("move") // sticky preserved
  })
})

describe("initialStateFromSpec", () => {
  it("builds a 3-field state from a full spec", () => {
    const s = initialStateFromSpec(
      spec({ initialBuffer: ":", initialDefaultCommand: "move", initialArgumentId: "node-42" }),
    )
    expect(s).toEqual({
      buffer: ":",
      defaultCommand: "move",
      selectedArgumentId: "node-42",
    })
  })

  it("defaults defaultCommand to 'default' when empty", () => {
    const s = initialStateFromSpec(spec({ initialDefaultCommand: "" }))
    expect(s.defaultCommand).toBe("default")
  })

  it("preserves null initialArgumentId", () => {
    const s = initialStateFromSpec(spec({ initialArgumentId: null }))
    expect(s.selectedArgumentId).toBeNull()
  })
})

describe("resolveEnterInvocation — subject/target plumbing", () => {
  it("argumentId comes from state, subject comes from spec (subject/target split)", () => {
    const inv = resolveEnterInvocation(
      { buffer: ":move", defaultCommand: "move", selectedArgumentId: "target-node" },
      spec({
        anchorPaneId: "pane-board",
        subjectSelection: { cursorId: "subject-card", selectedIds: ["subject-card"] },
      }),
    )
    expect(inv).toEqual({
      commandId: "move",
      argumentId: "target-node",
      buffer: ":move",
      subject: { cursorId: "subject-card", selectedIds: ["subject-card"] },
    })
  })

  it("uses effectiveCommand (/ sigil derives local_find)", () => {
    const inv = resolveEnterInvocation(
      { buffer: "/todo", defaultCommand: "goto", selectedArgumentId: "node-x" },
      spec(),
    )
    expect(inv.commandId).toBe("local_find")
    expect(inv.argumentId).toBe("node-x")
  })

  it("binary verbs get both subject and target (m + pick +km)", () => {
    // Simulates 'm' chord: open with defaultCommand='move', subject=anchor
    // cursor, user types '+km' and picks '+km' node.
    const s: OmniboxBaseState = {
      buffer: "+km",
      defaultCommand: "move",
      selectedArgumentId: "project-km",
    }
    const sp = spec({
      initialDefaultCommand: "move",
      subjectSelection: { cursorId: "anchor-card", selectedIds: ["anchor-card"] },
    })
    const inv = resolveEnterInvocation(s, sp)
    // Subject ≠ target. This is the /pro blocker-1 invariant:
    // we do NOT conflate them.
    expect(inv.subject.cursorId).toBe("anchor-card")
    expect(inv.argumentId).toBe("project-km")
    expect(inv.commandId).toBe("move")
  })

  it("buffer is passed through verbatim (for capture_inbox and similar)", () => {
    const inv = resolveEnterInvocation(
      { buffer: "buy milk", defaultCommand: "capture_inbox", selectedArgumentId: null },
      spec(),
    )
    expect(inv.buffer).toBe("buy milk")
    expect(inv.argumentId).toBeNull()
  })
})

describe("applySigilRule — asymmetric sigil replace", () => {
  describe("empty buffer", () => {
    it("typing any char becomes the buffer", () => {
      expect(applySigilRule("", ":")).toBe(":")
      expect(applySigilRule("", "@")).toBe("@")
      expect(applySigilRule("", "a")).toBe("a")
    })
  })

  describe(":-slippery rule", () => {
    it(":cr + typing @ → @cr (replace)", () => {
      expect(applySigilRule(":cr", "@")).toBe("@cr")
    })
    it(":cr + typing # → #cr", () => {
      expect(applySigilRule(":cr", "#")).toBe("#cr")
    })
    it(":cr + typing + → +cr", () => {
      expect(applySigilRule(":cr", "+")).toBe("+cr")
    })
    it(":cr + typing / → /cr", () => {
      expect(applySigilRule(":cr", "/")).toBe("/cr")
    })
    it(":cr + typing a → :cra (letter, no replace)", () => {
      expect(applySigilRule(":cr", "a")).toBe(":cra")
    })
    it(":cr + typing : → :cr: (same sigil, literal append)", () => {
      expect(applySigilRule(":cr", ":")).toBe(":cr:")
    })
  })

  describe("content sigils are sticky (not slippery)", () => {
    it("@del + typing : → @del: (NOT :del)", () => {
      expect(applySigilRule("@del", ":")).toBe("@del:")
    })
    it("@del + typing # → @del# (NOT #del)", () => {
      expect(applySigilRule("@del", "#")).toBe("@del#")
    })
    it("#tag + typing @ → #tag@", () => {
      expect(applySigilRule("#tag", "@")).toBe("#tag@")
    })
    it("+km + typing / → +km/", () => {
      expect(applySigilRule("+km", "/")).toBe("+km/")
    })
    it("[foo + typing : → [foo:", () => {
      expect(applySigilRule("[foo", ":")).toBe("[foo:")
    })
  })

  describe("letters and multi-char inputs", () => {
    it("appends letters normally", () => {
      expect(applySigilRule("abc", "d")).toBe("abcd")
    })
    it("multi-char typed strings append verbatim", () => {
      expect(applySigilRule(":cr", "eate")).toBe(":create")
    })
  })
})

describe("createOmniboxPane + omniboxReduce", () => {
  const baseSpec = spec({
    initialBuffer: ":",
    initialDefaultCommand: "default",
    subjectSelection: { cursorId: "anchor", selectedIds: ["anchor"] },
  })

  it("createOmniboxPane couples state with frozen spec", () => {
    const pane = createOmniboxPane(baseSpec)
    expect(pane.state).toEqual({
      buffer: ":",
      defaultCommand: "default",
      selectedArgumentId: null,
    })
    expect(pane.spec).toBe(baseSpec)
  })

  it("withUpdatedState returns a new pane with replaced state and same spec", () => {
    const pane = createOmniboxPane(baseSpec)
    const updated = withUpdatedState(pane, { ...pane.state, buffer: "foo" })
    expect(updated.spec).toBe(pane.spec)
    expect(updated.state.buffer).toBe("foo")
    expect(updated).not.toBe(pane)
  })

  describe("omniboxReduce", () => {
    const pane = createOmniboxPane(baseSpec)

    it("SET_BUFFER replaces the buffer", () => {
      const next = omniboxReduce(pane, { type: "SET_BUFFER", buffer: "hello" })
      expect(next.state.buffer).toBe("hello")
      expect(next.state.defaultCommand).toBe("default") // sticky preserved
    })

    it("TYPE_CHAR applies the asymmetric sigil rule (: slippery)", () => {
      const seed = omniboxReduce(pane, { type: "SET_BUFFER", buffer: ":cr" })
      const next = omniboxReduce(seed, { type: "TYPE_CHAR", char: "@" })
      expect(next.state.buffer).toBe("@cr")
    })

    it("TYPE_CHAR applies sticky rule to content sigils", () => {
      const seed = omniboxReduce(pane, { type: "SET_BUFFER", buffer: "@del" })
      const next = omniboxReduce(seed, { type: "TYPE_CHAR", char: "#" })
      expect(next.state.buffer).toBe("@del#")
    })

    it("SET_DEFAULT_COMMAND updates the sticky command", () => {
      const next = omniboxReduce(pane, { type: "SET_DEFAULT_COMMAND", commandId: "move" })
      expect(next.state.defaultCommand).toBe("move")
    })

    it("SET_SELECTED_ARGUMENT updates the argument ID", () => {
      const next = omniboxReduce(pane, {
        type: "SET_SELECTED_ARGUMENT",
        argumentId: "node-42",
      })
      expect(next.state.selectedArgumentId).toBe("node-42")
    })

    it("SWITCH_TO_COMMANDS forces :-mode and preserves sticky argument", () => {
      const seed = omniboxReduce(pane, { type: "SET_SELECTED_ARGUMENT", argumentId: "n1" })
      const seeded2 = omniboxReduce(seed, { type: "SET_BUFFER", buffer: "" })
      const next = omniboxReduce(seeded2, { type: "SWITCH_TO_COMMANDS" })
      expect(next.state.buffer).toBe(":")
      expect(next.state.selectedArgumentId).toBe("n1") // sticky preserved
    })

    it("SWITCH_TO_ARGUMENT clears the buffer and preserves sticky command", () => {
      const seed = omniboxReduce(pane, { type: "SET_DEFAULT_COMMAND", commandId: "move" })
      const seeded2 = omniboxReduce(seed, { type: "SET_BUFFER", buffer: ":move" })
      const next = omniboxReduce(seeded2, { type: "SWITCH_TO_ARGUMENT" })
      expect(next.state.buffer).toBe("")
      expect(next.state.defaultCommand).toBe("move") // sticky preserved
    })

    it("CLEAR_ALL wipes buffer + selection, preserves defaultCommand", () => {
      const dirty = omniboxReduce(omniboxReduce(pane, { type: "SET_BUFFER", buffer: "foo" }), {
        type: "SET_SELECTED_ARGUMENT",
        argumentId: "n1",
      })
      const next = omniboxReduce(dirty, { type: "CLEAR_ALL" })
      expect(next.state.buffer).toBe("")
      expect(next.state.selectedArgumentId).toBeNull()
    })

    it("reducer is pure — input pane is not mutated", () => {
      const original = createOmniboxPane(baseSpec)
      omniboxReduce(original, { type: "SET_BUFFER", buffer: "changed" })
      expect(original.state.buffer).toBe(":")
    })

    it("spec is preserved across reducer actions", () => {
      const next = omniboxReduce(pane, { type: "SET_BUFFER", buffer: "foo" })
      expect(next.spec).toBe(pane.spec)
      // Subject never changes, even after a full action chain:
      const chain = [
        { type: "SET_BUFFER", buffer: ":move" } as const,
        { type: "SET_SELECTED_ARGUMENT", argumentId: "target" } as const,
        { type: "SET_DEFAULT_COMMAND", commandId: "move" } as const,
      ].reduce((p, a) => omniboxReduce(p, a), pane)
      expect(chain.spec.subjectSelection.cursorId).toBe("anchor")
    })
  })
})

describe("openOmnibox / dismissOmnibox / dispatchOmnibox — setUI integration", () => {
  function createFakeSetUI(): { setUI: (p: { omnibox: OmniboxPane | null }) => void; ui: { omnibox: OmniboxPane | null } } {
    const ui: { omnibox: OmniboxPane | null } = { omnibox: null }
    return {
      setUI: (p) => {
        ui.omnibox = p.omnibox
      },
      ui,
    }
  }

  it("openOmnibox sets ui.omnibox to a fresh pane from the spec", () => {
    const fake = createFakeSetUI()
    const sp = spec({ initialBuffer: ":", initialDefaultCommand: "move", initialArgumentId: "n1" })
    const pane = openOmnibox(fake.setUI, sp)

    expect(fake.ui.omnibox).toBe(pane)
    expect(fake.ui.omnibox?.state.buffer).toBe(":")
    expect(fake.ui.omnibox?.state.defaultCommand).toBe("move")
    expect(fake.ui.omnibox?.state.selectedArgumentId).toBe("n1")
    expect(fake.ui.omnibox?.spec).toBe(sp)
  })

  it("openOmnibox replaces any existing open omnibox (singleton)", () => {
    const fake = createFakeSetUI()
    openOmnibox(fake.setUI, spec({ initialBuffer: ":" }))
    openOmnibox(fake.setUI, spec({ initialBuffer: "@" }))
    expect(fake.ui.omnibox?.state.buffer).toBe("@")
  })

  it("dismissOmnibox sets ui.omnibox to null", () => {
    const fake = createFakeSetUI()
    openOmnibox(fake.setUI, spec({ initialBuffer: ":" }))
    dismissOmnibox(fake.setUI)
    expect(fake.ui.omnibox).toBeNull()
  })

  it("dispatchOmnibox runs one reducer tick and writes back through setUI", () => {
    const fake = createFakeSetUI()
    openOmnibox(fake.setUI, spec({ initialBuffer: ":" }))
    const next = dispatchOmnibox(fake.setUI, fake.ui.omnibox, {
      type: "SET_SELECTED_ARGUMENT",
      argumentId: "picked-node",
    })
    expect(next?.state.selectedArgumentId).toBe("picked-node")
    expect(fake.ui.omnibox?.state.selectedArgumentId).toBe("picked-node")
  })

  it("dispatchOmnibox is a no-op when no omnibox is open", () => {
    const fake = createFakeSetUI()
    const result = dispatchOmnibox(fake.setUI, null, { type: "SET_BUFFER", buffer: "foo" })
    expect(result).toBeNull()
    expect(fake.ui.omnibox).toBeNull()
  })

  it("open → dispatch → confirm-ready cycle preserves the subject snapshot", () => {
    const fake = createFakeSetUI()
    const sp = spec({
      initialBuffer: "",
      initialDefaultCommand: "move",
      subjectSelection: { cursorId: "anchor-card", selectedIds: ["anchor-card"] },
    })
    openOmnibox(fake.setUI, sp)

    // User types '+k', '+km' becomes the buffer, reducer stays pure.
    let pane = dispatchOmnibox(fake.setUI, fake.ui.omnibox, { type: "TYPE_CHAR", char: "+" })
    pane = dispatchOmnibox(fake.setUI, pane, { type: "TYPE_CHAR", char: "k" })
    pane = dispatchOmnibox(fake.setUI, pane, { type: "TYPE_CHAR", char: "m" })
    pane = dispatchOmnibox(fake.setUI, pane, { type: "SET_SELECTED_ARGUMENT", argumentId: "project-km" })

    // Spec / subjectSelection is still the original anchor — the
    // /pro-blocker-1 invariant "subject is frozen at open time" holds.
    expect(pane?.spec.subjectSelection.cursorId).toBe("anchor-card")
    expect(pane?.state.buffer).toBe("+km")
    expect(pane?.state.selectedArgumentId).toBe("project-km")
    expect(pane?.state.defaultCommand).toBe("move")
  })
})
