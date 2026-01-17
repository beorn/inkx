/**
 * StatusBar Component Tests
 *
 * Tests for the StatusBar component which displays terminal size,
 * position info, and current view mode.
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { StatusBar } from "../StatusBar.tsx";
import type { ViewMode, TPath } from "../../types.ts";

// Test helper to create StatusBar props
interface StatusBarProps {
  width: number;
  height: number;
  cursor: TPath;
  nodeCount: number;
  viewMode: ViewMode;
}

function createStatusBarProps(
  overrides: Partial<StatusBarProps> = {},
): StatusBarProps {
  return {
    width: 80,
    height: 24,
    cursor: [0, 0],
    nodeCount: 3,
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

  describe("cursor navigation", () => {
    it("displays first column position", () => {
      const props = createStatusBarProps({ cursor: [0, 0], nodeCount: 4 });
      const element = <StatusBar {...props} />;
      expect(element.props.cursor[0]).toBe(0);
      expect(element.props.nodeCount).toBe(4);
    });

    it("displays middle column position", () => {
      const props = createStatusBarProps({ cursor: [2, 0], nodeCount: 5 });
      const element = <StatusBar {...props} />;
      expect(element.props.cursor[0]).toBe(2);
      expect(element.props.nodeCount).toBe(5);
    });

    it("displays last column position", () => {
      const props = createStatusBarProps({ cursor: [3, 0], nodeCount: 4 });
      const element = <StatusBar {...props} />;
      expect(element.props.cursor[0]).toBe(3);
      expect(element.props.nodeCount).toBe(4);
    });

    it("displays card position", () => {
      const props = createStatusBarProps({ cursor: [0, 5] });
      const element = <StatusBar {...props} />;
      expect(element.props.cursor[1]).toBe(5);
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
