import { describe, expect, it } from "vitest"
import { TerminalBuffer } from "../src/buffer"

function seedWideCell(buffer: TerminalBuffer, x: number, y: number): void {
  buffer.setCell(x, y, { char: "📁", wide: true })
  buffer.setCell(x + 1, y, { char: "", continuation: true })
}

describe("TerminalBuffer wide-cell consistency", () => {
  it("clears the leading cell when fill starts on a continuation", () => {
    const buffer = new TerminalBuffer(8, 1)
    seedWideCell(buffer, 0, 0)

    buffer.fill(1, 0, 4, 1, { char: " " })
    buffer.setCell(1, 0, { char: "│" })

    expect(buffer.getCell(0, 0)).toMatchObject({ char: " ", wide: false })
    expect(buffer.getCell(1, 0)).toMatchObject({ char: "│", continuation: false })
  })

  it("clears the trailing continuation when fill ends on a wide lead", () => {
    const buffer = new TerminalBuffer(8, 1)
    seedWideCell(buffer, 4, 0)

    buffer.fill(1, 0, 4, 1, { char: " " })

    expect(buffer.getCell(4, 0)).toMatchObject({ char: " ", wide: false })
    expect(buffer.getCell(5, 0)).toMatchObject({ char: " ", continuation: false })
  })

  it("does not copy orphaned wide halves from a partial source region", () => {
    const source = new TerminalBuffer(8, 1)
    seedWideCell(source, 0, 0)
    seedWideCell(source, 4, 0)
    const target = new TerminalBuffer(8, 1)

    target.copyFrom(source, 1, 0, 1, 0, 4, 1)

    expect(target.getCell(1, 0)).toMatchObject({ char: " ", continuation: false })
    expect(target.getCell(4, 0)).toMatchObject({ char: " ", wide: false })
  })

  it("does not scroll orphaned wide halves from a partial region", () => {
    const buffer = new TerminalBuffer(8, 2)
    seedWideCell(buffer, 0, 1)
    seedWideCell(buffer, 4, 1)

    buffer.scrollRegion(1, 0, 4, 2, 1)

    expect(buffer.getCell(1, 0)).toMatchObject({ char: " ", continuation: false })
    expect(buffer.getCell(4, 0)).toMatchObject({ char: " ", wide: false })
  })
})
