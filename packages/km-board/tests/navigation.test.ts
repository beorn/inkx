/**
 * Tests for visualToStructural navigation translation
 */

import { describe, it, expect } from "bun:test";
import { visualToStructural, canMove } from "../src/navigation.ts";

describe("visualToStructural", () => {
  describe("at board level (depth 0)", () => {
    it("down enters first column", () => {
      expect(visualToStructural(0, "down")).toEqual({
        action: "enter_column",
        target: 0,
      });
    });

    it("up is noop", () => {
      expect(visualToStructural(0, "up")).toEqual({ action: "noop" });
    });

    it("left is noop", () => {
      expect(visualToStructural(0, "left")).toEqual({ action: "noop" });
    });

    it("right is noop", () => {
      expect(visualToStructural(0, "right")).toEqual({ action: "noop" });
    });
  });

  describe("at column level (depth 1)", () => {
    it("down enters first card", () => {
      expect(visualToStructural(1, "down")).toEqual({
        action: "enter_card",
        target: 0,
      });
    });

    it("up exits to board", () => {
      expect(visualToStructural(1, "up")).toEqual({ action: "exit_to_board" });
    });

    it("left moves to prev column", () => {
      expect(visualToStructural(1, "left")).toEqual({ action: "prev_column" });
    });

    it("right moves to next column", () => {
      expect(visualToStructural(1, "right")).toEqual({ action: "next_column" });
    });
  });

  describe("at card level (depth 2)", () => {
    it("down moves to next sibling", () => {
      expect(visualToStructural(2, "down")).toEqual({ action: "next_sibling" });
    });

    it("up at first card exits to column", () => {
      expect(visualToStructural(2, "up", { cardIndex: 0 })).toEqual({
        action: "exit_to_column",
      });
    });

    it("up at non-first card moves to prev sibling", () => {
      expect(visualToStructural(2, "up", { cardIndex: 3 })).toEqual({
        action: "prev_sibling",
      });
    });

    it("left moves to prev column", () => {
      expect(visualToStructural(2, "left")).toEqual({ action: "prev_column" });
    });

    it("right moves to next column", () => {
      expect(visualToStructural(2, "right")).toEqual({ action: "next_column" });
    });
  });

  describe("at deeper levels (depth 3+)", () => {
    it("behaves same as card level", () => {
      expect(visualToStructural(3, "down")).toEqual({ action: "next_sibling" });
      expect(visualToStructural(4, "up", { cardIndex: 2 })).toEqual({
        action: "prev_sibling",
      });
    });
  });
});

describe("canMove", () => {
  const baseContext = {
    cardIndex: 1,
    cardCount: 5,
    colIndex: 1,
    colCount: 3,
  };

  it("returns false for noop actions at board level", () => {
    expect(canMove(0, "up", baseContext)).toBe(false);
    expect(canMove(0, "left", baseContext)).toBe(false);
    expect(canMove(0, "right", baseContext)).toBe(false);
  });

  it("allows entering columns when columns exist", () => {
    expect(canMove(0, "down", baseContext)).toBe(true);
    expect(canMove(0, "down", { ...baseContext, colCount: 0 })).toBe(false);
  });

  it("allows entering cards when cards exist", () => {
    expect(canMove(1, "down", baseContext)).toBe(true);
    expect(canMove(1, "down", { ...baseContext, cardCount: 0 })).toBe(false);
  });

  it("respects column boundaries", () => {
    expect(canMove(1, "left", { ...baseContext, colIndex: 0 })).toBe(false);
    expect(canMove(1, "left", { ...baseContext, colIndex: 1 })).toBe(true);
    expect(canMove(1, "right", { ...baseContext, colIndex: 2 })).toBe(false);
    expect(canMove(1, "right", { ...baseContext, colIndex: 1 })).toBe(true);
  });

  it("respects card boundaries", () => {
    expect(canMove(2, "up", { ...baseContext, cardIndex: 0 })).toBe(true); // exits to column
    expect(canMove(2, "down", { ...baseContext, cardIndex: 4 })).toBe(false);
    expect(canMove(2, "down", { ...baseContext, cardIndex: 3 })).toBe(true);
  });
});
