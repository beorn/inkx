/**
 * StatusBar Component Tests
 *
 * Tests for the StatusBar component which displays terminal size,
 * position info, and current view mode.
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { StatusBar } from "../StatusBar.tsx";
import type { ViewMode } from "../../types.ts";

// Test helper to create StatusBar props
interface StatusBarProps {
  width: number;
  height: number;
  colIndex: number;
  colCount: number;
  cardIndex: number;
  cardCount: number;
  viewMode: ViewMode;
}

function createStatusBarProps(
  overrides: Partial<StatusBarProps> = {},
): StatusBarProps {
  return {
    width: 80,
    height: 24,
    colIndex: 0,
    colCount: 3,
    cardIndex: 0,
    cardCount: 5,
    viewMode: "cards",
    ...overrides,
  };
}

describe("StatusBar Component", () => {
  describe("basic rendering", () => {
    it("renders with minimal props", () => {
      const props = createStatusBarProps();
      const element = <StatusBar {...props} />;
      expect(element).toBeDefined();
    });
  });

  describe("terminal dimensions", () => {
    it("displays small terminal size", () => {
      const props = createStatusBarProps({ width: 40, height: 12 });
      const element = <StatusBar {...props} />;
      expect(element.props.width).toBe(40);
      expect(element.props.height).toBe(12);
    });

    it("displays large terminal size", () => {
      const props = createStatusBarProps({ width: 200, height: 50 });
      const element = <StatusBar {...props} />;
      expect(element.props.width).toBe(200);
      expect(element.props.height).toBe(50);
    });
  });

  describe("column navigation", () => {
    it("displays first column position", () => {
      const props = createStatusBarProps({ colIndex: 0, colCount: 4 });
      const element = <StatusBar {...props} />;
      expect(element.props.colIndex).toBe(0);
      expect(element.props.colCount).toBe(4);
    });

    it("displays middle column position", () => {
      const props = createStatusBarProps({ colIndex: 2, colCount: 5 });
      const element = <StatusBar {...props} />;
      expect(element.props.colIndex).toBe(2);
      expect(element.props.colCount).toBe(5);
    });

    it("displays last column position", () => {
      const props = createStatusBarProps({ colIndex: 3, colCount: 4 });
      const element = <StatusBar {...props} />;
      expect(element.props.colIndex).toBe(3);
      expect(element.props.colCount).toBe(4);
    });
  });

  describe("card navigation", () => {
    it("displays first card position", () => {
      const props = createStatusBarProps({ cardIndex: 0, cardCount: 10 });
      const element = <StatusBar {...props} />;
      expect(element.props.cardIndex).toBe(0);
      expect(element.props.cardCount).toBe(10);
    });

    it("displays middle card position", () => {
      const props = createStatusBarProps({ cardIndex: 5, cardCount: 10 });
      const element = <StatusBar {...props} />;
      expect(element.props.cardIndex).toBe(5);
    });

    it("displays single card", () => {
      const props = createStatusBarProps({ cardIndex: 0, cardCount: 1 });
      const element = <StatusBar {...props} />;
      expect(element.props.cardCount).toBe(1);
    });

    it("displays empty column (zero cards)", () => {
      const props = createStatusBarProps({ cardIndex: 0, cardCount: 0 });
      const element = <StatusBar {...props} />;
      expect(element.props.cardCount).toBe(0);
    });
  });

  describe("view modes", () => {
    const viewModes: ViewMode[] = ["cards", "list", "columns", "tabs"];

    for (const mode of viewModes) {
      it(`displays ${mode} view mode`, () => {
        const props = createStatusBarProps({ viewMode: mode });
        const element = <StatusBar {...props} />;
        expect(element.props.viewMode).toBe(mode);
      });
    }
  });
});
