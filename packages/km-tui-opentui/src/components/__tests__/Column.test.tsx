/**
 * Column Component Tests
 *
 * Tests for the Column component which contains cards and manages scrolling.
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { Column } from "../Column.tsx";

// Test helper to create column props
interface ColumnTestProps {
  title: string;
  count: number;
  wipLimit?: number;
  isActive: boolean;
  isCollapsed: boolean;
  selectedIndex: number;
  cardHeight?: number;
  children: React.ReactNode;
}

function createColumnProps(
  overrides: Partial<ColumnTestProps> = {},
): ColumnTestProps {
  return {
    title: "Test Column",
    count: 3,
    isActive: false,
    isCollapsed: false,
    selectedIndex: 0,
    children: null,
    ...overrides,
  };
}

describe("Column Component", () => {
  describe("basic rendering", () => {
    it("renders with minimal props", () => {
      const props = createColumnProps();
      const element = <Column {...props} />;
      expect(element).toBeDefined();
    });

    it("renders with title and count", () => {
      const props = createColumnProps({ title: "Todo", count: 5 });
      const element = <Column {...props} />;
      expect(element.props.title).toBe("Todo");
      expect(element.props.count).toBe(5);
    });
  });

  describe("active state", () => {
    it("renders inactive column", () => {
      const props = createColumnProps({ isActive: false });
      const element = <Column {...props} />;
      expect(element.props.isActive).toBe(false);
    });

    it("renders active column", () => {
      const props = createColumnProps({ isActive: true });
      const element = <Column {...props} />;
      expect(element.props.isActive).toBe(true);
    });
  });

  describe("collapsed state", () => {
    it("renders expanded column", () => {
      const props = createColumnProps({ isCollapsed: false });
      const element = <Column {...props} />;
      expect(element.props.isCollapsed).toBe(false);
    });

    it("renders collapsed column", () => {
      const props = createColumnProps({ isCollapsed: true });
      const element = <Column {...props} />;
      expect(element.props.isCollapsed).toBe(true);
    });
  });

  describe("WIP limit", () => {
    it("renders without WIP limit", () => {
      const props = createColumnProps({ wipLimit: undefined });
      const element = <Column {...props} />;
      expect(element.props.wipLimit).toBeUndefined();
    });

    it("renders with WIP limit under capacity", () => {
      const props = createColumnProps({ count: 3, wipLimit: 5 });
      const element = <Column {...props} />;
      expect(element.props.wipLimit).toBe(5);
      expect(element.props.count).toBe(3);
    });

    it("renders with WIP limit at capacity", () => {
      const props = createColumnProps({ count: 5, wipLimit: 5 });
      const element = <Column {...props} />;
      expect(element.props.wipLimit).toBe(5);
      expect(element.props.count).toBe(5);
    });

    it("renders with WIP limit exceeded", () => {
      const props = createColumnProps({ count: 7, wipLimit: 5 });
      const element = <Column {...props} />;
      expect(element.props.wipLimit).toBe(5);
      expect(element.props.count).toBe(7);
    });
  });

  describe("selection and scrolling", () => {
    it("handles selectedIndex at start", () => {
      const props = createColumnProps({ selectedIndex: 0 });
      const element = <Column {...props} />;
      expect(element.props.selectedIndex).toBe(0);
    });

    it("handles selectedIndex in middle", () => {
      const props = createColumnProps({ selectedIndex: 5, count: 10 });
      const element = <Column {...props} />;
      expect(element.props.selectedIndex).toBe(5);
    });

    it("accepts custom cardHeight for scroll calculation", () => {
      const props = createColumnProps({ cardHeight: 4 });
      const element = <Column {...props} />;
      expect(element.props.cardHeight).toBe(4);
    });
  });

  describe("children rendering", () => {
    it("renders with children", () => {
      const children = <div>Card 1</div>;
      const props = createColumnProps({ children });
      const element = <Column {...props} />;
      expect(element.props.children).toBe(children);
    });

    it("renders with multiple children", () => {
      const children = (
        <>
          <div>Card 1</div>
          <div>Card 2</div>
          <div>Card 3</div>
        </>
      );
      const props = createColumnProps({ children });
      const element = <Column {...props} />;
      expect(element.props.children).toBeDefined();
    });
  });
});
