/**
 * Phase 1 tests — omnibox normalized types and pure derived functions.
 *
 * See docs/design/omnibox.md and apps/km-tui/src/state/omnibox.ts.
 */
import { describe, expect, it } from "vitest"
import {
  SIGIL_MODES,
  applySigilRule,
  initialStateFromSpec,
  modeOf,
  resolveEffectiveCommand,
  resolveEnterInvocation,
  type OmniboxBaseState,
  type OmniboxInvocationSpec,
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
