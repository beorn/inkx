import { describe, expect, test } from "vitest"
import { SIGILS, getSigilChar, hasSigilPrefix, isInlineSigilStart, isSigilChar } from "../src/sigils.ts"

describe("SIGILS", () => {
  test("recognized sigils are @ # +", () => {
    expect(Object.keys(SIGILS).sort()).toEqual(["#", "+", "@"])
  })

  test("each sigil has a kind", () => {
    expect(SIGILS["@"].kind).toBe("person")
    expect(SIGILS["#"].kind).toBe("tag")
    expect(SIGILS["+"].kind).toBe("project")
  })
})

describe("isSigilChar", () => {
  test.each(["@", "#", "+"])("%s is a sigil", (ch) => {
    expect(isSigilChar(ch)).toBe(true)
  })

  test.each(["a", "1", "-", "", "##", " "])("%s is not a sigil", (ch) => {
    expect(isSigilChar(ch)).toBe(false)
  })
})

describe("hasSigilPrefix / getSigilChar", () => {
  test("sigil-prefixed names", () => {
    expect(hasSigilPrefix("@Alice")).toBe(true)
    expect(hasSigilPrefix("#urgent")).toBe(true)
    expect(hasSigilPrefix("+cleanup")).toBe(true)
    expect(getSigilChar("@Alice")).toBe("@")
    expect(getSigilChar("#urgent")).toBe("#")
    expect(getSigilChar("+cleanup")).toBe("+")
  })

  test("plain names", () => {
    expect(hasSigilPrefix("Alice")).toBe(false)
    expect(hasSigilPrefix("")).toBe(false)
    expect(hasSigilPrefix("note/sub")).toBe(false)
    expect(getSigilChar("Alice")).toBeNull()
    expect(getSigilChar("")).toBeNull()
  })
})

describe("isInlineSigilStart — letter-after rule + word boundary", () => {
  test("sigil + letter + word boundary is a sigil", () => {
    expect(isInlineSigilStart("#urgent", 0)).toBe(true)
    expect(isInlineSigilStart(" #urgent", 1)).toBe(true)
    expect(isInlineSigilStart("hello @Alice", 6)).toBe(true)
    expect(isInlineSigilStart("tag: +cleanup", 5)).toBe(true)
    expect(isInlineSigilStart("(Alice @bob)", 7)).toBe(true)
  })

  test("sigil + digit is NOT a sigil (common prose)", () => {
    expect(isInlineSigilStart("issue #42", 6)).toBe(false)
    expect(isInlineSigilStart("#1 priority", 0)).toBe(false)
    expect(isInlineSigilStart("dial @911", 5)).toBe(false)
    expect(isInlineSigilStart("+4 dB", 0)).toBe(false)
  })

  test("sigil inside a word is NOT a sigil", () => {
    expect(isInlineSigilStart("foo#bar", 3)).toBe(false)
    expect(isInlineSigilStart("email@address", 5)).toBe(false)
  })

  test("sigil without following letter is NOT a sigil", () => {
    expect(isInlineSigilStart("#", 0)).toBe(false)
    expect(isInlineSigilStart("# header", 0)).toBe(false)
    expect(isInlineSigilStart("see #", 4)).toBe(false)
  })

  test("non-sigil char returns false", () => {
    expect(isInlineSigilStart("hello", 0)).toBe(false)
    expect(isInlineSigilStart("&urgent", 0)).toBe(false)
  })

  test("out of bounds returns false", () => {
    expect(isInlineSigilStart("#foo", -1)).toBe(false)
    expect(isInlineSigilStart("#foo", 100)).toBe(false)
  })

  test("unicode letters count", () => {
    expect(isInlineSigilStart("@Ålice", 0)).toBe(true)
    expect(isInlineSigilStart("#日本語", 0)).toBe(true)
  })
})
