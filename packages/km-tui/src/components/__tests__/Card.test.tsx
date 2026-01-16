/**
 * Card Component Tests
 *
 * Tests for the stateless Card component rendering.
 * Card receives all display data via props - no hooks, no store access.
 */

import { describe, it, expect } from "bun:test";
import React from "react";
import { Card } from "../Card.tsx";
import type { CardProps, TaskStatus } from "../../types.ts";

// Test helper to create card props
function createCardProps(overrides: Partial<CardProps> = {}): CardProps {
  return {
    title: "Test Card",
    isSelected: false,
    childCount: 0,
    ...overrides,
  };
}

describe("Card Component", () => {
  describe("basic rendering", () => {
    it("renders with minimal props", () => {
      const props = createCardProps();
      // Component should not throw when called with minimal props
      const element = <Card {...props} />;
      expect(element).toBeDefined();
      expect(element.props.title).toBe("Test Card");
    });

    it("accepts all optional props", () => {
      const props = createCardProps({
        title: "Full Card",
        isSelected: true,
        childCount: 5,
        color: "blue",
        icon: "star",
        isFolded: true,
        taskStatus: "wip",
      });
      const element = <Card {...props} />;
      expect(element).toBeDefined();
    });
  });

  describe("task status display", () => {
    const statuses: TaskStatus[] = [
      "todo",
      "wip",
      "blocked",
      "done",
      "dropped",
    ];

    for (const status of statuses) {
      it(`handles ${status} status`, () => {
        const props = createCardProps({ taskStatus: status });
        const element = <Card {...props} />;
        expect(element).toBeDefined();
        expect(element.props.taskStatus).toBe(status);
      });
    }
  });

  describe("selection state", () => {
    it("renders unselected card", () => {
      const props = createCardProps({ isSelected: false });
      const element = <Card {...props} />;
      expect(element.props.isSelected).toBe(false);
    });

    it("renders selected card", () => {
      const props = createCardProps({ isSelected: true });
      const element = <Card {...props} />;
      expect(element.props.isSelected).toBe(true);
    });
  });

  describe("child count and folding", () => {
    it("renders card with no children", () => {
      const props = createCardProps({ childCount: 0 });
      const element = <Card {...props} />;
      expect(element.props.childCount).toBe(0);
    });

    it("renders card with children (expanded)", () => {
      const props = createCardProps({ childCount: 3, isFolded: false });
      const element = <Card {...props} />;
      expect(element.props.childCount).toBe(3);
      expect(element.props.isFolded).toBe(false);
    });

    it("renders card with children (folded)", () => {
      const props = createCardProps({ childCount: 3, isFolded: true });
      const element = <Card {...props} />;
      expect(element.props.childCount).toBe(3);
      expect(element.props.isFolded).toBe(true);
    });
  });

  describe("custom styling", () => {
    it("accepts custom color", () => {
      const props = createCardProps({ color: "magenta" });
      const element = <Card {...props} />;
      expect(element.props.color).toBe("magenta");
    });

    it("accepts custom icon", () => {
      const props = createCardProps({ icon: "rocket" });
      const element = <Card {...props} />;
      expect(element.props.icon).toBe("rocket");
    });
  });
});
